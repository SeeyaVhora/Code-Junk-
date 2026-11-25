import type { NextFunction, Request, Response } from "express";
import { forbidden } from "../lib/errors.ts";
import { safeEqual } from "../lib/tokens.ts";
import { CSRF_COOKIE, CSRF_HEADER } from "./cookies.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth, on top of SameSite=Lax cookies:
 *  1. Origin check: if the browser sends Origin, it must be an allowed origin.
 *  2. Double-submit: the X-CSRF-Token header must equal the CSRF cookie. A cross-site
 *     page can't read our cookie, so it can't forge the header.
 *  3. Session binding: when signed in, the token must also equal the session's secret,
 *     so a token planted before sign-in is useless afterwards.
 */
export function csrfProtection(allowedOrigins: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get("origin");
    if (origin && !allowedOrigins.includes(origin)) {
      return next(forbidden("CSRF_ORIGIN", "Request origin not allowed."));
    }

    const header = req.get(CSRF_HEADER);
    const cookie: unknown = req.cookies?.[CSRF_COOKIE];
    if (!header || typeof cookie !== "string" || !safeEqual(header, cookie)) {
      return next(forbidden("CSRF_INVALID", "Your session token is missing or expired. Refresh the page and try again."));
    }
    if (req.auth && !safeEqual(header, req.auth.csrfSecret)) {
      return next(forbidden("CSRF_INVALID", "Your session token is missing or expired. Refresh the page and try again."));
    }
    next();
  };
}
