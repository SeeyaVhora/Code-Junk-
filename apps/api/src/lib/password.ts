import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Argon2id password hashing with OWASP-recommended parameters (19 MiB, 2 passes, 1 lane),
 * using Node's built-in implementation (OpenSSL 3.5, Node >= 24.7).
 *
 * Why built-in: both third-party native bindings (`@node-rs/argon2`, `argon2`) crashed the
 * process intermittently on Windows (0xC0000409) under the full HTTP stack; the built-in
 * did not. See docs/ARCHITECTURE.md §2.
 *
 * Hashes are standard PHC strings, so they stay verifiable by any Argon2 library and
 * parameters can be raised later without breaking existing hashes:
 *   $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>   (unpadded base64)
 */
const argon2Async = promisify(argon2);

const PARAMS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SALT_BYTES = 16;

const b64 = (buf: Buffer) => buf.toString("base64").replace(/=+$/, "");

async function derive(password: string, nonce: Buffer, p: { memory: number; passes: number; parallelism: number; tagLength: number }) {
  return argon2Async("argon2id", { message: password, nonce, ...p });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, PARAMS);
  return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(hash)}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const m = PHC.exec(stored);
  if (!m) return false; // malformed hash: a failed match, never a server error
  const [, mem, passes, lanes, saltB64, hashB64] = m;
  const expected = Buffer.from(hashB64!, "base64");
  const params = {
    memory: Number(mem),
    passes: Number(passes),
    parallelism: Number(lanes),
    tagLength: expected.length,
  };
  // Refuse absurd parameters from a tampered row rather than burn memory/CPU on them.
  if (params.memory > 1 << 20 || params.passes > 20 || params.parallelism > 16 || expected.length < 16) return false;

  const actual = await derive(password, Buffer.from(saltB64!, "base64"), params);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Verified against when an email isn't registered, so response time doesn't reveal which emails exist.
let dummy: Promise<string> | null = null;
export async function burnVerifyTime(password: string) {
  dummy ??= hashPassword("code-junk-timing-equaliser");
  await verifyPassword(await dummy, password);
}
