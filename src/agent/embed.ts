import "server-only";
import { embedMany } from "ai";
import { google } from "@ai-sdk/google";
import { supabaseServer } from "@/lib/supabase-server";

const EMBEDDING_MODEL = google.textEmbeddingModel("gemini-embedding-001");
const TARGET_CHARS = 900;
const OVERLAP_CHARS = 150;

export function chunkTranscript(
  text: string,
  targetChars = TARGET_CHARS,
  overlapChars = OVERLAP_CHARS,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // No paragraph breaks → fall back to a single fixed-window split
  const segments = paragraphs.length > 1 ? paragraphs : [trimmed];

  const chunks: string[] = [];
  let current = "";

  for (const seg of segments) {
    if (!current) {
      current = seg;
      continue;
    }
    if ((current + "\n\n" + seg).length <= targetChars) {
      current = current + "\n\n" + seg;
    } else {
      chunks.push(current);
      const slice = current.slice(Math.max(0, current.length - overlapChars));
      current = slice + "\n\n" + seg;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

export async function embedAndStore(
  meetingId: string,
  rawText: string,
): Promise<{ chunkCount: number }> {
  const chunks = chunkTranscript(rawText);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: chunks,
    // Pin to 768-dim to match the meeting_chunks.embedding vector(768) column.
    providerOptions: { google: { outputDimensionality: 768 } },
  });

  if (!embeddings || embeddings.length !== chunks.length) {
    throw new Error("Embedding count mismatch");
  }

  const supabase = supabaseServer();

  // Idempotent: clear prior chunks for this meeting before re-inserting
  const { error: delError } = await supabase
    .from("meeting_chunks")
    .delete()
    .eq("meeting_id", meetingId);
  if (delError) {
    console.error("Failed to clear prior chunks:", delError);
    throw new Error("Failed to clear prior chunks");
  }

  const rows = chunks.map((chunk_text, i) => ({
    meeting_id: meetingId,
    chunk_text,
    embedding: embeddings[i],
    chunk_index: i,
  }));

  const { error: insertError } = await supabase
    .from("meeting_chunks")
    .insert(rows);
  if (insertError) {
    console.error("Failed to insert chunks:", insertError);
    throw new Error("Failed to store embeddings");
  }

  return { chunkCount: chunks.length };
}
