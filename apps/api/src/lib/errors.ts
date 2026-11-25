/** An expected, user-facing failure. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Please sign in to continue.") => new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
/** Also used for resources owned by another user, so their existence is never revealed. */
export const notFound = (message = "Not found.") => new AppError(404, "NOT_FOUND", message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
