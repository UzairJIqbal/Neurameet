# Step S1, slice 2: Promise Ledger matching (RPC, judge, match route, client chaining, Check again)

Spec: `docs/specs/0001-promise-ledger/index.md` (Status In Progress, tier GA). This prompt covers Build plan slice 2 only and satisfies AC-6, AC-7, AC-8, AC-14. The routes are already in the AGENTS.md API Contracts list. Slice 3 (review buttons, reversal card, tab badge) comes next.

## 1. Schema: `match_ledger_candidates` RPC (`supabase/schema.sql`, then apply via the Supabase MCP)

```sql
create or replace function match_ledger_candidates(
  p_meeting_id uuid,
  p_user_id text,
  match_count int default 15
)
returns table (id uuid, meeting_id uuid, kind text, statement text, quote text,
               assignee text, due_date date, similarity float)
language sql stable set search_path = public
as $$
  select li.id, li.meeting_id, li.kind, li.statement, li.quote, li.assignee, li.due_date,
         best.similarity
  from ledger_items li
  join meetings m on m.id = li.meeting_id
  cross join lateral (
    select max(1 - (mc.embedding <=> li.embedding)) as similarity
    from meeting_chunks mc where mc.meeting_id = p_meeting_id
  ) best
  where m.user_id = p_user_id
    and li.status = 'open'
    and li.embedding is not null
    and li.meeting_id <> p_meeting_id
    and m.started_at < (select started_at from meetings where id = p_meeting_id)
    and best.similarity is not null
  order by best.similarity desc
  limit match_count;
$$;
GRANT EXECUTE ON FUNCTION match_ledger_candidates(uuid, text, int) TO service_role;
```

Apply as migration `promise_ledger_slice2_match_rpc`, then confirm it exists (`pg_proc`) and run the security advisors.

## 2. Embedding helper (`src/agent/embed.ts`)

Export `embedTexts(values: string[]): Promise<number[][]>` that reuses the existing batching (100 per request) and `embedWithRetry` (768 dims). `embedAndStore` switches to it, no behavior change.

## 3. Judge and pure filters (`src/agent/ledger.ts`)

* `ledgerVerdictSchema` (exact spec shape: `verdicts[] { itemId, relation: kept|reversed|none, confidence, quote: nullable }`).
* `LedgerCandidate` type (id, kind, statement, quote, assignee, dueDate).
* `numberTranscriptLines(rawText, maxChars = 16000)`: `"N: line"` per line, cut at the same 16000 char cap process uses.
* `judgeLedgerCandidates({ rawText, candidates })`: one `generateStructuredWithFallback` call. Prompt rules from the spec: "kept" needs evidence the promise was done or the decision carried out; "reversed" needs evidence it was undone or contradicted; anything weaker is "none"; answer "none" when unsure; quote copied exactly from ONE line, original language and script, no speaker label. Throws on failure (the route turns that into 502). No `server-only`, so the slice 6 eval script can import it.
* `filterVerdicts({ verdicts, candidateIds, rawText })` (pure, unit tested): keeps a verdict only when the id is a candidate, relation is not `none`, confidence ≥ `LEDGER_CONFIDENCE_THRESHOLD`, and `findQuoteLine` finds the quote (gives line number and speaker). One verdict per item (first wins). Logs `[ledger] dropped unverified verdict quote` with item id only.

## 4. Match orchestration (`src/agent/ledger-match.ts`, new, `server-only`)

`runLedgerMatch(supabase, { meetingId, userId, rawText })`:
1. Embed this meeting's items where `embedding is null` (the `statement`), update each row. Failure is logged, not fatal.
2. RPC `match_ledger_candidates` with `LEDGER_CANDIDATE_LIMIT`. None → `{ matched: 0 }`.
3. Judge (throws → caller returns 502, nothing written).
4. `filterVerdicts`.
5. Load existing links for `evidence_meeting_id = meetingId`. Item ids with a `confirmed` or `rejected` link are locked and never touched (AC-8).
6. Delete this meeting's `suggested` links that the new run did not suggest again (so a rerun refreshes suggestions). Deleting a suggested link never fires the status trigger.
7. Upsert the kept verdicts (not locked) on `item_id,evidence_meeting_id` with state `suggested`, `decided_at` null.
8. Return `{ matched: n }`.

## 5. `POST /api/ledger/match` (`src/app/api/ledger/match/route.ts`, new)

`runtime = "nodejs"`, `dynamic = "force-dynamic"`. 401 signed out; 400 missing `meetingId`; 404 not owner (`meetings.user_id`); 409 no transcript text or no `meeting_chunks` rows; 502 judge failure; 500 database failure. Mirrors `GET /api/ledger`.

## 6. Client chaining

* New `src/lib/ledger-match-client.ts`: `requestLedgerMatch(meetingId, parentSignal?)` with its own `AbortController` and a 120 s timer (also aborts when the parent signal aborts). Returns `true` on 2xx, `false` otherwise. One place for the three callers.
* `UploadTranscriptModal.tsx`: only after embed succeeds, call it before redirecting. Failure keeps success and adds `toast.error("Promise matching did not finish. Open the Ledger tab and press Check again.")`. A user Cancel still ends the flow quietly.
* `MeetingDetail.tsx` `retrySummary`: process, then embed (new here; failure toasts the existing chat indexing message and skips match), then match (failure toasts the same warning). Bumps a `ledgerVersion` counter passed `MeetingTabs → LedgerTab` so the tab refetches.

## 7. Ledger tab

* **Check again** button (secondary button style, `RefreshCw` icon) in the tab header: disabled and labelled "Checking…" while running, calls `requestLedgerMatch` then refetches; failure toasts the warning above.
* **Matches found in this meeting** section (read only this slice): for each incoming link, the earlier item's quote and the new quote side by side (stacked on mobile), relation badge (kept / reversed, existing status tokens), source meeting title and date, confidence as a percent, "Suggested" state label. Empty state: "No earlier promises were mentioned here yet." Confirm, Not a match, Undo come in slice 3.
* Tokens only, `useLoadingTimeout` + `LoadError` unchanged, react-hot-toast only.

## 8. Tests (vitest)

* `src/agent/ledger.test.ts`: `filterVerdicts` (below 0.7 dropped, exactly 0.7 kept, `none` dropped, unknown id dropped, unverified quote dropped, Urdu quote verified with line and speaker, duplicate item first wins); `numberTranscriptLines` (numbering, cap).
* `src/agent/ledger-match.test.ts`: locked confirmed/rejected link not upserted; stale suggested link deleted; judge throw propagates with no writes; no candidates returns 0 without calling the judge.
* `src/app/api/ledger/match/route.test.ts`: 401, 400, 404 not owner, 409 no transcript, 409 no chunks, 502 judge failure, 200 `{ matched }`.

## 9. Checks and bookkeeping

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`. Update `context/progress-tracker.md` and `context/ui-registry.md`; tick slice 2 in the spec Build plan and the second milestone in `docs/scope/scope.md`.

## Known limits (reported, not fixed here)

* Items from meetings processed before this slice have no embedding, so they only become candidates after that meeting's own match runs (Retry summary or Check again on it).
* Candidates need an earlier `started_at`; until slice 4 (meeting date on upload), uploads in the same order as the real meetings are what makes matching work.

## Manual test steps (after build)

1. Upload meeting A with `Ali: main Friday tak survey bhej dunga`. Then upload meeting B with `Ali: survey bhej diya tha kal`. B's Ledger tab, Matches section: a suggested `kept` link with the B quote and its line (AC-6, AC-7). A's tab: the promise shows the later meeting link.
2. Supabase: `ledger_links` has one row for that pair; every stored quote appears in B's transcript; `confidence >= 0.7` (AC-7).
3. Press Check again twice on B: still one row per pair (AC-8). Set that row to `confirmed` in SQL, press Check again: row unchanged (AC-8).
4. Temporarily break both providers (bad `GOOGLE_GENERATIVE_AI_API_KEY` and `GROQ_API_KEY` in `.env.local`), press Check again: toast warning, route 502, summary and chat still work (AC-14). Restore the keys.
5. Another user calls `POST /api/ledger/match` for your meeting: 404; signed out: 401.
