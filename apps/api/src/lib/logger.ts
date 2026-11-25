import { pino } from "pino";
import { env, isProd, isTest } from "../config/env.ts";

/**
 * Structured logger. Credentials, cookies, CSRF tokens and passwords are redacted
 * wherever they appear in logged objects.
 */
export const logger = pino({
  level: env.LOG_LEVEL ?? (isTest ? "silent" : isProd ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.apiKey",
    ],
    censor: "[redacted]",
  },
  ...(isProd || isTest ? {} : { transport: { target: "pino-pretty", options: { colorize: true, ignore: "pid,hostname" } } }),
});
