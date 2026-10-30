# 0001. Promise Ledger

**Status**: In Progress
**Date**: 2026-10-30
**Mode**: FEATURE
**Scope feature**: [docs/scope/scope.md, row 17. Promise Ledger](../../scope/scope.md)
**Workflow tier**: GA
**Build approach**: Extend, built as end to end slices

## Summary

After each meeting, NeuraMeet pulls out every decision and every promise (who, what, by when) from the transcript, in English, Urdu, or mixed Urdu English. Each item keeps the exact quote, the speaker, and the transcript line number as proof. When a later meeting is processed, the app checks that meeting's transcript against your open items from earlier meetings. It suggests "kept" or "reversed" with the matching quote from the new meeting. Nothing becomes final until you, the owner, confirm it. An open promise whose due date has passed shows as overdue. Everything lives in a new owner only Ledger tab on the meeting page.

We recommend you build it inside the existing pipeline: extend the extraction call in `/api/ai/process`, reuse the pgvector chunks for matching, and add three small owner only routes. No new provider, no new env var, zero cost.

## Requirements

### User stories

- As a meeting owner, you want every decision and promise from a meeting listed with the exact words that were said, so you can trust it.
- As a meeting owner, you want later meetings to tell you which earlier promises were kept or quietly reversed, so nothing slips.
- As a meeting owner, you want to confirm or reject each suggested match, so the AI never has the last word.
- As a meeting owner, you want overdue promises to stand out, so you can chase them.
- As a meeting owner preparing a meeting, you want open promises related to the topic surfaced, so you walk in prepared.
- As the FYP author, you want a repeatable accuracy number, split by language, so the claim is defensible at the viva.

### Acceptance criteria

- **AC-1 Extraction.** After `/api/ai/process` succeeds, `ledger_items` holds up to 15 decisions and promises for the meeting. Each has kind, a plain English statement, the verbatim quote, a language tag (`en`, `ur`, or `mixed`), speaker, and a line number.
- **AC-2 Quote check.** Every stored quote is found in the transcript (case and whitespace insensitive). An item whose quote is not found is dropped and logged with the `[ledger]` prefix. It is never stored.
- **AC-3 Link to action items.** A promise that matches an extracted action item stores that item's id in `action_item_id`.
- **AC-4 Due dates.** Relative due dates ("Friday tak", "next week") resolve against the meeting date (`meetings.started_at`), not today.
- **AC-5 Meeting date.** The upload modal has an optional "Meeting date" field. When set on a new upload, it becomes `started_at`. It is ignored when attaching to an existing meeting.
- **AC-6 Automatic matching.** After process and embed finish, the client calls `POST /api/ledger/match`. It compares the new transcript with up to 15 of your open items from earlier meetings and stores suggested links.
- **AC-7 Threshold.** Only verdicts with confidence at or above 0.7 are stored. Each stored link has a quote verified against the new transcript, a speaker, and a line number.
- **AC-8 One verdict per pair.** There is at most one link per item per later meeting. Running match again updates suggested links and never touches confirmed or rejected ones.
- **AC-9 Review.** You can confirm, reject (shown as "Not a match"), or undo a link. Confirm sets the item status to the link's relation. Undo returns the link to suggested and the item to open unless another confirmed link still applies.
- **AC-10 Overdue.** `GET /api/ledger` returns `overdue` for an open item whose due date is before the client's `today`. Overdue is never stored.
- **AC-11 Reversal alert.** When a meeting has reversed links (suggested or confirmed, not rejected), the Ledger tab shows a red card at the top and the tab label shows a count badge.
- **AC-12 Owner only.** Every ledger route returns 401 when signed out and 404 when you do not own the meeting. The Ledger tab is hidden from non owners.
- **AC-13 Reprocess.** Reprocessing a meeting keeps items that have a confirmed or rejected link. It replaces the rest. A new item whose quote matches a kept item is skipped.
- **AC-14 Failure isolation.** If match fails, the summary, action items, and embeddings from process and embed stay intact. You see a toast and a "Check again" button in the tab.
- **AC-15 Prep.** `/api/prep` returns up to 5 open or overdue items most similar to the title plus notes, as a separate `ledgerItems` list, and PrepPage shows them.
- **AC-16 Evaluation.** `scripts/ledger-eval.ts` runs the real judge on a labelled JSON set and prints precision and recall per relation and per language, plus Cohen's kappa between the two human labels.
- **AC-17 Loading.** The Ledger tab uses `useLoadingTimeout` with `LoadError`, design tokens only, and react-hot-toast only.

## Decision

We recommend you build the Promise Ledger as an extension of the current pipeline:

1. Extend the single extraction call in `/api/ai/process` with a `ledgerItems` array. No second LLM call at process time.
2. Store items and links in two new tables, `ledger_items` and `ledger_links`, owned through `meetings.user_id`.
3. Add `POST /api/ledger/match`, chained by the client after embed. It ranks candidates with a new pgvector RPC, then makes one judge call through `generateStructuredWithFallback`.
4. Add `GET /api/ledger` and `POST /api/ledger/links/[id]/review` for the tab.
5. Keep the AI as a suggester. Final status changes only when you confirm.

## Feature design

### Data model

Ownership always comes from `meetings.user_id`. Both tables get RLS enabled with no policies (service role only), matching the existing tables.

**`ledger_items`**

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | `gen_random_uuid()` |
| meeting_id | uuid FK → meetings | no | on delete cascade |
| action_item_id | uuid FK → action_items | yes | on delete set null |
| kind | text | no | check in (`decision`, `promise`) |
| statement | text | no | plain English restatement |
| quote | text | no | verbatim from the transcript |
| quote_language | text | no | check in (`en`, `ur`, `mixed`) |
| speaker | text | yes | who said it |
| assignee | text | yes | promises only |
| due_date | date | yes | promises only |
| line_number | int | no | 1 based line in `transcripts.raw_text` |
| status | text | no | check in (`open`, `kept`, `reversed`), default `open` |
| embedding | vector(768) | yes | filled by match; null until then |
| created_at | timestamptz | no | default now() |

Index on `meeting_id`. No vector index (small scale; a sequential scan is fine).

**`ledger_links`**

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | |
| item_id | uuid FK → ledger_items | no | on delete cascade |
| evidence_meeting_id | uuid FK → meetings | no | on delete cascade |
| relation | text | no | check in (`kept`, `reversed`) |
| quote | text | no | verbatim from the evidence transcript |
| speaker | text | yes | |
| line_number | int | no | line in the evidence transcript |
| confidence | real | no | 0 to 1 |
| state | text | no | check in (`suggested`, `confirmed`, `rejected`), default `suggested` |
| decided_at | timestamptz | yes | set on confirm or reject, cleared on reset |
| created_at | timestamptz | no | default now() |

Unique on (`item_id`, `evidence_meeting_id`). Index on `evidence_meeting_id`.

**Trigger.** We recommend an `after delete` trigger on `ledger_links`: when a deleted link was `confirmed`, recompute the item's status from its remaining confirmed links (latest `decided_at` wins), else set it to `open`. This covers the case where you delete the evidence meeting and its links cascade away.

**Derived status (read time only).** `overdue` = status `open` and `due_date < today`. `today` comes from the client so time zones never shift it.

### API contracts

These are additions to the API Contracts list. Run `/sync` to write them into AGENTS.md before you code (see Follow-up).

```
POST /api/ai/process               → (extended) also extracts up to 15 ledger items into ledger_items
POST /api/transcript/upload        → (extended) optional meetingDate (YYYY-MM-DD) sets started_at on new meetings only
POST /api/ledger/match             → owner only: match this meeting's transcript against earlier open ledger items, store suggested links
GET  /api/ledger                   → owner only: ?meetingId=&today=YYYY-MM-DD, this meeting's items + links, incoming links, reversal count
POST /api/ledger/links/[id]/review → owner only: { decision: "confirm" | "reject" | "reset" }
POST /api/prep                     → (extended) adds a deterministic ledgerItems list (top 5 open or overdue)
```

**Errors for all new routes:** 401 signed out, 400 bad body or query, 404 meeting or link not found or not yours, 409 when match runs before the transcript or chunks exist, 500 on a database failure. The LLM failure in match returns 502 and writes nothing.

### Extraction (inside `/api/ai/process`)

Extend `extractionResultSchema` in `src/agent/types.ts`:

```ts
ledgerItemSchema = z.object({
  kind: z.enum(["decision", "promise"]),
  statement: z.string(),
  quote: z.string(),
  quoteLanguage: z.enum(["en", "ur", "mixed"]),
  speaker: z.string().nullable(),
  assignee: z.string().nullable(),
  dueDate: z.string().nullable(),
  actionItemIndex: z.number().int().nullable(),
})
extractionResultSchema = { insights, actionItems, ledgerItems: z.array(ledgerItemSchema).max(15) }
```

Use `.nullable()`, never `.optional()`, as the existing schemas do.

Prompt additions:
- Give the meeting date (from `meetings.started_at`, as YYYY-MM-DD) and tell the model to resolve relative dates from it.
- Ask for the quote copied exactly, in the original language and script, one transcript line at most.
- Ask for `actionItemIndex` as the zero based index into the `actionItems` array it returns, or null.
- Ask for at most 15 items, the most important first.

Server steps after the call (new helper, recommended `src/agent/ledger.ts`):
1. `findQuoteLine(rawText, quote)`: normalise both (lowercase, collapse whitespace, trim) and return the 1 based line number, or null. Strip a leading `Speaker:` label from the quote before the search if the model included it.
2. Drop items with no line. Log `[ledger] dropped unverified quote` with the meeting id and kind (never the quote text).
3. `dueDate` goes through `normalizeDueDate`. Assignee and due date are set to null for decisions.
4. Map `actionItemIndex` to the id from the action items insert (which already returns `id`). Out of range means null.
5. Reprocess: delete this meeting's `ledger_items` that have no confirmed or rejected link, then skip any new item whose normalised quote equals a kept item's quote.
6. Insert. A ledger insert failure is logged and does not fail process (insights and action items are already saved).

Because the transcript cap is `MAX_TRANSCRIPT_CHARS` (16000), items beyond that point are not extracted. That is the same limit summary has today.

### Matching (`POST /api/ledger/match`)

Body `{ meetingId }`. Steps:

1. Auth and owner check on `meetings`. Load the transcript (409 if none) and confirm chunks exist (409 if none).
2. Embed this meeting's ledger items where `embedding is null`, using the existing 768 dim Gemini embedding (`embedMany` with `EMBEDDING_MODEL`). Embed the `statement`. An embedding failure is logged; those items are just not matchable yet.
3. Call a new RPC, recommended name `match_ledger_candidates(p_meeting_id uuid, p_user_id text, match_count int)`. It returns the owner's ledger items with status `open`, with an embedding, from meetings whose `started_at` is before this meeting's, ranked by their best cosine similarity to any chunk of this meeting. Limit 15 (`LEDGER_CANDIDATE_LIMIT`).
4. No candidates means return `{ matched: 0 }`.
5. One judge call (`judgeLedgerCandidates` in `src/agent/ledger.ts`) through `generateStructuredWithFallback`. Input: the transcript (16000 cap) with line numbers and the candidate list (id, kind, statement, quote, assignee, due date). Output schema:

```ts
z.object({ verdicts: z.array(z.object({
  itemId: z.string(),
  relation: z.enum(["kept", "reversed", "none"]),
  confidence: z.number(),
  quote: z.string().nullable(),
})) })
```

6. Keep a verdict only when: the item id is one of the candidates, relation is not `none`, confidence is at least `LEDGER_CONFIDENCE_THRESHOLD = 0.7`, and the quote is found by `findQuoteLine` (which also gives the line number and the speaker from the line prefix).
7. Upsert on (`item_id`, `evidence_meeting_id`), but only where the existing row is `suggested` or missing. Never overwrite confirmed or rejected rows.
8. Return `{ matched: n }`. Writes happen only after the judge succeeds.

Tell the judge that "kept" needs evidence the promise was done or the decision was carried out, "reversed" needs evidence it was undone or contradicted, and anything weaker is "none". Tell it to answer "none" when unsure.

### Read (`GET /api/ledger`)

Query `meetingId` and `today` (YYYY-MM-DD; 400 if malformed). Returns:

```ts
{
  items: Array<LedgerItem & { derivedStatus: "open" | "overdue" | "kept" | "reversed"; links: LedgerLink[] }>,
  incoming: Array<LedgerLink & { item: LedgerItem; sourceMeeting: { id: string; title: string; startedAt: string } }>,
  reversalCount: number,
}
```

`reversalCount` counts links in `incoming` with relation `reversed` and state not `rejected`. Types go in `src/lib/meeting-types.ts` next to the others.

### Review (`POST /api/ledger/links/[id]/review`)

Body `{ decision: "confirm" | "reject" | "reset" }`. Owner check walks link → item → meeting.
- **confirm**: state `confirmed`, `decided_at = now()`, item status = link relation.
- **reject**: state `rejected`, `decided_at = now()`, then recompute the item status.
- **reset**: state `suggested`, `decided_at = null`, then recompute the item status.

Recompute = the relation of the confirmed link with the latest `decided_at`, else `open`. Put it in one helper used by all three and by the trigger logic in SQL, so the rule lives in one place per layer.

### Upload meeting date

`POST /api/transcript/upload` accepts optional `meetingDate` (YYYY-MM-DD). Validate the format and that it is not in the future. On the new meeting branch, set `started_at` and `ended_at` to that date at noon UTC. Ignore it when `meetingId` is given. The modal adds an optional date input under the title.

### Client chaining

- `UploadTranscriptModal.tsx`: after embed succeeds, call `/api/ledger/match`. A match failure shows a react-hot-toast warning ("Promise matching did not finish. Open the Ledger tab and press Check again.") and does not block success.
- `MeetingDetail.tsx` `retrySummary`: process, then embed, then match, the same way.
- Match uses its own AbortController with the same 120 s budget pattern.

### UI: Ledger tab

- Add `"Ledger"` to `TABS` in `MeetingTabs.tsx` and hide it for non owners in `VISIBLE_TABS`, the same way Recording is hidden.
- The tab label shows a small count badge when `reversalCount > 0` (`bg-error-container text-error`).
- New `LedgerTab.tsx` in `src/components/meeting-intelligence/`, following the `ActionItemsTab` and `EngagementTab` patterns and `context/ui-tokens.md`. It fetches `GET /api/ledger` with the local `today`.
- **Reversal card** at the top when `reversalCount > 0`: `bg-error-container text-error`, lists each reversed item with both quotes.
- **Said in this meeting**: each item shows a kind badge, the statement, the quote with speaker and line number, assignee and due date for promises, a status badge (open, overdue, kept, reversed), and any links to later meetings.
- **Matches found in this meeting**: each incoming link shows the earlier item's quote and the new quote side by side, the source meeting title and date, confidence, and buttons Confirm, Not a match, and Undo (Undo only when not suggested).
- **Check again** button calls match and then refetches.
- Empty states: "No decisions or promises found in this meeting." and "No earlier promises were mentioned here yet." Never claim something was not done; say "no evidence found yet".
- Loading uses `useLoadingTimeout` plus `LoadError`. Review buttons disable while their request runs. Errors use react-hot-toast.

### Prep hook (last slice)

In `src/agent/prep.ts`, after the existing title plus notes embedding, call a small RPC or query that ranks the user's `open` ledger items by cosine similarity to that same embedding (top 5, `LEDGER_PREP_LIMIT`). Return them as a separate `ledgerItems` field next to the LLM output, not generated by the LLM. Overdue is computed with the server date here (prep has no client date today; that small difference is acceptable). `PrepPage.tsx` shows them as "Open promises and decisions" with a link to each source meeting.

### Evaluation

- `scripts/ledger-eval/pairs.json`: 30 to 50 labelled pairs, about half code mixed. Each pair has the item (kind, statement, quote, language), an evidence transcript snippet, `label_a`, and `label_b` (`kept`, `reversed`, or `none`).
- `scripts/ledger-eval.ts`, run with `npx tsx scripts/ledger-eval.ts`. It calls the same `judgeLedgerCandidates` used in production, with `label_a` as truth (disagreements resolved into `label_a` before scoring).
- It prints precision and recall for `kept` and `reversed`, split by `en`, `ur`, and `mixed`, plus Cohen's kappa between `label_a` and `label_b`.
- `scripts/ledger-demo/` holds three seeded bilingual transcripts for the demo story (the Vercel decision later reversed by moving to AWS; Ali's "Friday tak survey" promise goes overdue, then is kept). You upload them with backdated Meeting dates.

### Value sourcing

| Value | Source |
|---|---|
| `ledger_items.meeting_id` | the `meetingId` process already validated |
| `kind`, `statement`, `quote`, `quote_language`, `speaker`, `assignee` | extraction LLM output |
| `due_date` | LLM `dueDate` through `normalizeDueDate`, resolved against the meeting date |
| `line_number` | server `findQuoteLine` on `transcripts.raw_text` |
| `action_item_id` | `actionItemIndex` mapped to ids returned by the action items insert |
| `status` | default `open`; changed only by review or the trigger |
| `embedding` | Gemini `EMBEDDING_MODEL` on `statement`, at match time |
| meeting date for the prompt | `meetings.started_at`, set from upload `meetingDate` or call start |
| candidate list | `match_ledger_candidates` RPC, `started_at` before this meeting, owner via `meetings.user_id` |
| `ledger_links.relation`, `confidence` | judge LLM output, filtered by the 0.7 threshold |
| `ledger_links.quote`, `line_number`, `speaker` | judge quote verified by `findQuoteLine`; speaker from the line's `Speaker:` prefix |
| `ledger_links.state`, `decided_at` | review route only |
| `derivedStatus` | GET route, from `status`, `due_date`, and the `today` query |
| `today` | the client's local date |
| prep `ledgerItems` | similarity of open items to the existing prep embedding |

### Critical test scenarios

| Scenario | Expected | AC |
|---|---|---|
| Mixed Urdu English transcript with "Ali: main Friday tak survey bhej dunga" | One promise, `quote_language` `mixed`, assignee Ali, due date the Friday after the meeting date, correct line number | AC-1, AC-4 |
| LLM returns a quote that is not in the transcript | Item dropped, `[ledger]` log line, nothing stored | AC-2 |
| Promise that is also an action item | `action_item_id` set to that row | AC-3 |
| Later meeting says "survey bhej diya tha" | Suggested `kept` link with the verified quote and line | AC-6, AC-7 |
| Judge returns confidence 0.6 | No link stored | AC-7 |
| Match runs twice after you confirmed a link | Confirmed link unchanged, suggested links refreshed | AC-8 |
| Confirm, then Undo | Item goes to the relation, then back to `open` | AC-9 |
| Open promise due yesterday, client `today` is today | `derivedStatus` `overdue` | AC-10 |
| Later meeting reverses a decision | Red card shows, tab badge shows 1 | AC-11 |
| Another user calls any ledger route for your meeting | 404; signed out gets 401; tab hidden | AC-12 |
| Reprocess after one item was confirmed | Confirmed item kept, others replaced, no duplicate of the kept quote | AC-13 |
| Judge call throws on both providers | 502, no writes; summary and chunks intact; toast plus Check again | AC-14 |
| Upload with Meeting date 2026-10-01 | `started_at` is 2026-10-01; ignored when attaching to an existing meeting | AC-5 |
| Prep for a topic with a related open promise | It appears in `ledgerItems` | AC-15 |
| Eval run on the pairs file | Per relation and per language precision and recall, plus kappa | AC-16 |

### Constants

`LEDGER_MAX_ITEMS = 15`, `LEDGER_CANDIDATE_LIMIT = 15`, `LEDGER_CONFIDENCE_THRESHOLD = 0.7`, `LEDGER_PREP_LIMIT = 5`, all in `src/agent/ledger.ts`. No new env vars.

## Build plan

We recommend these slices in order. Each one works end to end before the next starts.

1. **Schema plus extraction plus read plus a basic tab** (AC-1, AC-2, AC-3, AC-4, AC-12, AC-13, AC-17)
   - Add both tables, indexes, checks, RLS, and the delete trigger to `supabase/schema.sql` and run it in Supabase.
   - Extend the schema and prompt in `src/agent/types.ts` and `/api/ai/process`; add `src/agent/ledger.ts` with `findQuoteLine` and the insert and reprocess logic.
   - Add `GET /api/ledger` and the types.
   - Add the owner only Ledger tab with the "Said in this meeting" list.
2. **Match** (AC-6, AC-7, AC-8, AC-14)
   - Add the `match_ledger_candidates` RPC.
   - Add `POST /api/ledger/match` and `judgeLedgerCandidates`.
   - Chain it in the upload modal and `retrySummary`; add the Check again button.
3. **Review plus alert** (AC-9, AC-10, AC-11)
   - Add `POST /api/ledger/links/[id]/review`.
   - Add the "Matches found in this meeting" section, the reversal card, and the tab badge.
4. **Meeting date** (AC-5)
   - Extend upload and the modal.
5. **Prep hook** (AC-15)
   - Extend `src/agent/prep.ts` and `PrepPage.tsx`.
6. **Evaluation and demo seed** (AC-16)
   - Add the eval script, the pairs file, and the demo transcripts.
7. **Tests and verification** (all ACs)
   - Vitest units for `findQuoteLine` (Urdu script, Roman Urdu, extra spaces, speaker prefix), status recompute, overdue derivation, verdict filtering, and the reprocess keep rule.
   - Route tests for 401 and 404 on the three new routes.
   - Run `npx tsc --noEmit`, lint, `npm run build`, and `npx vitest run`.
   - Manual run of the three demo meetings.

## Consequences

- **Good:** the feature reuses the existing models, embeddings, and pgvector, so cost stays zero and the codebase grows by one module, three routes, and one tab.
- **Good:** every claim carries a verified quote and line number, and nothing is final without you, which keeps false positives visible and correctable.
- **Cost:** process output grows, so the extraction response is larger. The 15 item cap keeps it inside the current response size.
- **Cost:** one extra embed call and one extra LLM call per processed meeting, inside the free tier for demo scale.
- **Limit:** transcripts have no timestamps, so proof is a line number, not a time.
- **Limit:** recording transcripts are translated to English (F9), so Urdu quotes only exist for uploaded transcripts.
- **Limit:** only the first 16000 characters of a transcript are read, for both extraction and matching.
- **Risk:** the judge can still be wrong. The threshold, the verified quote, owner review, and the eval numbers are the mitigations.

## Follow-up

- Run `/sync` to add the new and extended routes (and the optional `meetingDate` on upload) to the AGENTS.md API Contracts list before you start building.
- Check Gong's "next steps" tracking (and Fathom, tl;dv, Krisp) again before the viva so the claim stays "none of the major platforms or notetakers we reviewed".
- Add a Supabase keep alive ping (the free project pauses after a week idle), so the demo database is awake on viva day.
- Add a short privacy note that transcripts go to the Gemini free tier, which may use inputs to improve its models.
- Check the Gemini daily quota against the demo plan (process plus embed plus match per meeting, plus eval runs).
- For the demo, use uploaded code mixed transcripts. Recording transcripts come back in English only (F9).

## Rationale

See [rationale.md](rationale.md).
