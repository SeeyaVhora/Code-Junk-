import { Router, type Request, type RequestHandler } from "express";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@code-junk/shared";
import { randomToken } from "../../lib/tokens.ts";
import { notFound } from "../../lib/errors.ts";
import { CSRF_COOKIE, clearSessionCookie, setCsrfCookie, setSessionCookie } from "../../middleware/cookies.ts";
import { authOf, requireAuth } from "../../middleware/session.ts";
import type { Mailer } from "../../mail/mailer.ts";
import * as auth from "./service.ts";

interface AuthRouterDeps {
  mailer: Mailer;
  webOrigin: string;
  limiters: Record<"signin" | "signup" | "forgot" | "reset", RequestHandler>;
}

const meta = (req: Request) => ({ userAgent: req.get("user-agent"), ip: req.ip });

export function authRouter({ mailer, webOrigin, limiters }: AuthRouterDeps) {
  const r = Router();

  /** Issues the CSRF cookie the SPA needs before its first POST. Safe to call repeatedly. */
  r.get("/csrf", (req, res) => {
    const existing: unknown = req.cookies?.[CSRF_COOKIE];
    const token = req.auth?.csrfSecret ?? (typeof existing === "string" && existing.length >= 20 ? existing : randomToken());
    setCsrfCookie(res, token);
    res.json({ csrfToken: token });
  });

  r.post("/signup", limiters.signup, async (req, res) => {
    const input = signUpSchema.parse(req.body);
    const { user, session } = await auth.signUp(input, meta(req));
    setSessionCookie(res, session.token);
    setCsrfCookie(res, session.csrfSecret); // rotate on privilege change
    res.status(201).json({ user, csrfToken: session.csrfSecret });
  });

  r.post("/signin", limiters.signin, async (req, res) => {
    const input = signInSchema.parse(req.body);
    const { user, session } = await auth.signIn(input, meta(req));
    // Replace rather than stack sessions, but only once the new credentials are proven.
    if (req.auth) await auth.signOut(req.auth.sessionId);
    setSessionCookie(res, session.token);
    setCsrfCookie(res, session.csrfSecret);
    res.json({ user, csrfToken: session.csrfSecret });
  });

  r.post("/signout", async (req, res) => {
    if (req.auth) await auth.signOut(req.auth.sessionId);
    clearSessionCookie(res);
    const fresh = randomToken();
    setCsrfCookie(res, fresh);
    res.json({ csrfToken: fresh });
  });

  r.post("/forgot-password", limiters.forgot, async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await auth.requestPasswordReset(email, mailer, webOrigin);
    res.status(202).json({ ok: true });
  });

  r.post("/reset-password", limiters.reset, async (req, res) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await auth.resetPassword(token, password);
    if (req.auth) clearSessionCookie(res); // all sessions were revoked
    res.status(204).end();
  });

  r.get("/me", requireAuth, async (req, res) => {
    const user = await auth.getUser(authOf(req).userId);
    if (!user) throw notFound("Account not found.");
    res.json({ user });
  });

  return r;
}
