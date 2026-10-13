# Step C2 — Meeting Prep Suggestions (dedicated `/prep` page)

## Context

C1 unlocked cross-meeting semantic search over a user's `meeting_chunks`
embeddings (`match_meeting_chunks_user` RPC + `searchAcrossMeetings`). That same
primitive lets us *prep* for a future meeting: an upcoming meeting has no
transcript yet, so we embed its **title + user-typed notes** and use the existing
RPC to find the user's *past related* meetings, then synthesize grounded prep
notes with Gemini (fallback Groq).

Decisions settled with the developer (architect pass):
- **Input surface:** a dedicated `/prep` page (mirrors C1). User types the
  upcoming meeting's **title** + optional **notes** (no stored agenda — the
  `meetings` table has `title` only, no agenda/description column). Optionally
  seedable later via `?title=`, but the page is standalone.
- **Grounding:** embed the query → `match_meeting_chunks_user` (related past
  chunks) **and** pull those related meetings' `meeting_insights` (summary /
  decisions) + **open** `follow_ups` (joined to `action_items` for the title), so
  prep can flag e.g. *"2 open action items from the last Q3 Roadmap sync."*
- **Output shape:** a **structured object** via `generateStructuredWithFallback`
  → `{ context, openActionItems, discussionPoints, questionsToAsk }`, rendered as
  cards. No streaming.
- **Endpoint:** new `POST /api/prep` (new route for a new feature; does not alter
  any existing contract path/method).
- Zero cost: reuses Gemini embeddings + pgvector + the Gemini/Groq fallback. No
  new tables, no new provider.

## What we are building

1. A new agent function `generatePrepSuggestions(userId, title, notes?)` in
   `src/agent/prep.ts` (imports the shared `QUESTION_EMBEDDING` from `rag.ts` —
   export it there). It (a) embeds the query, (b) calls `match_meeting_chunks_user`
   to get related past chunks + their meeting titles, (c) gathers the distinct
   related `meeting_id`s, (d) fetches `meeting_insights` + open `follow_ups` for
   those meetings, (e) builds a grounding prompt, (f) calls
   `generateStructuredWithFallback` to produce the structured prep notes.
2. A new API route `POST /api/prep` (`runtime = "nodejs"`): `auth()` → 401 if no
   `userId`; parse `{ title, notes }`; 400 if `title` missing/empty; otherwise
   `generatePrepSuggestions` → `{ suggestions }`; 500 on catch with the message.
3. A new page `src/app/(root)/(home)/prep/page.tsx` (client): title input +
   optional notes textarea + submit; renders the four sections as cards; loading /
   error / empty states. Uses existing UI tokens only (no hardcoded colors).
4. A new sidebar nav entry for `/prep`, matching the existing nav pattern
   (icon + "Prep"), reusing the C1 `search` entry shape. Add to
   `constants/index.tsx` sidebar links + `Sidebar.tsx` page type/render case.

## Language we agreed on

- "Meeting Prep Suggestions" = AI-generated prep notes for a *future* meeting,
  grounded in the user's *past related* meetings.
- "related meetings" = user's past meetings semantically similar to the prep
  query (via embeddings), always `user_id`-scoped.
- "about to start" = a future/scheduled meeting with no transcript yet; its
  `title` + user-typed `notes` are the retrieval query.
- "prep notes" = `{ context, openActionItems, discussionPoints, questionsToAsk }`.

## Decisions made (recommendations, confirmed)

- **Similarity threshold:** `0.1` cosine on the chunk match (keep near-C1 so
  related past meetings surface); top `12` chunks, then take the distinct related
  meeting ids (cap at ~6 meetings) for the insights + open-items enrichment.
- **Structured schema (Zod):**
  ```ts
  const PrepSuggestionsSchema = z.object({
    context: z.array(z.string()),          // key context bullets from past related meetings
    openActionItems: z.array(z.string()),  // open items from related past meetings to follow up
    discussionPoints: z.array(z.string()), // suggested topics to raise
    questionsToAsk: z.array(z.string()),   // questions to ask
  });
  ```
- **Graceful no-match:** if `match_meeting_chunks_user` returns nothing, still
  call generation but tell the model there is no related history; it returns
  generic-but-honest prep or notes the gap. Never crash.
- **Open follow_ups query:** server-side, `user_id`-scoped via the meeting join
  (the `in("meeting_id", relatedIds)` already restricts to related meetings, which
  are themselves user-owned). Filter `status != "completed"`. Embedded-to-one
  `action_items(title)` returns an **object** at runtime (per AGENTS.md) — read
  `row.action_items?.title ?? "Untitled action item"`, do not treat it as an array.

## How to build it

### 1. Export the embedding model — `src/agent/rag.ts`
Change `const QUESTION_EMBEDDING = ...` to `export const QUESTION_EMBEDDING = ...`
so `prep.ts` reuses the single Gemini `gemini-embedding-001` (768-dim pinned)
model. No behavior change.

### 2. Agent function — `src/agent/prep.ts` (new)
```ts
import "server-only";
import { embed } from "ai";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase-server";
import { QUESTION_EMBEDDING } from "./rag";
import { generateStructuredWithFallback } from "./models";

export const PrepSuggestionsSchema = z.object({
  context: z.array(z.string()),
  openActionItems: z.array(z.string()),
  discussionPoints: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
});
export type PrepSuggestions = z.infer<typeof PrepSuggestionsSchema>;

export async function generatePrepSuggestions(
  userId: string,
  title: string,
  notes?: string,
): Promise<PrepSuggestions> {
  const query = [title, notes].filter(Boolean).join("\n\n").trim();
  if (!query) {
    return { context: [], openActionItems: [], discussionPoints: [], questionsToAsk: [] };
  }

  // (a) embed + (b) related past chunks
  const { embedding } = await embed({
    model: QUESTION_EMBEDDING,
    value: query,
    providerOptions: { google: { outputDimensionality: 768 } },
  });
  const { data: hits, error } = await supabaseServer().rpc(
    "match_meeting_chunks_user",
    { query_embedding: embedding, p_user_id: userId, match_count: 12, similarity_threshold: 0.1 },
  );
  if (error) throw new Error(`match_meeting_chunks_user failed: ${JSON.stringify(error)}`);

  const relatedIds = [...new Set((hits ?? []).map((h: { meeting_id: unknown }) => String(h.meeting_id)))].slice(0, 6);
  const snippetsByMeeting = new Map<string, string[]>();
  for (const h of hits ?? []) {
    const mid = String(h.meeting_id);
    const arr = snippetsByMeeting.get(mid) ?? [];
    arr.push(String((h as { chunk_text: unknown }).chunk_text ?? ""));
    snippetsByMeeting.set(mid, arr.slice(0, 3));
  }

  // (d) insights + open follow_ups for the related meetings
  let insightsText = "";
  let openItemsText = "";
  if (relatedIds.length) {
    const { data: insights } = await supabaseServer()
      .from("meeting_insights")
      .select("meeting_id, summary, decisions")
      .in("meeting_id", relatedIds);
    insightsText = (insights ?? [])
      .map((i) => `- ${(i.summary ?? "").slice(0, 400)}${(Array.isArray(i.decisions) ? " Decisions: " + i.decisions.join("; ") : "")}`)
      .join("\n");

    const { data: follows } = await supabaseServer()
      .from("follow_ups")
      .select("meeting_id, status, action_items(title)")
      .in("meeting_id", relatedIds)
      .neq("status", "completed");
    openItemsText = (follows ?? [])
      .map((f) => {
        const title = (f as { action_items?: { title?: string } | null }).action_items?.title ?? "Untitled action item";
        return `- [${f.status}] ${title}`;
      })
      .join("\n");
  }

  // (e) grounding prompt
  const relatedSnippetText = [...snippetsByMeeting.entries()]
    .map(([mid, snips]) => `Meeting ${mid}:\n${snips.map((s) => "  • " + s.slice(0, 300)).join("\n")}`)
    .join("\n");
  const hasHistory = relatedIds.length > 0;
  const prompt = [
    "You are a meeting prep assistant for NeuraMeet.",
    `The user is about to join a meeting titled: "${title}".`,
    notes ? `Their prep notes: ${notes}` : "",
    "",
    hasHistory
      ? "Below is context from the user's PAST related meetings (transcript snippets, summaries/decisions, and open action items)."
      : "The user has no past related meetings in the system.",
    "",
    "Related past transcript snippets:",
    relatedSnippetText || "(none)",
    "",
    "Related past summaries / decisions:",
    insightsText || "(none)",
    "",
    "Open action items from related past meetings:",
    openItemsText || "(none)",
    "",
    "Using ONLY the context above, produce prep suggestions as four arrays of short strings:",
    "- context: key context bullets the user should know before this meeting",
    "- openActionItems: open items from related past meetings worth following up",
    "- discussionPoints: topics to raise in this meeting",
    "- questionsToAsk: questions to ask",
    hasHistory ? "Do not invent facts not in the context." : "If no context, return concise general prep guidance and note there is no related history.",
  ].filter(Boolean).join("\n");

  // (f) structured generation with Gemini -> Groq fallback
  const { object } = await generateStructuredWithFallback({
    schema: PrepSuggestionsSchema,
    prompt,
  });
  return object;
}
```

### 3. API route — `src/app/api/prep/route.ts` (new)
- `runtime = "nodejs"`.
- `POST`: `auth()` → 401 if no `userId`. Parse `{ title, notes }`. 400 if
  `title` missing/empty. Call `generatePrepSuggestions(userId, title.trim(), notes)`.
  Return `{ suggestions }`. Wrap in try/catch → 500 with the error message (so a
  missing RPC surfaces visibly, consistent with C1). Never return a silent empty.

### 4. Page — `src/app/(root)/(home)/prep/page.tsx` (new)
- Client component. Controlled `title` input + `notes` textarea ("What's this
  meeting about? (optional)"). Submit on Enter / button. `POST /api/prep`
  `{ title, notes }`. Keep `isLoading` → `<LoaderOne />`.
- Render `suggestions` as four labeled cards/sections: **Context**, **Open action
  items**, **Discussion points**, **Questions to ask** — each a bullet list. Only
  render sections that have items; if all empty, show a friendly "No prep
  suggestions — try a different title or add notes."
- States: empty (prompt to enter a title), loading (loader), error (red card with
  the message; if it mentions `match_meeting_chunks_user`, hint "apply the RPC in
  Supabase SQL Editor" — already applied for C1, but keep the hint), success.
- Styling: reuse existing card/container classes from Meeting Intelligence /
  Dashboard (CSS variables only, no hardcoded hex/raw Tailwind colors).

### 5. Sidebar — `src/components/Sidebar.tsx` + `constants/index.tsx`
- Add a `Prep` nav entry → `/prep`, reusing the C1 `search` entry shape (icon +
  label), add `"prep"` to `SidebarPagesTypes` + the render case. The route lives
  under `(root)` so the existing layout/middleware already guards it.

## Assumptions

- `match_meeting_chunks_user` RPC is already live in Supabase (applied during C1).
- The user has ≥1 embedded past meeting for meaningful related-context; otherwise
  prep degrades to honest general guidance (no crash).
- `meeting_insights.summary` / `decisions` and `follow_ups.action_items(title)`
  columns exist (confirmed from `architecture.md`).

## Verification (after build; for your run)

1. `npm run build` — typecheck + build green (new route + page + agent fn included).
2. With a Clerk-signed-in user who has ≥1 embedded past meeting with insights +
   open follow_ups:
   - Visit `/prep` → sidebar entry present, page renders.
   - Type an upcoming meeting title semantically related to a past meeting (+ notes)
     → four sections appear, grounded in the past meeting(s); **Open action items**
     lists real open items from the related past meeting(s).
   - Type a title with no related past meeting → honest general prep / "no related
     history" note, no crash.
   - Empty title submit → 400 handled cleanly (no request or clear validation).
3. `npx tsc --noEmit` clean; confirm `match_meeting_chunks_user` missing would
   surface a visible error (it's applied, so real hits expected).

## Files touched

- `src/agent/rag.ts` — export `QUESTION_EMBEDDING`.
- `src/agent/prep.ts` — new (`generatePrepSuggestions` + `PrepSuggestionsSchema`).
- `src/app/api/prep/route.ts` — new `POST`.
- `src/app/(root)/(home)/prep/page.tsx` — new client page.
- `src/components/Sidebar.tsx` — `prep` nav type + render case.
- `constants/index.tsx` — `Prep` sidebar link → `/prep`.

## Context files to sync after build

- `context/progress-tracker.md` — C2 ✅ with description.
- `context/build-plan.md` — mark C2 done.
- `context/ui-registry.md` — new Prep page row.
- `docs/scope/scope.md` — feature 8 (engagement intelligence) progress if applicable.
