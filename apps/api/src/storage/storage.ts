import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.ts";

/**
 * File storage behind a small interface. Local disk for now; an S3-compatible adapter
 * can implement the same three methods. Keys are generated here (never from user input),
 * so path traversal is impossible.
 */
export interface Storage {
  put(userId: string, data: Buffer, ext: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const root = resolve(process.cwd(), env.STORAGE_DISK_PATH);

function pathFor(key: string) {
  const p = resolve(root, key);
  if (!p.startsWith(root + sep)) throw new Error("Invalid storage key");
  return p;
}

export const diskStorage: Storage = {
  async put(userId, data, ext) {
    const key = `${userId}/${randomUUID()}${/^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ""}`;
    const p = pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return key;
  },
  get: (key) => readFile(pathFor(key)),
  async remove(key) {
    await rm(pathFor(key), { force: true });
  },
};
