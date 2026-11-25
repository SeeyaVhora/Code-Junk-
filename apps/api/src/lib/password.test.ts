import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.ts";

describe("password hashing", () => {
  it("produces a salted argon2id PHC string", async () => {
    const a = await hashPassword("correct horse 1");
    const b = await hashPassword("correct horse 1");
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(a).not.toBe(b); // unique salt per hash
  });

  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("correct horse 1");
    expect(await verifyPassword(h, "correct horse 1")).toBe(true);
    expect(await verifyPassword(h, "correct horse 2")).toBe(false);
    expect(await verifyPassword(h, "")).toBe(false);
  });

  it("verifies hashes made by other argon2 libraries (RFC 9106 reference format)", async () => {
    // Generated with the `argon2` npm package: hash("password", { type: argon2id, m: 19456, t: 2, p: 1 }).
    const external = "$argon2id$v=19$m=19456,t=2,p=1$9EHrJld0iy1yoYqu1w1iLw$hsgwSSswJMRnm11amG/7iOJDpMAa3UxDHRGjBuKQxNg";
    expect(await verifyPassword(external, "password")).toBe(true);
    expect(await verifyPassword(external, "Password")).toBe(false);
  });

  it("treats malformed or hostile hashes as a non-match", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
    expect(await verifyPassword("$argon2i$v=19$m=19456,t=2,p=1$AAAA$BBBB", "x")).toBe(false);
    expect(await verifyPassword("$argon2id$v=19$m=99999999,t=2,p=1$vk3oBZG/wQXYS4ZrLTeL3w$ExDtc3wv5GvpAtQ0Aa0O97jzZmw5ddeyZtXlyjZJBs8", "x")).toBe(false);
  });
});
