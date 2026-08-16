import "server-only";
import { embed } from "ai";
import { google } from "@ai-sdk/google";
import { supabaseServer } from "@/lib/supabase-server";

// Embeddings are Gemini-only (Groq has no embedding model), consistent with
// Step 5's embed.ts. Used here to embed the user's question for retrieval.
const QUESTION_EMBEDDING = google.textEmbeddingModel("gemini-embedding-001");

/**
 * Embed the question and retrieve the top-k transcript chunks for this meeting.
 * Never throws — retrieval failures degrade to an empty context so the chat
 * route can still respond with a clear "no context yet" message.
 */
export async function retrieveContext(
  meetingId: string,
  question: string,
): Promise<string[]> {
  try {
    if (!question.trim()) return [];

    const { embedding } = await embed({
      model: QUESTION_EMBEDDING,
      value: question,
      // Pin to 768-dim to match the meeting_chunks.embedding vector(768) column.
      providerOptions: { google: { outputDimensionality: 768 } },
    });

    const { data, error } = await supabaseServer().rpc("match_meeting_chunks", {
      query_embedding: embedding,
      match_meeting_id: meetingId,
      match_count: 5,
    });

    if (error) {
      console.error("match_meeting_chunks failed:", error);
      return [];
    }

    const rows = (data ?? []) as { chunk_text: string }[];
    return rows
      .map((row) => row.chunk_text)
      .filter((text): text is string => Boolean(text));
  } catch (err) {
    console.error("retrieveContext failed:", err);
    return [];
  }
}

/**
 * Build the grounding system prompt. With no retrieved context we instruct the
 * model to say it has nothing to work with yet (no lazy-embedding — keep small).
 */
export function buildSystemPrompt(context: string[]): string {
  if (context.length === 0) {
    return [
      "You are a meeting assistant for NeuraMeet.",
      "There is currently no transcript context available for this meeting.",
      "Politely tell the user you cannot answer questions about this meeting yet,",
      "and suggest they upload a transcript first. Do not invent information.",
    ].join(" ");
  }

  return [
    "You are a meeting assistant for NeuraMeet.",
    "Answer the user's question using ONLY the meeting transcript context below.",
    "If the answer is not in the context, say so plainly. Do not invent facts.",
    "Be concise and cite specifics from the transcript when relevant.",
    "",
    "Meeting transcript context:",
    context.join("\n\n"),
  ].join("\n");
}
