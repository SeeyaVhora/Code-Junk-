import type { CookieOptions, Response } from "express";
import { isProd } from "../config/env.ts";

/**
 * In production the `__Host-` prefix pins cookies to this exact host over HTTPS
 * with path=/, so subdomains cannot set or overwrite them.
 */
export const SESSION_COOKIE = isProd ? "__Host-cj_session" : "cj_session";
/** Readable by the SPA so it can echo the value in the X-CSRF-Token header. */
export const CSRF_COOKIE = isProd ? "__Host-cj_csrf" : "cj_csrf";
export const CSRF_HEADER = "x-csrf-token";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const base: CookieOptions = { path: "/", sameSite: "lax", secure: isProd };

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...base, httpOnly: true, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { ...base, httpOnly: true });
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, { ...base, httpOnly: false, maxAge: SESSION_TTL_MS });
}
