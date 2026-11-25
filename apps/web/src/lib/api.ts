import type { ApiErrorBody } from "@code-junk/shared";

/** Error thrown for any non-2xx API response, carrying the server's error envelope. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field errors from a VALIDATION_ERROR response, keyed by field path. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== "VALIDATION_ERROR" || !Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as { path: string; message: string }[]) out[d.path] ??= d.message;
    return out;
  }
}

const CSRF_COOKIE = /(?:^|;\s*)(?:__Host-)?cj_csrf=([^;]+)/;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCsrfCookie() {
  const m = document.cookie.match(CSRF_COOKIE);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

let csrfPromise: Promise<string> | null = null;
/** Ensures a CSRF cookie exists, fetching one at most once at a time. */
async function ensureCsrf(force = false): Promise<string> {
  const existing = readCsrfCookie();
  if (existing && !force) return existing;
  csrfPromise ??= fetch("/api/auth/csrf", { credentials: "same-origin" })
    .then((r) => r.json() as Promise<{ csrfToken: string }>)
    .then((b) => b.csrfToken)
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

async function toError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* non-JSON (e.g. proxy error page) */
  }
  if (body?.error) return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return new ApiError(res.status, "UNAVAILABLE", "Can't reach the Code Junk server. Check that it's running and try again.");
  }
  return new ApiError(res.status, "UNKNOWN", "Something went wrong. Please try again.");
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (MUTATING.has(method)) headers["x-csrf-token"] = await ensureCsrf();

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "You appear to be offline. Check your connection and try again.");
  }

  if (!res.ok) {
    const err = await toError(res);
    // A stale CSRF token (e.g. after signing in on another tab): refresh once and retry.
    if (err.code === "CSRF_INVALID" && !retried) {
      await ensureCsrf(true);
      return api<T>(path, init, true);
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
