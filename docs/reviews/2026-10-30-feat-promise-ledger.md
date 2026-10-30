# Review, feat/promise-ledger, 2026-10-30

**Reviewed by**: Sonnet 5.5 review subagent (author on a different model)
**Scope**: ~45 code and test files, branch vs main (merge base 2251f0d) plus uncommitted working tree
**Verdict**: Approve with nits

## Summary
Adds the Promise Ledger: extraction inside /api/ai/process, quote verification against the transcript, pgvector candidate matching, a judge call, owner-only ledger/match/review routes, a Ledger tab, upload meeting date, and a prep hook. Routes follow the AGENTS.md contract, are owner-scoped, never throw out of the ledger write path, and every stored quote is verified in the transcript. The Gemini 30 s abort in models.ts is sound. No blockers or majors found; remaining items are edge cases.

## Minor
### 🟡 Early return skips stale-suggestion cleanup, `src/agent/ledger-match.ts:97`
**Problem**: When `candidates.length === 0` the function returns before the "drop suggestions this run did not repeat" step. A suggested link whose item stopped being a candidate (item status changed, embedding cleared) stays forever.
**Why it matters**: A rerun ("Check again") can leave a stale suggestion the owner can no longer clear.
**Suggested fix**: Run the stale-deletion step for the empty-candidate case too (treat fresh as empty).

### 🟡 Upsert can overwrite a review made during a match run, `src/agent/ledger-match.ts:112-157`
**Problem**: `locked` is read before the judge-free write window; the upsert on (item_id, evidence_meeting_id) sets state back to suggested. A confirm/reject saved between the read and the upsert (concurrent upload auto-match plus manual "Check again") is reset.
**Why it matters**: Silently loses an owner decision; narrow race but it is the product's core promise (owner decides).
**Suggested fix**: Make the upsert skip rows whose state is not suggested (insert with ignore-duplicates, then update only suggested rows), or add a state guard in SQL.

### 🟡 Speaker-prefix regex can eat non-speaker text, `src/agent/ledger.ts:23`
**Problem**: `SPEAKER_PREFIX` strips any short letter-containing label before a colon, so a quote like "Deadline is 5:30" becomes "30" and is dropped as too short; "Note: ship Friday" is stored without "Note:".
**Why it matters**: Valid items are silently dropped or stored truncated.
**Suggested fix**: Try matching the full quote first and only fall back to the stripped form; or require the label to match a speaker seen in the transcript lines.

### 🟡 Status recompute not atomic with the review update, `src/app/api/ledger/links/[id]/review/route.ts:92-98`
**Problem**: Link update and `recomputeLedgerItemStatus` are two calls; if the RPC fails the link state is saved but item status is stale and the client sees a 500 and retries.
**Why it matters**: Item badge can disagree with confirmed links until the next review.
**Suggested fix**: Move the update into one SQL function, or recompute from the trigger.

### 🟡 30 s primary timeout is applied to the large process call, `src/agent/models.ts:95`
**Problem**: /api/ai/process now asks for summary, action items and up to 15 ledger items from up to 16k chars; 30 s may often be too short for Gemini, silently routing long transcripts to the Groq fallback (different quality, Urdu handling).
**Why it matters**: Quality drifts with no signal. Cleanup already got a 90 s override; process did not. The Groq fallback itself has no abort.
**Suggested fix**: Pass a larger `primaryTimeoutMs` from the process route (and consider a Groq timeout), keeping total under the client 120 s budget.

### 🟡 Equal started_at excludes earlier items, `supabase/schema.sql` (match_ledger_candidates)
**Problem**: `m.started_at < current.started_at` is strict; two uploads given the same meeting date both get noon UTC, so neither sees the other's items.
**Why it matters**: Same-day follow-up meetings never match.
**Suggested fix**: Use `<=` plus `li.meeting_id <> p_meeting_id`, or tie-break on created_at.

### 🟡 No rate limit on the LLM-backed match route, `src/app/api/ledger/match/route.ts:9`
**Problem**: Each POST runs embeddings plus a judge call; owner-only but unbounded.
**Why it matters**: Free-tier quota exhaustion by repeated clicks or scripts.
**Suggested fix**: Cheap guard (skip when a match finished in the last N seconds, or reject concurrent runs per meeting).

## Nits
- ⚪ `src/app/api/ledger/links/[id]/review/route.ts:51` (known item a): invalid body returns 400 before the 404 ownership check; harmless, no data leaked.
- ⚪ `src/agent/ledger.ts:54` first matching line wins for short quotes; a repeated phrase can map to the wrong line number.
- ⚪ `supabase/schema.sql` no vector index on `ledger_items.embedding`; fine at this scale.
- ⚪ `src/components/meeting-intelligence/MeetingTabs.tsx:127` one long line (file already has prettier disabled).

## Strengths
- Quote verification before storage (and for judge verdicts) means the AI cannot invent evidence; Urdu and mixed script handled with NFC normalisation and `dir="auto"`.
- Auth and ownership are consistent on all three ledger routes, ledger writes never fail processing, 502 on judge failure writes nothing, and reviewed items survive re-processing.
- Gemini timeout fix is correct: `AbortSignal.timeout` on the primary only, `maxRetries: 0`, any abort falls to Groq, with fake-timer tests covering the abort and fallback paths.
- Loading states use `useLoadingTimeout` + `LoadError`; no hardcoded hex or raw color classes found; react-hot-toast only.

## Test coverage
Strong: ledger.ts, ledger-match.ts, ledger-write, all three routes, process and upload routes, models timeout, prep, client helpers and UI components all have tests (354 pass). Gaps: no test for the empty-candidate stale-suggestion case, the concurrent review-vs-match race, or colon-containing quotes in `stripSpeakerPrefix`.
