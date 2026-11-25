import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("TEST_DATABASE_URL must be set (see .env.example).");
if (testDb === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: tests wipe it.");

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/globalSetup.ts"],
    env: { NODE_ENV: "test", DATABASE_URL: testDb },
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
