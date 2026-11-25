import request from "supertest";
import { prisma } from "../src/lib/prisma.ts";
import { createApp } from "../src/app.ts";
import { MemoryMailer } from "../src/mail/mailer.ts";

/** Empties every application table (keeps the migrations table). */
export async function resetDatabase() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

const NO_LIMITS = { signin: 1000, signup: 1000, forgot: 1000, reset: 1000 };

export function makeApp(opts: { authLimits?: Partial<typeof NO_LIMITS> } = {}) {
  const mailer = new MemoryMailer();
  const app = createApp({ mailer, authLimits: { ...NO_LIMITS, ...opts.authLimits } });
  return { app, mailer };
}

/**
 * A cookie-keeping client that behaves like the SPA: fetches the CSRF cookie first
 * and echoes it in the X-CSRF-Token header on every mutating request.
 */
export async function browser(app: ReturnType<typeof makeApp>["app"]) {
  const agent = request.agent(app);
  let csrf = (await agent.get("/api/auth/csrf").expect(200)).body.csrfToken as string;

  const track = (res: request.Response) => {
    if (typeof res.body?.csrfToken === "string") csrf = res.body.csrfToken;
    return res;
  };

  return {
    agent,
    get csrf() {
      return csrf;
    },
    get: (url: string) => agent.get(url),
    post: async (url: string, body?: object) => track(await agent.post(url).set("x-csrf-token", csrf).send(body ?? {})),
  };
}

export const validUser = { name: "Ada Lovelace", email: "ada@example.com", password: "analytical1843", timeZone: "Europe/London" };
