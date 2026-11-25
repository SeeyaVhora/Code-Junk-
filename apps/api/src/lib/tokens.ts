import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.ts";

const secret = Buffer.from(env.SESSION_SECRET, "base64");

/** 256-bit URL-safe random token. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Keyed hash of a token for storage. A database leak alone cannot be turned back
 * into valid session cookies or reset links without SESSION_SECRET.
 */
export function hashToken(token: string) {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
