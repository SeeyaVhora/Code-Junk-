import type { z } from "zod";
import { AI_PROVIDERS, type AiProviderName } from "@code-junk/shared";
import { env, isTest } from "../config/env.ts";
import { prisma } from "../lib/prisma.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";
import { decryptSecret } from "./crypto.ts";
import { AiProviderError, geminiProvider, openAiProvider, type AiProvider } from "./provider.ts";

/*
 * The AI service layer: provider resolution (user's own key → server key), structured
 * JSON output validated with Zod, a repair retry on invalid output, retries with backoff
 * on transient failures, timeouts and usage logging (never prompts, answers or keys).
 */

let testOverride: ((name: AiProviderName) => AiProvider | null) | null = null;
/** Tests only: substitute a deterministic provider. Refuses to run outside NODE_ENV=test. */
export function setAiProviderForTests(fn: typeof testOverride) {
  if (!isTest) throw new Error("setAiProviderForTests is only available in tests");
  testOverride = fn;
}

interface ResolvedProvider {
  provider: AiProvider;
  usedOwnKey: boolean;
}

async function providerFor(userId: string, name: AiProviderName): Promise<ResolvedProvider | null> {
  if (testOverride) {
    const p = testOverride(name);
    return p ? { provider: p, usedOwnKey: false } : null;
  }
  const own = await prisma.aiCredential.findUnique({ where: { userId_provider: { userId, provider: name } } });
  if (own) {
    const key = decryptSecret(own.encryptedKey);
    const model = own.model ?? (name === "OPENAI" ? env.OPENAI_MODEL : env.GEMINI_MODEL);
    return { provider: name === "OPENAI" ? openAiProvider(key, model) : geminiProvider(key, model), usedOwnKey: true };
  }
  if (name === "OPENAI" && env.OPENAI_API_KEY) return { provider: openAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL), usedOwnKey: false };
  if (name === "GEMINI" && env.GEMINI_API_KEY) return { provider: geminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL), usedOwnKey: false };
  return null;
}

/** Which providers this user can use right now, and whether via their own key. */
export async function providerStatus(userId: string) {
  const own = await prisma.aiCredential.findMany({ where: { userId }, select: { provider: true, keyLast4: true, model: true } });
  return AI_PROVIDERS.map((name) => {
    const mine = own.find((o) => o.provider === name);
    const server = testOverride ? !!testOverride(name) : name === "OPENAI" ? !!env.OPENAI_API_KEY : !!env.GEMINI_API_KEY;
    return {
      provider: name,
      available: !!mine || server,
      source: mine ? ("own_key" as const) : server ? ("server" as const) : null,
      keyLast4: mine?.keyLast4 ?? null,
      model: mine?.model ?? (name === "OPENAI" ? env.OPENAI_MODEL : env.GEMINI_MODEL),
    };
  });
}

/** Picks the requested provider, else the user's default, else any available one. */
export async function resolveProvider(userId: string, preferred?: AiProviderName): Promise<ResolvedProvider | null> {
  const prefs = await prisma.userPreferences.findUnique({ where: { userId }, select: { aiProvider: true } });
  const order = [preferred, prefs?.aiProvider, ...AI_PROVIDERS].filter((p, i, a): p is AiProviderName => !!p && a.indexOf(p) === i);
  if (preferred) {
    const p = await providerFor(userId, preferred);
    if (!p) throw new AppError(409, "AI_NOT_CONFIGURED", `${preferred === "OPENAI" ? "OpenAI" : "Gemini"} isn't set up. Add an API key in Settings → AI providers.`);
    return p;
  }
  for (const name of order) {
    const p = await providerFor(userId, name);
    if (p) return p;
  }
  return null;
}

export async function requireProvider(userId: string, preferred?: AiProviderName) {
  const p = await resolveProvider(userId, preferred);
  if (!p) throw new AppError(409, "AI_NOT_CONFIGURED", "No AI provider is set up. Add an OpenAI or Gemini API key in Settings → AI providers.");
  return p;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Response was not JSON");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface StructuredRequest<T extends z.ZodType> {
  userId: string;
  resolved: ResolvedProvider;
  purpose: "generate_quiz" | "evaluate_answer" | "generate_paper" | "import_questions";
  promptVersion: string;
  system: string;
  user: string;
  schema: T;
  maxOutputTokens: number;
  temperature?: number;
}

/**
 * Sends the prompt and returns schema-valid data. Transient provider errors are retried
 * with backoff (2 retries); output that fails validation gets one repair attempt that
 * feeds the validation errors back. Every call is logged to AiRequestLog.
 */
export async function generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<{ data: z.infer<T>; requestId: string }> {
  const { provider, usedOwnKey } = req.resolved;
  const started = Date.now();
  let retries = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let userPrompt = req.user;
  let lastError: { code: string; message: string } = { code: "UNKNOWN", message: "Unknown error" };

  const log = (success: boolean, errorCode?: string) =>
    prisma.aiRequestLog.create({
      data: {
        userId: req.userId,
        provider: provider.name,
        model: provider.model,
        purpose: req.purpose,
        promptVersion: req.promptVersion,
        inputTokens: inputTokens || null,
        outputTokens: outputTokens || null,
        latencyMs: Date.now() - started,
        success,
        errorCode,
        retries,
        usedOwnKey,
      },
    });

  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
    try {
      const out = await provider.completeJson({
        system: req.system,
        user: userPrompt,
        maxOutputTokens: req.maxOutputTokens,
        temperature: req.temperature ?? 0.4,
        signal: controller.signal,
      });
      inputTokens += out.inputTokens ?? 0;
      outputTokens += out.outputTokens ?? 0;

      let parsed: unknown;
      try {
        parsed = extractJson(out.text);
      } catch {
        parsed = undefined;
      }
      const result = req.schema.safeParse(parsed);
      if (result.success) {
        const row = await log(true);
        return { data: result.data, requestId: row.id };
      }
      // One repair attempt: show the model exactly what was wrong.
      if (userPrompt === req.user) {
        retries++;
        const issues =
          parsed === undefined
            ? "Your previous reply was not valid JSON."
            : result.error.issues
                .slice(0, 12)
                .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
                .join("\n");
        userPrompt = `${req.user}\n\nYour previous reply did not match the required JSON format:\n${issues}\nReply again with corrected JSON only.`;
        continue;
      }
      lastError = { code: "AI_INVALID_OUTPUT", message: "The AI returned an answer in the wrong format twice. Please try again." };
      break;
    } catch (e) {
      const err = e instanceof AiProviderError ? e : new AiProviderError("unavailable", "Couldn't reach the AI provider.", true);
      lastError = { code: `AI_${err.kind.toUpperCase()}`, message: err.message };
      if (!err.retryable || attempt >= 2) break;
      retries++;
      await sleep(800 * 2 ** attempt + Math.random() * 300);
    } finally {
      clearTimeout(timer);
    }
  }

  await log(false, lastError.code).catch((e) => logger.warn({ err: e }, "failed to log AI request"));
  const status = lastError.code === "AI_AUTH" ? 409 : lastError.code === "AI_INVALID_OUTPUT" ? 422 : 503;
  throw new AppError(status, lastError.code, lastError.message);
}
