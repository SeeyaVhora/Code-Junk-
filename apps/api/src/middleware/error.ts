import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

/** Single place that turns thrown errors into the `{ error: { code, message, details? } }` envelope. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Some fields are invalid.",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // body-parser errors (malformed JSON, payload too large) carry an HTTP status.
  const status = (err as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: { code: "BAD_REQUEST", message: "The request could not be read." } });
    return;
  }

  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } });
}
