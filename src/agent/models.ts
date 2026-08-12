import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";

export const primaryModel = google("gemini-2.0-flash");
export const fallbackModel = groq("llama-3.1-8b-instant");

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
