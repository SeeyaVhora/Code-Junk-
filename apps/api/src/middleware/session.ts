import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.ts";
import { hashToken } from "../lib/tokens.ts";
import { unauthorized } from "../lib/errors.ts";
import { SESSION_COOKIE, SESSION_TTL_MS, clearSessionCookie, setSessionCookie } from "./cookies.ts";

/** Sliding expiry is refreshed at most this often, to avoid a DB write per request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** Resolves the session cookie into `req.auth`. Never rejects; use `requireAuth` for that. */
export async function loadSession(req: Request, res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return next();

  const id = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { id },
    select: { id: true, userId: true, csrfSecret: true, expiresAt: true, lastSeenAt: true },
  });

  const now = Date.now();
  if (!session || session.expiresAt.getTime() <= now) {
    if (session) await prisma.session.delete({ where: { id } }).catch(() => {});
    clearSessionCookie(res);
    return next();
  }

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({
      where: { id },
      data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) },
    });
    setSessionCookie(res, token);
  }

  req.auth = { userId: session.userId, sessionId: session.id, csrfSecret: session.csrfSecret };
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  next();
}

/** Narrow helper for handlers behind `requireAuth`. */
export function authOf(req: Request) {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
