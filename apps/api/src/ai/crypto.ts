import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.ts";

/** AES-256-GCM for users' own AI keys at rest. Format: base64(iv).base64(tag).base64(ciphertext). */
const key = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, "base64").subarray(0, 32);

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string) {
  const [iv, tag, ct] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !ct) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
