import { rateLimit } from "express-rate-limit";

export type AuthAction = "signin" | "signup" | "forgot" | "reset";

/** Attempts allowed per IP per 15 minutes, per action. Each action has its own budget, so
 * mistyping a password a few times never blocks the user from resetting it. */
export const DEFAULT_AUTH_LIMITS: Record<AuthAction, number> = {
  signin: 10, // failed attempts only
  signup: 10,
  forgot: 5,
  reset: 10,
};

/**
 * Brute-force protection for credential endpoints. Uses the in-memory store, which is
 * correct for a single API instance. Swap in a shared store (Postgres/Redis) before
 * running more than one instance (see docs/ARCHITECTURE.md §2).
 */
export function authRateLimit(action: AuthAction, limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    identifier: `auth-${action}`,
    // Successful sign-ins don't use up the budget; only failures (guessing) do.
    skipSuccessfulRequests: action === "signin",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes and try again." },
      });
    },
  });
}
