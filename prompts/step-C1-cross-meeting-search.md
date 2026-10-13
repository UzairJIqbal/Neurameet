# Step C1 — Cross-Meeting Semantic Search (dedicated `/search` page)

## Context

The Core pipeline already chunks and embeds every uploaded transcript into
`meeting_chunks` (768-dim Gemini embeddings, pgvector). Today those embeddings
are only used for single-meeting RAG chat (`retrieveContext` + `match_meeting_chunks`,
scoped to one `meeting_id`).

Step C1 unlocks that same investment for discovery: let a signed-in user search
**across all their meetings by meaning**, not just by title. This is a read path
only — embed the query, similarity-search the user's chunks, group hits by
source meeting, show a snippet + link. No AI generation in C1 (keeps it zero-cost
and scoped). Reuses the existing Gemini embedding model and `meeting_chunks`
table. No new tables, no new paid tool.

Decisions settled with the developer (architect pass):
- **UI surface:** a dedicated `/search` page with its own sidebar nav entry
  (Option A). Leaves the existing A6 Dashboard client-side title filter untouched.
- **Result shape:** flat ranked hits, **grouped on the page by source meeting**
  under each meeting's title, each hit linking to that meeting's detail page.
- **No AI generation step** in C1 (pure search + display).
- **Endpoint:** new `POST /api/search` (new route for a new feature; does not
  alter any existing contract path/method).

## What we are building

1. A new Supabase RPC `match_meeting_chunks_user` — the cross-meeting analog of
   `match_meeting_chunks`. It joins `meeting_chunks` to `meetings` and filters by
   the owner's `user_id`, so a user never sees another user's chunks. Returns the
   matching chunk plus its `meeting_id` and the meeting `title`.
2. A new agent function `searchAcrossMeetings(userId, query)` in `src/agent/rag.ts`
   that embeds the query (reusing the existing Gemini `gemini-embedding-001`,
   768-dim pinned) and calls the new RPC. Never throws — degrades to `[]`.
3. A new API route `POST /api/search` (Clerk `auth()` guard, server-only) that
   calls `searchAcrossMeetings` and returns the hits as JSON.
4. A new page `src/app/(root)/(home)/search/page.tsx` — search input + grouped,
   ranked results with loading / empty / no-results states, using existing UI
   tokens (no hardcoded colors).
5. A new sidebar nav entry for `/search`, matching the existing nav pattern.

## Language we agreed on

- "Cross-Meeting Search" = semantic vector search over all of the user's
  `meeting_chunks`, not a keyword/title filter.
- "the user's" = always `user_id`-scoped via `meetings`.
- "grouped by source meeting with title" = page shows each meeting title as a
  section header, with its matching chunk snippets listed beneath it.
- "return matches" = read path (embed + similarity search → JSON). No generation.

## Decisions made (recommendations, overridable)

- **Similarity threshold:** `0.3` cosine (drops near-noise hits). RPC takes a
  `similarity_threshold` param defaulting to `0.0` so it is tunable live.
- **Top-k:** fetch the top `20` matching chunks, then group by meeting on the
  page (show up to 3 snippets per meeting, with a "+N more" count if truncated).
- **Snippet display:** show `chunk_text` as-is (it is already a ~900-char window);
  optionally trim to first ~280 chars with an ellipsis for density. Recommend
  trim to first 280 chars + "…".
- **Similarity label:** show as a percentage (`Math.round(similarity * 100)`) on
  each hit, e.g. "92% match".
- **Link target:** each hit's meeting title links to
  `/meeting-intelligence/[meetingId]` (the existing detail page). No deep-link
  into a tab in C1.

## How to build it

### 1. RPC — `supabase/schema.sql`
Add (do not remove `match_meeting_chunks`):

```sql
create or replace function match_meeting_chunks_user(
  query_embedding vector(768),
  p_user_id text,
  match_count int default 20,
  similarity_threshold float default 0.0
)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  chunk_text text,
  chunk_index integer,
  similarity float
)
language sql
stable
as $$
  select
    mc.id,
    mc.meeting_id,
    m.title as meeting_title,
    mc.chunk_text,
    mc.chunk_index,
    1 - (mc.embedding <=> query_embedding) as similarity
  from meeting_chunks mc
  join meetings m on m.id = mc.meeting_id
  where m.user_id = p_user_id
    and 1 - (mc.embedding <=> query_embedding) >= similarity_threshold
  order by mc.embedding <=> query_embedding
  limit match_count;
$$;
```

**Migration note:** this RPC must be run live in the Supabase SQL Editor
(same as the `attendance_events` table — `schema.sql` edits are not auto-applied).
The route is self-sufficient for an empty result if the RPC is missing, but the
feature only works once it is applied. Call this out at the end of the build.

### 2. Agent function — `src/agent/rag.ts`
Add, reusing the existing `QUESTION_EMBEDDING` model and `supabaseServer()`:

```ts
export type CrossMeetingHit = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  chunkText: string;
  chunkIndex: number;
  similarity: number;
};

export async function searchAcrossMeetings(
  userId: string,
  query: string,
  matchCount = 20,
  threshold = 0.3,
): Promise<CrossMeetingHit[]> {
  try {
    if (!query.trim()) return [];
    const { embedding } = await embed({
      model: QUESTION_EMBEDDING,
      value: query,
      providerOptions: { google: { outputDimensionality: 768 } },
    });
    const { data, error } = await supabaseServer().rpc(
      "match_meeting_chunks_user",
      {
        query_embedding: embedding,
        p_user_id: userId,
        match_count: matchCount,
        similarity_threshold: threshold,
      },
    );
    if (error) {
      console.error("match_meeting_chunks_user failed:", error);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      meetingId: String(row.meeting_id),
      meetingTitle: row.meeting_title ?? "Untitled meeting",
      chunkText: row.chunk_text ?? "",
      chunkIndex: Number(row.chunk_index ?? 0),
      similarity: Number(row.similarity ?? 0),
    }));
  } catch (err) {
    console.error("searchAcrossMeetings failed:", err);
    return [];
  }
}
```

### 3. API route — `src/app/api/search/route.ts`
- `runtime = "nodejs"` (server-only; embeddings need the server client).
- `POST` handler: `auth()` → 401 if no `userId`. Parse `{ query }`. Call
  `searchAcrossMeetings`. Return `{ results }`. Wrap in try/catch, log, return
  `500` on unexpected error. Return `400` if `query` missing/empty (or treat as
  empty results — recommend `400` to make the client validate first).

### 4. Page — `src/app/(root)/(home)/search/page.tsx`
- Client component. A controlled `<input>` ("Search across your meetings…")
  with a submit (Enter / button). On submit, `POST /api/search` with
  `query`. Keep query in state; show `<LoaderOne />` while pending.
- Group the returned hits by `meetingId` into sections. Each section header =
  meeting title (link to `/meeting-intelligence/[meetingId]`). Under it, up to 3
  hits: snippet (first 280 chars + "…" if longer), "N% match" badge, link to the
  meeting. If a meeting has more than 3 hits, show "+N more from this meeting".
- States: no query yet (prompt to search), searching (loader), no results
  ("No matches across your meetings."), and a note when the user has no embedded
  meetings at all (link to Upload Transcript).
- Styling: use existing CSS variables / `ui-tokens.md` tokens only. Reuse the
  card/container classes already used in Meeting Intelligence / Dashboard so it
  reads as the same app.

### 5. Sidebar — `src/components/Sidebar.tsx`
- Add a `/search` nav item (icon + "Search"), reusing the existing nav item
  shape and the `search` nav type if one exists, else match the nearest existing
  item. Ensure the route is protected (it lives under `(root)` so the existing
  `(root)` layout/middleware already guards it).

## Assumptions

- The `meeting_chunks.embedding` column is `vector(768)` and `meetings.title`
  exists (confirmed from `architecture.md` / `schema.sql`) — so the join + return
  columns are valid.
- At least one of the user's meetings has been uploaded + embedded; otherwise the
  page correctly shows the "no embedded meetings" empty state.
- `match_meeting_chunks_user` will be applied live in Supabase during the build
  (migration step), same process as the `attendance_events` table.

## Verification (after build; for your run)

1. `npm run build` — typecheck + build green (the new route + page are included).
2. With a Clerk-signed-in user who has ≥1 embedded meeting:
   - Visit `/search` → sidebar entry present, page renders.
   - Type a query semantically related to a past transcript → grouped results
     appear, each under its meeting title, with a % match and a working link to
     that meeting. (Confirm the link opens the right meeting.)
   - Type a query with no semantic match → "No matches" state, no crash.
   - Empty input submit → validation (no request, or 400 cleanly handled).
3. Confirm another user's chunks never appear (scoping): a second Clerk account
   sees only its own meetings (documented; sandbox may need a second account).
4. Apply the `match_meeting_chunks_user` RPC live in Supabase; re-run step 2 to
   confirm real hits (the route degrades gracefully if the RPC is absent, but the
   feature only fully works once applied).

## Out of scope for C1 (later steps)

- AI-generated synthesis of cross-meeting results (could be a follow-up).
- Pre-fill of the target meeting's AI Chat with the query (C2/C3 territory).
- A second provider for embeddings (Gemini only, consistent with the project).
