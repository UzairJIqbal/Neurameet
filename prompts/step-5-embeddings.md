# Step 5 — RAG Embeddings (`meeting_chunks`)

Build `POST /api/ai/embed` + `src/agent/embed.ts` to chunk a meeting's transcript,
embed each chunk with Gemini `gemini-embedding-001` (pinned to 768-dim via `providerOptions.google.outputDimensionality`), and store vectors in
`meeting_chunks` (pgvector), scoped to the owning user. Extend the upload flow to
call embed after process so chunks populate automatically at upload time. This
unblocks Step 6's RAG chat.

## Context

- Steps 1–4 are complete and verified. `meeting_chunks` table + `match_meeting_chunks`
  RPC already exist (`supabase/schema.sql`). Embeddings have never been generated —
  `meeting_chunks` is empty, so RAG chat (Step 6) cannot retrieve yet.
- Stack: Next.js 15 App Router, Vercel AI SDK, `@ai-sdk/google` Gemini primary.
  **Groq has no embedding model**, so embeddings are Gemini-only — `embed.ts` does
  NOT use `withFallback`.
- Contract (`AGENTS.md`) requires `POST /api/ai/embed` as a standalone endpoint.
  We keep it standalone but wire the upload flow to call it (upload → process → embed).

## Decisions (confirmed with developer)

1. **Trigger:** Chain embed after process in `UploadTranscriptModal.handleUpload`.
   Endpoint stays a standalone POST per the contract.
2. **Chunking:** Paragraph-aware — split on blank lines, accumulate to ~900 chars
   with ~150-char overlap. Fall back to fixed-window split if no paragraph breaks.
3. **Idempotency:** `embed.ts` deletes existing `meeting_chunks` for the meeting
   before insert — safe to re-run.
4. **Batching:** `embedMany` for all chunks in one call (within free-tier).
5. **User scoping:** embed route verifies `meetings.id + user_id` ownership before
   fetching the transcript (honors "always scope by user_id" invariant).
6. **Non-fatal embed:** if embed fails, log + continue to redirect (insights still
   show; Step 6 chat handles missing chunks). Does not block the upload UX.

## Files to create

### `src/agent/embed.ts` (new — server-only agent logic; never imports React)

```ts
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

  // No paragraph breaks → fall back to fixed-window split
  const segments =
    paragraphs.length > 1
      ? paragraphs
      : [trimmed];

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
      // carry overlap
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
  });

  if (!embeddings || embeddings.length !== chunks.length) {
    throw new Error("Embedding count mismatch");
  }

  const supabase = supabaseServer();

  // Idempotent: clear prior chunks for this meeting
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
```

### `src/app/api/ai/embed/route.ts` (new — mirror `process/route.ts`)

- REQUIRED: `/* eslint-disable prettier/prettier */` at very top (route files need it
  or `npm run build` fails).
- `POST`:
  1. `const { userId } = await auth();` → 401 if none.
  2. `const { meetingId } = body` → 400 if missing.
  3. `supabaseServer()` → fetch `meetings` by `id` + `user_id` → 404 if not owner
     (scoping check).
  4. Fetch `transcripts.raw_text` by `meeting_id` → 404 if absent/empty.
  5. `await embedAndStore(meetingId, transcript.raw_text)` from `@/agent/embed`.
  6. Return `{ success: true, chunkCount }`.
  7. All in try/catch → `console.error` + 500 with `{ error: message }`.

## Files to modify

### `src/components/UploadTranscriptModal.tsx`

In `handleUpload`, after the `process` call succeeds (the block that does
`toast.success("Transcript processed successfully!")`), add Step 3 before `onClose()`:

```ts
// Step 3: Embed transcript chunks for RAG (non-fatal)
try {
  const embedRes = await fetch("/api/ai/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meetingId }),
  });
  if (!embedRes.ok) {
    const embedData = await embedRes.json().catch(() => ({}));
    console.error("Embedding failed:", embedData.error || "unknown");
  }
} catch (embedErr) {
  console.error("Embedding request failed:", embedErr);
}
```

Keep the existing success toast + `router.push('/meeting-intelligence/${meetingId}')`.
Embed failure must NOT block redirect.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm run build` — exit 0.
3. Manual E2E (dev server running): sign in → Upload Transcript (title + pasted text)
   → Upload & Process → lands on `/meeting-intelligence/[id]`. Then in Supabase SQL
   Editor: `select count(*) from meeting_chunks where meeting_id = '<id>';` → `> 0`.
   (Chunk UI display arrives in Step 6.)

## Out of scope (explicitly not building)

- RAG chat endpoint / `AiChatTab` (Step 6).
- Any UI rendering of chunks (Step 6).
- Change-category write path (deferred).
