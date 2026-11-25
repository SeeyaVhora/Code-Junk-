import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

// One .env at the repository root. Values already in process.env (e.g. set by tests or the host) win.
config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)), quiet: true });

const base64Key = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .refine((v) => Buffer.from(v, "base64").length >= 32, `${name} must be at least 32 bytes, base64-encoded`);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4100),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  DATABASE_URL: z.string().startsWith("postgres"),
  SESSION_SECRET: base64Key("SESSION_SECRET"),
  CREDENTIALS_ENCRYPTION_KEY: base64Key("CREDENTIALS_ENCRYPTION_KEY"),
  OPENAI_API_KEY: z.string().optional().transform((v) => v || undefined),
  OPENAI_MODEL: z.string().optional().transform((v) => v || "gpt-5-mini"),
  GEMINI_API_KEY: z.string().optional().transform((v) => v || undefined),
  GEMINI_MODEL: z.string().optional().transform((v) => v || "gemini-2.5-flash"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300_000).default(90_000),
  STORAGE_DISK_PATH: z.string().default("./storage"),
  SMTP_URL: z.string().optional().transform((v) => v || undefined),
  MAIL_FROM: z.string().default("Code Junk <no-reply@example.com>"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable list; never print the values themselves.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
