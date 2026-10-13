import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { generateText, generateObject } from "ai";
import { z } from "zod";

export const primaryModel = google("gemini-flash-latest");
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
  let resolved: typeof primaryModel = primaryModel;
  try {
    await Promise.race([
      generateText({ model: primaryModel, prompt: "ping", maxOutputTokens: 1 }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("provider probe timeout")),
          PROBE_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    console.warn("Gemini probe failed, using Groq for chat:", err);
    resolved = fallbackModel as unknown as typeof primaryModel;
  }

  cachedModel = resolved;
  cachedModelExpiry = Date.now() + PROBE_CACHE_TTL_MS;
  return resolved;
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
export async function generateStructuredWithFallback<OBJECT>({
  schema,
  prompt,
}: {
  schema: z.ZodType<OBJECT>;
  prompt: string;
}): Promise<{ object: OBJECT }> {
  try {
    // No retries on the primary: when Gemini is rate-limited we want to fail
    // over to Groq immediately rather than burn the request budget on backoffs.
    // Groq is itself the retry for this call.
    return await generateObject({
      model: primaryModel,
      schema,
      prompt,
      maxRetries: 0,
    });
  } catch (error) {
    console.warn("Gemini structured call failed, falling back to Groq:", error);
    // gpt-oss-20b supports json_schema, so use the default structured-outputs
    // path (no providerOptions override) — same as the Gemini primary.
    return await generateObject({
      model: fallbackModel,
      schema,
      prompt,
      maxRetries: 1,
    });
  }
}
