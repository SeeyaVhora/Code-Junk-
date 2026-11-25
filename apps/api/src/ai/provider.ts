import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { AiProviderName } from "@code-junk/shared";

export interface AiCompletion {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature: number;
  signal: AbortSignal;
}

/** The only thing features know about a model: send instructions, get JSON text back. */
export interface AiProvider {
  name: AiProviderName;
  model: string;
  completeJson(req: AiRequest): Promise<AiCompletion>;
}

/** A provider-side failure with a user-presentable category. */
export class AiProviderError extends Error {
  constructor(
    public readonly kind: "auth" | "rate_limit" | "unavailable" | "timeout" | "bad_request" | "refused",
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

function classify(e: unknown): AiProviderError {
  if (e instanceof AiProviderError) return e;
  const status = (e as { status?: number }).status ?? (e as { code?: number }).code;
  const name = (e as { name?: string }).name;
  if (name === "AbortError" || name === "APIUserAbortError") return new AiProviderError("timeout", "The AI provider took too long to respond.", true);
  if (status === 401 || status === 403) return new AiProviderError("auth", "The AI provider rejected the API key.", false);
  if (status === 429) return new AiProviderError("rate_limit", "The AI provider is rate-limiting requests or the quota is used up.", true);
  if (status === 400 || status === 404) return new AiProviderError("bad_request", `The AI provider rejected the request (${status}). Check the model name.`, false);
  if (typeof status === "number" && status >= 500) return new AiProviderError("unavailable", "The AI provider is unavailable right now.", true);
  return new AiProviderError("unavailable", "Couldn't reach the AI provider.", true);
}

export function openAiProvider(apiKey: string, model: string): AiProvider {
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  return {
    name: "OPENAI",
    model,
    // Temperature is not sent: OpenAI's reasoning models reject non-default values.
    async completeJson({ system, user, maxOutputTokens, signal }) {
      try {
        const res = await client.chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            max_completion_tokens: maxOutputTokens,
          },
          { signal },
        );
        const choice = res.choices[0];
        if (choice?.message.refusal) throw new AiProviderError("refused", "The AI provider declined this request.", false);
        return {
          text: choice?.message.content ?? "",
          model: res.model,
          inputTokens: res.usage?.prompt_tokens,
          outputTokens: res.usage?.completion_tokens,
        };
      } catch (e) {
        throw classify(e);
      }
    },
  };
}

export function geminiProvider(apiKey: string, model: string): AiProvider {
  const client = new GoogleGenAI({ apiKey });
  return {
    name: "GEMINI",
    model,
    async completeJson({ system, user, maxOutputTokens, temperature, signal }) {
      try {
        const res = await client.models.generateContent({
          model,
          contents: user,
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            maxOutputTokens,
            temperature,
            abortSignal: signal,
          },
        });
        return {
          text: res.text ?? "",
          model,
          inputTokens: res.usageMetadata?.promptTokenCount,
          outputTokens: res.usageMetadata?.candidatesTokenCount,
        };
      } catch (e) {
        throw classify(e);
      }
    },
  };
}
