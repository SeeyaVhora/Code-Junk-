import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../lib/prisma.ts";
import { browser, makeApp, resetDatabase, validUser } from "../../../test/helpers.ts";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

function resetLinkToken(text: string) {
  const m = text.match(/reset-password\?token=([^\s]+)/);
  if (!m?.[1]) throw new Error("no reset link in email");
  return decodeURIComponent(m[1]);
}

describe("sign up", () => {
  it("creates the account, preferences and a session", async () => {
    const { app } = makeApp();
    const b = await browser(app);

    const res = await b.post("/api/auth/signup", { ...validUser, email: "  ADA@Example.com " });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "ada@example.com", name: "Ada Lovelace" });
    expect(res.body.user.preferences.timeZone).toBe("Europe/London");
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|analytical1843/);

    const me = await b.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("ada@example.com");

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("sets an httpOnly session cookie and a readable CSRF cookie", async () => {
    const { app } = makeApp();
    const b = await browser(app);
    const res = await b.post("/api/auth/signup", validUser);
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(cookies.find((c) => c.startsWith("cj_session="))).toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith("cj_session="))).toMatch(/SameSite=Lax/i);
    expect(cookies.find((c) => c.startsWith("cj_csrf="))).not.toMatch(/HttpOnly/i);
  });

  it("rejects a duplicate email with 409", async () => {
    const { app } = makeApp();
    await (await browser(app)).post("/api/auth/signup", validUser);
    const res = await (await browser(app)).post("/api/auth/signup", { ...validUser, email: "Ada@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("validates input and reports field errors", async () => {
    const { app } = makeApp();
    const res = await (await browser(app)).post("/api/auth/signup", {
      name: "",
      email: "not-an-email",
      password: "short",
      timeZone: "Mars/Olympus",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "email", "password", "timeZone"]));
  });
});

describe("sign in / sign out", () => {
  it("signs in with correct credentials and out again", async () => {
    const { app } = makeApp();
    await (await browser(app)).post("/api/auth/signup", validUser);

    const b = await browser(app);
    const res = await b.post("/api/auth/signin", { email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect((await b.get("/api/auth/me")).status).toBe(200);

    expect((await b.post("/api/auth/signout")).status).toBe(200);
    expect((await b.get("/api/auth/me")).status).toBe(401);
    expect(await prisma.session.count()).toBe(1); // only the sign-up session remains
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const { app } = makeApp();
    await (await browser(app)).post("/api/auth/signup", validUser);
    const b = await browser(app);
    const wrong = await b.post("/api/auth/signin", { email: validUser.email, password: "nope-nope-1" });
    const unknown = await b.post("/api/auth/signin", { email: "nobody@example.com", password: "nope-nope-1" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("returns 401 from /me without a session", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an expired session", async () => {
    const { app } = makeApp();
    const b = await browser(app);
    await b.post("/api/auth/signup", validUser);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await b.get("/api/auth/me")).status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });
});

describe("CSRF protection", () => {
  it("rejects mutating requests without the token header", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/auth/signup").send(validUser);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_INVALID");
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects a header that does not match the cookie", async () => {
    const { app } = makeApp();
    const b = await browser(app);
    const res = await b.agent.post("/api/auth/signup").set("x-csrf-token", "x".repeat(43)).send(validUser);
    expect(res.status).toBe(403);
  });

  it("rejects a cross-origin request", async () => {
    const { app } = makeApp();
    const b = await browser(app);
    const res = await b.agent
      .post("/api/auth/signup")
      .set("x-csrf-token", b.csrf)
      .set("origin", "https://evil.example")
      .send(validUser);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_ORIGIN");
  });

  it("does not accept the pre-sign-in token after signing in", async () => {
    const { app } = makeApp();
    const b = await browser(app);
    const before = b.csrf;
    await b.post("/api/auth/signup", validUser);
    expect(b.csrf).not.toBe(before);
    const res = await b.agent.post("/api/auth/signout").set("x-csrf-token", before).set("cookie", `cj_csrf=${before}`);
    expect(res.status).toBe(403);
  });
});

describe("password reset", () => {
  it("emails a link, resets the password and signs out every session", async () => {
    const { app, mailer } = makeApp();
    const signedIn = await browser(app);
    await signedIn.post("/api/auth/signup", validUser);

    const b = await browser(app);
    expect((await b.post("/api/auth/forgot-password", { email: "ADA@example.com" })).status).toBe(202);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe("ada@example.com");
    const token = resetLinkToken(mailer.sent[0]!.text);

    const reset = await b.post("/api/auth/reset-password", { token, password: "difference-engine-2" });
    expect(reset.status).toBe(204);

    expect((await signedIn.get("/api/auth/me")).status).toBe(401);
    expect((await b.post("/api/auth/signin", { email: validUser.email, password: validUser.password })).status).toBe(401);
    expect((await b.post("/api/auth/signin", { email: validUser.email, password: "difference-engine-2" })).status).toBe(200);

    // The link only works once.
    const again = await b.post("/api/auth/reset-password", { token, password: "another-pass-3" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("RESET_TOKEN_INVALID");
  });

  it("responds identically for unknown emails and sends nothing", async () => {
    const { app, mailer } = makeApp();
    const res = await (await browser(app)).post("/api/auth/forgot-password", { email: "ghost@example.com" });
    expect(res.status).toBe(202);
    expect(mailer.sent).toHaveLength(0);
  });

  it("rejects an expired link", async () => {
    const { app, mailer } = makeApp();
    const b = await browser(app);
    await b.post("/api/auth/signup", validUser);
    await b.post("/api/auth/forgot-password", { email: validUser.email });
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await b.post("/api/auth/reset-password", {
      token: resetLinkToken(mailer.sent[0]!.text),
      password: "difference-engine-2",
    });
    expect(res.status).toBe(400);
  });

  it("invalidates older links when a new one is requested", async () => {
    const { app, mailer } = makeApp();
    const b = await browser(app);
    await b.post("/api/auth/signup", validUser);
    await b.post("/api/auth/forgot-password", { email: validUser.email });
    await b.post("/api/auth/forgot-password", { email: validUser.email });
    const first = resetLinkToken(mailer.sent[0]!.text);
    const res = await b.post("/api/auth/reset-password", { token: first, password: "difference-engine-2" });
    expect(res.status).toBe(400);
  });
});

describe("rate limiting", () => {
  it("blocks repeated failed sign-in attempts", async () => {
    const { app } = makeApp({ authLimits: { signin: 3 } });
    const b = await browser(app);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await b.post("/api/auth/signin", { email: "x@example.com", password: "whatever-1" })).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it("does not count successful sign-ins", async () => {
    const { app } = makeApp({ authLimits: { signin: 2 } });
    await (await browser(app)).post("/api/auth/signup", validUser);
    const b = await browser(app);
    for (let i = 0; i < 4; i++) {
      const res = await b.post("/api/auth/signin", { email: validUser.email, password: validUser.password });
      expect(res.status).toBe(200);
    }
  });

  it("keeps a separate budget per action, so failed sign-ins don't block a reset", async () => {
    const { app } = makeApp({ authLimits: { signin: 2, forgot: 2 } });
    const b = await browser(app);
    for (let i = 0; i < 3; i++) await b.post("/api/auth/signin", { email: "x@example.com", password: "whatever-1" });
    expect((await b.post("/api/auth/signin", { email: "x@example.com", password: "whatever-1" })).status).toBe(429);
    expect((await b.post("/api/auth/forgot-password", { email: "x@example.com" })).status).toBe(202);
  });
});

describe("sign in while already signed in", () => {
  it("keeps the current session when the new credentials are wrong", async () => {
    const { app } = makeApp();
    const b = await browser(app);
    await b.post("/api/auth/signup", validUser);
    const res = await b.post("/api/auth/signin", { email: validUser.email, password: "wrong-password-9" });
    expect(res.status).toBe(401);
    expect((await b.get("/api/auth/me")).status).toBe(200);
  });
});

describe("errors", () => {
  it("returns a JSON 404 for unknown API routes", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for malformed JSON", async () => {
    const { app } = makeApp();
    const b = await browser(app);
    const res = await b.agent
      .post("/api/auth/signin")
      .set("x-csrf-token", b.csrf)
      .set("content-type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
  });
});
