import "express";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by the session middleware when a valid session cookie is present. */
    auth?: {
      userId: string;
      sessionId: string;
      csrfSecret: string;
    };
  }
}
