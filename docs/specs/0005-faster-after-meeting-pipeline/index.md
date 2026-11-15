# 0005. Faster after meeting pipeline

**Date**: 2026-11-15
**Status**: Proposed

## Summary

After a call, the transcript, summary, and action items take too long because the work waits on a busy Gemini model, runs steps one after another, and only starts when the after meeting page asks for it. This spec keeps every tool free and fixes the waiting instead: a faster model fallback, timing logs saved per step, the promise matching moved off the page, and a Stream webhook (a message Stream sends our server) that starts the work the moment the recordings are ready. The page shows a short step list so you can see where it is.

## Requirements

**User stories**:
- As a meeting owner, I want the summary and action items ready soon after the call so that I do not sit on the after meeting page waiting.
- As a meeting owner, I want to see which step is running so that a slow step is visible instead of a long spinner.
- As the developer, I want each step's time saved so that I can see the slow step after a live test, even after Vercel's one hour log window is gone.

**Acceptance criteria**:
- **AC-1**: Every structured AI call tries Gemini Flash, then Gemini Flash Lite (`gemini-3.5-flash-lite`), then Groq. The Flash Lite call sends no `thinkingConfig`.
- **AC-2**: After a Flash failure, structured calls start at Flash Lite for the next 60 s, then try Flash again.
- **AC-3**: The Flash step is capped at 15 s for every caller, including transcript cleanup. The Flash Lite step uses the caller's timeout (90 s for cleanup, 30 s by default).
- **AC-4**: The chat probe tries Flash, then Flash Lite, then Groq, and caches the result for 60 s as today.
- **AC-5**: Each pipeline step (recording wait, Whisper, cleanup, process, embed, ledger match) saves its status, start time, end time, duration, and the model that answered into `transcripts.pipeline`, and writes one `[pipeline]` log line.
- **AC-6**: `POST /api/stream/webhook` reads the raw body with `req.text()`, rejects a request whose signature fails `verifyWebhook` or whose `x-api-key` is wrong with 401, ignores any event type other than `call.recording_ready` and any recording whose type is present and not individual (200, no work), answers 200 for a valid one within about 1 s, and does all work inside `after()`.
- **AC-7**: On `call.recording_ready` for a known meeting, the server first skips when the transcript is `ready` or the meeting already has a summary. Otherwise it takes the transcript lock before waiting, so a later or concurrent event returns at once. Only the winner waits for the individual recordings to settle (all expected participants have a track, or no new track for 45 s, capped at 60 s, polled every 5 s by server time), then generates the transcript. A repeated event never starts a second run and never rewrites a finished transcript.
- **AC-8**: The run carries one deadline (request start + 280 s) into Whisper, cleanup, process, and embed. Whisper stops starting new chunks or tracks past the deadline and marks the step failed with reason `deadline`. When the transcript is saved and at least 100 s remain, the server runs process and embed for the meeting owner; otherwise it leaves them for the page fallback or the daily sweep.
- **AC-9**: Ledger match runs on the server at most once per meeting, as soon as both the summary and the chunks exist, from the `after()` of whichever of process or embed finishes second (each checks after its own write commits). A failed or stale ledger step is retried by the daily sweep. The page no longer waits for it.
- **AC-10**: The after meeting page shows three steps (Recording ready, Transcript, Summary and action items), each waiting, running, done, or failed per the step derivation table, read from `GET /api/transcript/status`. It redirects as soon as the summary is saved.
- **AC-11**: When the webhook never fires (not configured, or Stream is late), the page still starts the transcript and the summary itself, as it does today. Process is guarded by its own claim, so the page and the server never both run it.
- **AC-12**: The daily cron sweeps up to 5 meetings, oldest first, that ended more than 1 hour ago and are stuck: a stale `pending` transcript (regenerate), a ready transcript with no summary (process), no chunks (embed), or a failed or stale ledger step (ledger match). It records `source: "cron"`.
- **AC-13**: The server path keeps every existing rule: the minutes lock 409, project meetings write proposals and never follow ups, and the owner's stored email toggle decides the summary email.

## Decision

**Chosen option**: Option 3: Free fixes plus a server start on recording ready.

Stay on the free Gemini and Groq tiers, fail over fast, measure every step, and move the pipeline start to the server through Stream's `call.recording_ready` webhook, with the current page flow kept as the fallback.

**Implementation skills**: `stream-react` (GetStream official, `.claude/skills/stream-react/`) · `architect` (`jsmastery-pro/skills`, `.claude/skills/architect/`)

## Feature design

**Data model sketch**:
- `transcripts.pipeline jsonb` nullable, default null. Shape:
  `{ source: "webhook" | "page" | "cron", steps: { recording | whisper | cleanup | process | embed | ledger: { status: "running" | "done" | "failed" | "skipped", startedAt, endedAt, ms, model? } } }`
- `steps.<step>` may also carry `reason` (text, e.g. `deadline`) on a failed step.
- RPC `pipeline_mark(p_meeting uuid, p_step text, p_patch jsonb)`: merges one step atomically with `jsonb_set`, so parallel process and embed writes never overwrite each other. It never creates the transcripts row; the webhook's claim creates it (the existing `claimTranscriptGeneration` inserts the row when missing), so the `recording` step is marked after the claim.
- RPC `claim_pipeline_step(p_meeting uuid, p_step text) returns boolean`: sets `steps.<p_step>` to running (with `startedAt` = `now()`) only when it is null, or failed, or running with `startedAt` more than 5 minutes ago. True means this caller runs the step. Used for `process` and `ledger` (replaces the separate `claim_ledger_match`).
- Both go into `supabase/schema.sql` as an additive change. No existing column changes.

**State transitions** (one step): null → running → done | failed | skipped. A failed step, or a running step whose `startedAt` is more than 5 minutes old (stale), may be claimed again.

**Step derivation** (what `GET /api/transcript/status` returns in `steps`; first matching row wins):
| Step | done | failed | running | waiting |
|---|---|---|---|---|
| recording | `processing_state` is not `no_recording`, or `steps.recording` is done | `no_recording` is final (existing 20 min rule) | `steps.recording` is running and not stale | otherwise |
| transcript | `rawTextAvailable` | `processing_state` is `failed` or `too_short`, or `steps.whisper` failed | `processing_state` is `pending` and not stale (`PENDING_STALE_MS`, 6 min) | otherwise |
| summary | `hasInsights` | `steps.process` is failed | `steps.process` is running and not stale | otherwise |

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /api/stream/webhook | POST | raw body, `x-signature`, `x-api-key` headers | 200 `{ ok: true }` | Stream signature (public route) | 401 bad signature or wrong api key |
| /api/transcript/status | GET | `meetingId` | existing fields + `steps: { recording, transcript, summary }` each `"waiting" \| "running" \| "done" \| "failed"` | as today | as today |
| /api/ai/process | POST | as today | as today | as today | as today; 409 "Summary is already being created" when the process claim is held; `after()` now calls `maybeRunLedgerMatch` |
| /api/ai/embed | POST | as today | as today | as today | as today; `after()` now calls `maybeRunLedgerMatch` |
| /api/cron/daily | GET | Bearer `CRON_SECRET` | as today + sweep count | as today | as today |

**Shared server functions** (extracted from routes so the webhook, the routes, and the cron run the same code):
- `processMeeting({ meetingId, actorUserId, emailNotifications, deadline?, source })`, from the body of `/api/ai/process` after its auth check. Takes the `process` claim first and returns `"busy"` when it is held. Its AI call timeout is the smaller of the default and the time left to `deadline`.
- `embedMeeting({ meetingId, deadline? })`, from `/api/ai/embed`; stops starting new embedding batches past `deadline`.
- `maybeRunLedgerMatch(meetingId)`: checks summary and chunks exist, calls `claim_pipeline_step(meetingId, "ledger")`, runs `runLedgerMatch`, marks the step done or failed. A failure is left for the daily sweep; it is not retried inline.
- `runServerPipeline({ meetingId, deadline, source })`: skip check, claim, settle, generate, save, then process and embed if at least 100 s remain.
- `generateTranscriptForMeeting` takes a `deadline` instead of the fixed `GENERATION_BUDGET_MS`, checks it before each track and each chunk, and passes the time left as the cleanup timeout cap.
- `generateStructuredWithFallback` returns `{ object, model: "flash" | "lite" | "groq" }`. Existing callers keep destructuring `object`.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Webhook | raw body and headers | `await req.text()` before any parse; headers `x-signature` and `x-api-key`, names confirmed against `@stream-io/node-sdk` types before coding (Stream verification rule) |
| Webhook | meeting | `meetings` row where `stream_call_id` = the text after the first `:` in `call_cid` (`type:id`); unknown call → 200, no work |
| Webhook | skip check | transcript `processing_state` is `ready`, or a `meeting_insights` row exists for the meeting → skip |
| Webhook | expected participant count | distinct `coalesce(stream_user_id, user_id)` in `attendance_events` for the meeting (one row per session; guests carry a `user_id` too, so they count) |
| Webhook | "no new track" clock | server `Date.now()` at each 5 s poll, reset whenever `listRecordings` returns more individual recordings than the last poll |
| Webhook | individual recordings | `client.video.listRecordings` filtered to `recording_type === "individual"`, the same filter as today (the event payload is only the trigger) |
| Webhook | actor for process | `meetings.user_id` (the creator), for both webhook and cron runs (no Clerk session) |
| Webhook / cron | emailNotifications | the owner's row in `user_settings` (the table behind `GET /api/settings/notifications`), true when no row |
| Webhook / cron | `pipeline.source` | `"webhook"` or `"cron"`; the page path writes `"page"` |
| Webhook | language | none passed, Whisper auto detects (same as the page auto start) |
| Webhook | function deadline | request start + 280 s (`maxDuration` 300 minus a 20 s margin) |
| Status | `steps.*` | the step derivation table above |
| Any step | model | the `model` returned by `generateStructuredWithFallback` |
| Any check | summary exists | a `meeting_insights` row exists for the meeting |
| Any check | chunks exist | at least one `meeting_chunks` row for the meeting |
| Cron sweep | "ended" time | `meetings.ended_at`, else the transcript's `updated_at` when `ended_at` is null |
| Cron sweep | candidates | ended more than 1 hour ago and one of: stale `pending` transcript, ready transcript with no summary, summary with no chunks, ledger step failed or stale; oldest first, limit 5 |

**Key invariants**:
- One transcript run per meeting at a time (existing `claimTranscriptGeneration` lock, shared by webhook and page). The webhook never claims a `ready` transcript or a meeting with a summary, because the existing lock alone would allow it.
- The lock is taken before the settle wait. Its stale cutoff (6 min) is longer than the 60 s settle cap plus generation, so a waiting winner is never treated as stale.
- Process and ledger match each run at most once per meeting at a time (`claim_pipeline_step`), unless the previous run failed or went stale.
- The 60 s Flash busy skip is module state, so it only helps inside one warm server instance; the 15 s Flash cap bounds what a cold instance loses.
- The webhook never trusts the payload for authorization: it only names a call, and the server reads the meeting and recordings itself.
- Every AI call stays wrapped in try and catch; a failed step marks itself failed and never throws out of `after()`.
- Groq schema rules stay: `.nullable()`, never `.optional()`, since the chain can still reach Groq.

**Security model**:
- The webhook route is public in the Clerk middleware (like `/api/github/webhook`) and is protected by Stream's HMAC signature: `client.verifyWebhook(rawBody, x-signature)` over the raw body, plus `x-api-key` equal to `NEXT_PUBLIC_STREAM_API_KEY`.
- The server path writes with the service role, as the meeting creator, and only for a meeting that already exists.
- The status route adds only enum step values. No transcript text or timings beyond what it shows today go to the browser.

**Configuration required**:
- No new secret. Uses `STREAM_SECRET_KEY` and `NEXT_PUBLIC_STREAM_API_KEY`.
- Manual: in the Stream dashboard, set the webhook URL to `https://<production domain>/api/stream/webhook` and enable `call.recording_ready`. Free on the current plan.

**Critical test scenarios**:
- Happy path: a valid webhook for a meeting with 2 attendees and 2 individual recordings generates the transcript, runs process and embed, then ledger match once, and every step lands in `pipeline`, verifies **AC-5**, **AC-7**, **AC-8**, **AC-9**
- Failover: Flash aborts, Lite answers, the next call within 60 s skips Flash, and the Lite call has no `thinkingConfig`, verifies **AC-1**, **AC-2**, **AC-3**
- Duplicate events: two `call.recording_ready` events at once start one run, and the loser returns without waiting, verifies **AC-7**
- Late event: a `call.recording_ready` after the transcript is ready, or after the summary exists, does nothing, verifies **AC-7**
- Bad signature: 401 and no work started; a composite recording event or another event type gets 200 and no work, verifies **AC-6**
- Low budget: transcript saved with 60 s left skips process; the page then runs it, verifies **AC-8**, **AC-11**
- Deadline: Whisper past the deadline stops and marks `whisper` failed with reason `deadline`, verifies **AC-8**
- Process race: the page calls process while the server holds the process claim and gets 409, verifies **AC-11**
- Sweep: a meeting with a stale `pending` transcript, one with no summary, and one with a failed ledger step are each picked up, verifies **AC-9**, **AC-12**
- Page fallback: no webhook, the page starts download and pipeline as today, and the step list moves through all three steps, verifies **AC-10**, **AC-11**
- Rules held: a project meeting via the webhook writes proposals; a meeting under a minutes review is not regenerated, verifies **AC-13**

## Build plan

The project builds by Extend. Each slice ships on its own and the page flow keeps working throughout.

1. Model chain in `src/agent/models.ts`: Flash Lite step, 15 s Flash cap, 60 s busy skip, chat probe through Lite, return the model used; update `models.test.ts`. Replaces `prompts/fix-gemini-lite-fallback.md`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**
2. Add `transcripts.pipeline`, `pipeline_mark`, and `claim_pipeline_step` to `supabase/schema.sql` and apply it; add a small `markPipelineStep` helper with the `[pipeline]` log line, and call it from download, cleanup, process, and embed. Satisfies **AC-5**
3. Extract `processMeeting` (with the process claim and 409), `embedMeeting`, and `maybeRunLedgerMatch`; call `maybeRunLedgerMatch` from both route `after()` blocks; drop the ledger wait from `meeting-pipeline-client.ts` and treat a process 409 as "watch, don't fail". Satisfies **AC-9**, **AC-11**, **AC-13**
4. Add `steps` to `GET /api/transcript/status` and the three step list in `AfterMeetingRecap.tsx`, using `useLoadingTimeout` and `LoadError`; redirect on summary done. Satisfies **AC-10**, **AC-11**
5. Add `POST /api/stream/webhook` (raw body, signature and api key check, event and recording type filter, public in middleware, `maxDuration` 300) and `runServerPipeline` with the skip check, claim before settle, the settle rule, the deadline aware `generateTranscriptForMeeting`, and the 100 s rule; make the page watch instead of start while the server step is running. Satisfies **AC-6**, **AC-7**, **AC-8**, **AC-11**, **AC-13**
6. Add the stuck meeting sweep (stale pending, no summary, no chunks, failed or stale ledger) to `/api/cron/daily`. Satisfies **AC-9**, **AC-12**
7. Run tsc, lint, `npx vitest run`, and build; configure the Stream dashboard webhook; live test one bilingual call and read `transcripts.pipeline`. Satisfies **AC-5**, **AC-7**

## Consequences

**Positive**:
- A busy Flash costs one 15 s wait per minute per warm instance at most, instead of up to 150 s per meeting.
- The work starts on the server when recordings are ready, and it finishes even if you close the tab.
- Real step timings persist in the database, so the next speed decision rests on numbers.

**Negative / tradeoffs**:
- One more public route to secure and one manual dashboard setting to remember on every environment.
- The settle window can add up to 60 s when a participant never produces a track (for example a guest who never spoke).
- Flash Lite is a smaller model; summary quality on long bilingual meetings needs a live check.
- One Vercel function holds transcription and the summary; a long meeting can still push the summary to the page or the next day's sweep.

**Neutral**:
- Whisper chunks still run one after another per track; parallel chunks and `whisper-large-v3-turbo` stay out of scope until the timings show Whisper is the slow step.

## Migration plan

**Strategy**: strangler (the page flow stays as the fallback; the webhook adds a server start beside it).
**Phases**:
1. Ship build tasks 1 to 4 (model chain, timings, server ledger match, step list). The page flow is unchanged otherwise.
2. Ship build tasks 5 and 6 with the webhook route live but no dashboard URL set, so nothing calls it yet.
3. Set the Stream dashboard webhook URL and run one live call.
**Rollback**: remove the webhook URL in the Stream dashboard (instant, no deploy). Reverting a slice's commit undoes it; the `pipeline` column is nullable and safe to leave.
**Risks**: the settle rule waits too long or too short on real calls; the first webhook body differs from the SDK type. Both show up in `transcripts.pipeline` and the logs on the first live call.

## Build notes (2026-11-15)

Where the build differs from the text above, the build wins:

- **Webhook auth is the HMAC only.** The official Stream skill says `verifyWebhook` over the raw body is the authentication and not to also gate on `x-api-key`, so AC-6 and the auth line in Security drop the api key check. The body is decompressed by `content-encoding` before verifying.
- **No recording type on the event.** The installed node-sdk types carry no `recording_type` on `call.recording_ready`, so the route accepts every recording_ready event for a saved meeting; the pipeline lists recordings itself and keeps only `individual`. Stream sends one event per track; the transcript claim makes every event after the first return "busy". The first real body is logged once.
- **No middleware change.** API routes already pass through `src/middleware.ts`, so the route needed no public entry.
- **Sweep age uses `transcripts.updated_at`** (between 1 hour and 7 days old, oldest first, at most 5 meetings per run) instead of `meetings.ended_at`. It runs in `after()` inside `/api/cron/daily`, whose `maxDuration` is now 300.
- **Recording step derivation** follows the refined table in the status route: `no_recording` is final only past the existing 20 minute rule.

## Follow-up

- [x] Add `POST /api/stream/webhook`, the extended `GET /api/transcript/status` (`steps`), and the `POST /api/ai/process` 409 while the process claim is held to the AGENTS.md API Contracts list before coding (/sync).
- [ ] Log the first real webhook body once to confirm the payload carries `call_cid` as the SDK type says.
- [ ] Update `docs/scope/scope.md` F5 and F7 text: the recap page now runs the AI pipeline, the F7b note is out of date.
- [ ] After the live test, decide from `transcripts.pipeline` whether Whisper chunk parallelism is worth a follow up spec.
- [ ] Consider installing the official `vercel/ai@ai-sdk` skill for AI SDK fallback conventions.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
