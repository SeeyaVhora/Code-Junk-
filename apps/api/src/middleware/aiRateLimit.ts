import { rateLimit } from "express-rate-limit";

/** Per-user AI cost protection: limits are keyed by account, not IP. */
export function aiRateLimit(kind: "generate" | "evaluate", limitPerHour: number) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: limitPerHour,
    identifier: `ai-${kind}`,
    keyGenerator: (req) => req.auth?.userId ?? "anonymous",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "AI_RATE_LIMITED",
          message:
            kind === "generate"
              ? "You've generated a lot in the last hour. Please wait a little before generating more."
              : "Too many AI evaluations in the last hour. Please wait a little.",
        },
      });
    },
  });
}
