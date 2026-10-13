import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { generateText, generateObject } from "ai";
import { z } from "zod";

export const primaryModel = google("gemini-flash-latest");
// Groq's free-tier models (e.g. llama-3.1-8b-instant) support response_format
// json_object but NOT json_schema. structuredOutputs is disabled per-call on the
// fallback (providerOptions.groq.structuredOutputs: false) so the Groq provider
// emits json_object while the SDK still validates the result against our Zod
// schema client-side.
export const fallbackModel = groq("llama-3.1-8b-instant");

// Select the chat model BEFORE streaming. Mid-stream provider failover is not
// possible with streamText (once tokens reach the client, a Groq handoff would
// regenerate from scratch and duplicate output). Instead we probe Gemini with a
// 1-token call; on failure/timeout we fall back to Groq for the whole stream.
const PROBE_TIMEOUT_MS = 4000;

export async function resolveChatModel(): Promise<typeof primaryModel> {
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
    return primaryModel;
  } catch (err) {
    console.error("Gemini probe failed, using Groq for chat:", err);
    return fallbackModel as unknown as typeof primaryModel;
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
// Gemini supports response_format json_schema (the AI SDK default for
// generateObject); Groq does NOT and rejects it with
// "This model does not support response format json_schema". When we fall back
// to Groq we force loose JSON mode (response_format json_object), which Groq
// supports, while still parsing/validating the result against the Zod schema.
// Structured-object generation (generateObject) with provider fallback.
// Gemini supports response_format json_schema (the AI SDK default for
// generateObject); Groq does NOT and rejects it with
// "This model does not support response format json_schema". On the Groq
// fallback we disable structuredOutputs so the provider emits json_object
// (response_format json_object), which Groq supports, while the SDK still
// parses/validates the result against the Zod schema.
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
    console.error("Gemini structured call failed, falling back to Groq:", error);
    return await generateObject({
      model: fallbackModel,
      schema,
      prompt,
      maxRetries: 1,
      providerOptions: { groq: { structuredOutputs: false } },
    });
  }
}
