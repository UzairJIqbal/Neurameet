import "server-only";
import { APICallError, embedMany } from "ai";
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

// Gemini caps batchEmbedContents at 100 embeddings per request; a long
// transcript that yields more chunks would fail deterministically without this.
const MAX_EMBED_BATCH = 100;
// Free-tier calls land back-to-back in the upload sequence and can trip the
// Gemini 429 rate limit. Retry transient failures with exponential backoff
// instead of surfacing a misleading "re-upload" toast to the user.
const EMBED_RETRIES = 3;
const EMBED_BACKOFF_MS = 800;

async function embedBatch(values: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values,
    // Retries are handled by embedWithRetry below; SDK retries would stack.
    maxRetries: 0,
    // Pin to 768-dim to match the meeting_chunks.embedding vector(768) column.
    providerOptions: { google: { outputDimensionality: 768 } },
  });
  if (!embeddings || embeddings.length !== values.length) {
    throw new Error("Embedding count mismatch");
  }
  return embeddings;
}

async function embedWithRetry(values: string[]): Promise<number[][]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= EMBED_RETRIES; attempt++) {
    try {
      return await embedBatch(values);
    } catch (err) {
      // A count mismatch is deterministic — retrying can't fix it.
      if (err instanceof Error && err.message === "Embedding count mismatch") {
        throw err;
      }
      // Permanent API errors (bad key, invalid request) fail immediately; only
      // rate limits, 5xx and network errors are retried.
      if (APICallError.isInstance(err) && !err.isRetryable) {
        throw err;
      }
      lastErr = err;
      if (attempt < EMBED_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, EMBED_BACKOFF_MS * 2 ** attempt),
        );
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Embedding failed");
}

export async function embedAndStore(
  meetingId: string,
  rawText: string,
): Promise<{ chunkCount: number }> {
  const chunks = chunkTranscript(rawText);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  // Embed in sub-batches (Gemini's 100-per-request cap) so long transcripts
  // can't fail, retrying each sub-batch on transient errors.
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += MAX_EMBED_BATCH) {
    const batch = chunks.slice(i, i + MAX_EMBED_BATCH);
    embeddings.push(...(await embedWithRetry(batch)));
  }

  if (embeddings.length !== chunks.length) {
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
