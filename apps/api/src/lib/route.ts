import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/session.ts";
import { userCtx, type UserCtx } from "./context.ts";

type Handler = (ctx: UserCtx, req: Request, res: Response) => Promise<unknown>;

/**
 * Authenticated router whose handlers receive the user context. A returned value is
 * sent as JSON (201 for POST, 200 otherwise); `undefined` sends 204.
 */
export function authedRouter() {
  const r = Router();
  r.use(requireAuth);
  const wrap = (method: "get" | "post" | "patch" | "put" | "delete") => (path: string, handler: Handler) => {
    r[method](path, async (req, res) => {
      const ctx = await userCtx(req);
      const out = await handler(ctx, req, res);
      if (res.headersSent) return;
      if (out === undefined) res.status(204).end();
      else res.status(method === "post" ? 201 : 200).json(out);
    });
  };
  return {
    router: r,
    get: wrap("get"),
    post: wrap("post"),
    patch: wrap("patch"),
    put: wrap("put"),
    delete: wrap("delete"),
  };
}

export const param = (req: Request, name: string) => String(req.params[name] ?? "");
