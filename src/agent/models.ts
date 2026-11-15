import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { generateText, generateObject } from "ai";
import { z } from "zod";

export const primaryModel = google("gemini-flash-latest");
// Gemini Flash Lite: same free tier and key, used when Flash is busy. It
// rejects `thinkingBudget` (400 invalid argument), so it gets no thinkingConfig.
export const liteModel = google("gemini-3.5-flash-lite");
// Groq fallback: openai/gpt-oss-20b (20B open-weight reasoning model, free tier).
// This account's Groq key does NOT expose the older llama-3.x chat models
// (llama-3.1-8b-instant was retired by Groq; llama-3.3-8b-versatile is absent
// from this account), so we fall back to gpt-oss-20b instead.
// gpt-oss-20b supports response_format json_schema (Structured Outputs), so the
// fallback uses the same default structured-outputs path as the Gemini primary —
// Groq enforces the schema and the SDK validates the result against our Zod
// schema. (NOTE: gpt-oss does NOT work in json_object mode — Groq then requires
// the literal word "json" in the messages, which the SDK's json_object path does
// not supply. The older llama-3.x fallbacks needed json_object, but gpt-oss does
// not.) gpt-oss is a reasoning model; Structured Outputs' streaming/tool-use
// restriction does not apply here because the fallback uses non-streaming
// generateObject.
export const fallbackModel = groq("openai/gpt-oss-20b");

// Select the chat model BEFORE streaming. Mid-stream provider failover is not
// possible with streamText (once tokens reach the client, a Groq handoff would
// regenerate from scratch and duplicate output). Instead we probe Gemini with a
// 1-token call; on failure/timeout we fall back to Groq for the whole stream.
const PROBE_TIMEOUT_MS = 4000;

// Cache the resolved model for a short window. Once Gemini is found dead (or
// alive) we reuse the decision instead of re-probing on every chat message,
// which would add a full PROBE_TIMEOUT_MS wait and a repeated error log on each
// call when Gemini is unreachable.
const PROBE_CACHE_TTL_MS = 60_000;
let cachedModel: typeof primaryModel | null = null;
let cachedModelExpiry = 0;
// Concurrent cache misses share one in-flight probe instead of each probing.
let inflightProbe: Promise<typeof primaryModel> | null = null;

export async function resolveChatModel(): Promise<typeof primaryModel> {
  if (cachedModel && Date.now() < cachedModelExpiry) {
    return cachedModel;
  }
  if (!inflightProbe) {
    inflightProbe = probeChatModel().finally(() => {
      inflightProbe = null;
    });
  }
  return inflightProbe;
}

async function probeChatModel(): Promise<typeof primaryModel> {
  let resolved: typeof primaryModel;
  if (await probeModel("Gemini Flash", primaryModel)) {
    resolved = primaryModel;
  } else if (await probeModel("Gemini Flash Lite", liteModel)) {
    resolved = liteModel;
  } else {
    console.warn("Gemini probes failed, using Groq for chat");
    resolved = fallbackModel as unknown as typeof primaryModel;
  }

  cachedModel = resolved;
  cachedModelExpiry = Date.now() + PROBE_CACHE_TTL_MS;
  return resolved;
}

async function probeModel(
  name: string,
  model: typeof primaryModel,
): Promise<boolean> {
  try {
    await Promise.race([
      generateText({ model, prompt: "ping", maxOutputTokens: 1 }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("provider probe timeout")),
          PROBE_TIMEOUT_MS,
        ),
      ),
    ]);
    return true;
  } catch (err) {
    console.warn(`${name} probe failed:`, err);
    return false;
  }
}

export async function withFallback<T>(
  fn: (model: typeof primaryModel) => Promise<T>,
): Promise<T> {
  try {
    return await fn(primaryModel);
  } catch (error) {
    console.error("Gemini call failed, falling back to Groq:", error);
    return await fn(fallbackModel as unknown as typeof primaryModel);
  }
}

// Structured-object generation (generateObject) with provider fallback.
// Both Gemini and the Groq fallback (openai/gpt-oss-20b) use the default
// response_format json_schema path. Groq enforces STRICT structured outputs:
// every property in `properties` MUST be listed in `required`. So any Zod
// schema passed here must NOT use `.optional()` for object fields — use
// `.nullable()` instead (keeps the key in `required` as ["string","null"]).
// Optional fields would make the Groq fallback 400 with
// "`required` ... must be supplied ... including every key in properties",
// which only surfaces when Gemini is down and the call falls back to Groq.
// Gemini can stall without answering until the 300 s HTTP headers timeout.
// Flash is capped short for every caller so a busy Flash costs little; Flash
// Lite then gets the caller's timeout (30 s by default, longer for cleanup).
export const FLASH_STRUCTURED_TIMEOUT_MS = 15_000;
export const DEFAULT_STRUCTURED_TIMEOUT_MS = 30_000;

// After a Flash failure, start at Flash Lite for this long. Module state, so it
// only helps inside one warm server instance; the short Flash cap bounds what a
// cold instance loses.
export const FLASH_BUSY_TTL_MS = 60_000;
let flashBusyUntil = 0;

export function resetFlashBusyForTests(): void {
  flashBusyUntil = 0;
}

export type StructuredModelUsed = "flash" | "lite" | "groq";

export async function generateStructuredWithFallback<OBJECT>({
  schema,
  prompt,
  timeoutMs = DEFAULT_STRUCTURED_TIMEOUT_MS,
}: {
  schema: z.ZodType<OBJECT>;
  prompt: string;
  timeoutMs?: number;
}): Promise<{ object: OBJECT; model: StructuredModelUsed }> {
  // No retries on Gemini: when it is busy we want the next model at once.
  if (Date.now() >= flashBusyUntil) {
    try {
      const { object } = await generateObject({
        model: primaryModel,
        schema,
        prompt,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(
          Math.min(FLASH_STRUCTURED_TIMEOUT_MS, timeoutMs),
        ),
        // Extraction does not need hidden reasoning; it only adds seconds.
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      });
      return { object, model: "flash" };
    } catch (error) {
      flashBusyUntil = Date.now() + FLASH_BUSY_TTL_MS;
      console.warn("Gemini Flash structured call failed, trying Flash Lite:", error);
    }
  }
  try {
    const { object } = await generateObject({
      model: liteModel,
      schema,
      prompt,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return { object, model: "lite" };
  } catch (error) {
    console.warn("Gemini Flash Lite structured call failed, falling back to Groq:", error);
  }
  const { object } = await generateFallbackObject({ schema, prompt });
  return { object, model: "groq" };
}

// gpt-oss-20b is a reasoning model and its reasoning counts against the
// completion budget. Keep reasoning low and name the budget, or Groq can cut the
// JSON off or return none at all.
export const FALLBACK_MAX_OUTPUT_TOKENS = 8192;

// Groq answers 400 when the model's output misses the schema. That is not an
// error the SDK retries, but the next generation often succeeds.
function isGroqJsonFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("to validate JSON") ||
    message.includes("to generate JSON") ||
    message.includes("max completion tokens")
  );
}

async function generateFallbackObject<OBJECT>({
  schema,
  prompt,
}: {
  schema: z.ZodType<OBJECT>;
  prompt: string;
}): Promise<{ object: OBJECT }> {
  // gpt-oss-20b supports json_schema, so use the default structured-outputs
  // path, same as the Gemini primary.
  const call = () =>
    generateObject({
      model: fallbackModel,
      schema,
      prompt,
      maxRetries: 1,
      maxOutputTokens: FALLBACK_MAX_OUTPUT_TOKENS,
      providerOptions: { groq: { reasoningEffort: "low" } },
    });
  try {
    return await call();
  } catch (error) {
    if (!isGroqJsonFailure(error)) throw error;
    console.warn("Groq returned no valid JSON, trying once more:", error);
    return await call();
  }
}
