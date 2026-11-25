import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.ts";
import { logger } from "./lib/logger.ts";
import { createMailer, type Mailer } from "./mail/mailer.ts";
import { loadSession } from "./middleware/session.ts";
import { csrfProtection } from "./middleware/csrf.ts";
import { DEFAULT_AUTH_LIMITS, authRateLimit, type AuthAction } from "./middleware/rateLimit.ts";
import { errorHandler, notFoundHandler } from "./middleware/error.ts";
import { authRouter } from "./modules/auth/routes.ts";
import { aiRateLimit } from "./middleware/aiRateLimit.ts";
import { collectionsRouter, subjectsRouter, tagsRouter, topicsRouter } from "./modules/subjects/routes.ts";
import { snippetsRouter } from "./modules/snippets/routes.ts";
import { questionsRouter } from "./modules/questions/routes.ts";
import { attemptsRouter, quizzesRouter } from "./modules/quizzes/routes.ts";
import { aiRouter, revisionRouter } from "./modules/revision/routes.ts";
import { documentsRouter } from "./modules/documents/routes.ts";
import { paperAttemptsRouter, papersRouter } from "./modules/papers/routes.ts";
import { plannerRouter } from "./modules/planner/routes.ts";
import { calendarRouter } from "./modules/calendar/routes.ts";
import { notificationsRouter } from "./modules/notifications/routes.ts";
import { analyticsRouter, dashboardRouter } from "./modules/analytics/routes.ts";
import { searchRouter, usersRouter } from "./modules/users/routes.ts";

export interface AppOptions {
  mailer?: Mailer;
  /** Overrides for credential attempts per IP per 15 minutes (see DEFAULT_AUTH_LIMITS). */
  authLimits?: Partial<Record<AuthAction, number>>;
  /** Overrides for AI requests per user per hour. */
  aiLimits?: { generate?: number; evaluate?: number };
}

export function createApp(opts: AppOptions = {}) {
  const app = express();
  const mailer = opts.mailer ?? createMailer();

  // The SPA reaches us through a same-origin proxy (Vite in dev, reverse proxy in prod).
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers["x-request-id"] as string | undefined)?.slice(0, 64) ?? randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", loadSession, csrfProtection([env.WEB_ORIGIN]));
  const limits = { ...DEFAULT_AUTH_LIMITS, ...opts.authLimits };
  const limiters = {
    signin: authRateLimit("signin", limits.signin),
    signup: authRateLimit("signup", limits.signup),
    forgot: authRateLimit("forgot", limits.forgot),
    reset: authRateLimit("reset", limits.reset),
  };
  app.use("/api/auth", authRouter({ mailer, webOrigin: env.WEB_ORIGIN, limiters }));

  // AI cost protection, per user per hour.
  const ai = { generate: aiRateLimit("generate", opts.aiLimits?.generate ?? 30), evaluate: aiRateLimit("evaluate", opts.aiLimits?.evaluate ?? 300) };

  app.use("/api/users", usersRouter());
  app.use("/api/search", searchRouter());
  app.use("/api/dashboard", dashboardRouter());
  app.use("/api/subjects", subjectsRouter());
  app.use("/api/topics", topicsRouter());
  app.use("/api/collections", collectionsRouter());
  app.use("/api/tags", tagsRouter());
  app.use("/api/snippets", snippetsRouter());
  app.use("/api/questions", questionsRouter());
  app.use("/api/ai", aiRouter());
  app.use("/api/quizzes", quizzesRouter(ai));
  app.use("/api/attempts", attemptsRouter(ai));
  app.use("/api/revision", revisionRouter());
  app.use("/api/documents", documentsRouter(ai));
  app.use("/api/papers", papersRouter(ai));
  app.use("/api/paper-attempts", paperAttemptsRouter(ai));
  app.use("/api/planner", plannerRouter());
  app.use("/api/calendar", calendarRouter());
  app.use("/api/notifications", notificationsRouter());
  app.use("/api/analytics", analyticsRouter());

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
