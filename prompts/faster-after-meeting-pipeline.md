# Faster after meeting pipeline (scope #28, spec 0005)

Date: 2026-11-15. Tier: GA. Approach: Extend.
Spec (source of truth for every rule and value): `docs/specs/0005-faster-after-meeting-pipeline/index.md`. Read it in full before starting; this prompt only orders the work and names the files. Where this prompt and the spec disagree, the spec wins.

This prompt replaces `prompts/fix-gemini-lite-fallback.md` (folded into Slice 1, with the Flash cap now 15 s instead of 30 s).

## Before coding

1. Read AGENTS.md and the context files in the listed order.
2. Run /sync first (or edit the API Contracts list by hand with approval) to add: `POST /api/stream/webhook`, `GET /api/transcript/status` (extended, adds `steps`), `POST /api/ai/process` (extended, 409 while the process claim is held).
3. Stream verification rule: before Slice 5, read `.claude/skills/stream-react/references/VIDEO.md` for webhooks, and confirm in `node_modules/@stream-io/node-sdk/dist/**/*.d.ts`: `verifyWebhook` signature, the header names (`x-signature`, `x-api-key`), `CallRecordingReadyEvent` fields, and `listRecordings` return shape.
4. Next.js docs folder is absent; follow the existing `after()` usage in `src/app/api/github/webhook/route.ts`.

## Slices (each ships alone; run tsc + targeted vitest after each)

### Slice 1. Model chain (AC-1 to AC-4)
Files: `src/agent/models.ts`, `src/agent/models.test.ts`.
- Add `liteModel = google("gemini-3.5-flash-lite")` (no `thinkingConfig`, it rejects it).
- `generateStructuredWithFallback`: Flash capped at 15 s for every caller (cleanup too) → Flash Lite with the caller's timeout (default 30 s, cleanup 90 s), no `providerOptions` → Groq unchanged. Return `{ object, model: "flash" | "lite" | "groq" }`; update callers that destructure.
- 60 s module level Flash busy skip (export a test only reset).
- Chat probe: Flash → Lite → Groq, cached 60 s.
- Tests: the cases listed in the old prompt, with 15 s.

### Slice 2. Timings schema and helper (AC-5)
Files: `supabase/schema.sql`, new `src/lib/pipeline-steps.ts` (+ test), call sites in download route, `transcript-generation.ts` (whisper, cleanup), process, embed.
- Additive: `transcripts.pipeline jsonb null`; RPCs `pipeline_mark(p_meeting, p_step, p_patch)` and `claim_pipeline_step(p_meeting, p_step) returns boolean` (null, failed, or running with `startedAt` older than 5 min). Apply with the Supabase MCP `apply_migration` after showing the SQL.
- `markPipelineStep(meetingId, step, patch)` calls the RPC and writes one `[pipeline] step=… status=… ms=… model=…` log line; never throws (logs on failure).

### Slice 3. Shared functions, claims, server ledger match (AC-9, AC-11, AC-13)
Files: new `src/agent/meeting-pipeline.ts` (`processMeeting`, `embedMeeting`, `maybeRunLedgerMatch`), `src/app/api/ai/process/route.ts`, `src/app/api/ai/embed/route.ts`, `src/app/api/ledger/match/route.ts` (extract `runLedgerMatch` if not already shared), `src/lib/meeting-pipeline-client.ts` (+ tests).
- Routes keep their auth checks, then call the shared function. Behaviour stays identical (minutes 409, proposals for project meetings, follow ups otherwise, email toggle).
- `processMeeting` takes the `process` claim; route answers 409 "Summary is already being created" when busy.
- Both route `after()` blocks call `maybeRunLedgerMatch` (summary = a `meeting_insights` row; chunks = at least one `meeting_chunks` row).
- Client: drop `requestLedgerMatch`; a process 409 means "keep polling status", not an error.

### Slice 4. Status steps and step list (AC-10, AC-11)
Files: `src/app/api/transcript/status/route.ts`, `src/components/meeting-intelligence/AfterMeetingRecap.tsx` (+ tests).
- Add `steps: { recording, transcript, summary }` from the spec's step derivation table. Enum values only.
- Three row step list (Recording ready, Transcript, Summary and action items) with waiting, running, done, failed states, using tokens from `context/ui-tokens.md` only, `useLoadingTimeout` + `LoadError`. Redirect when summary is done (existing project redirect kept).
- After: run /imprint, update `context/ui-registry.md`.

### Slice 5. Webhook and server pipeline (AC-6, AC-7, AC-8, AC-11, AC-13)
Files: new `src/app/api/stream/webhook/route.ts` (`maxDuration = 300`), `src/middleware.ts` (public route), `src/agent/meeting-pipeline.ts` (`runServerPipeline`), `src/agent/transcript-generation.ts` (deadline), `src/app/api/transcript/download/route.ts` (pass a deadline) (+ tests).
- Route: `req.text()`, check `x-api-key` and `verifyWebhook` (401), filter event type and non individual recording type (200, no work), find meeting from `call_cid`, return 200, then `after(() => runServerPipeline(...))`. Log the first real body once (follow up in the spec).
- `runServerPipeline`: skip check (`ready` or summary exists) → `claimTranscriptGeneration` → mark `recording` running → settle (5 s polls, expected = distinct `coalesce(stream_user_id, user_id)` in `attendance_events`, 45 s quiet, 60 s cap) → generate with deadline → if ≥100 s left, `processMeeting` and `embedMeeting` in parallel as the owner with the stored `user_settings` toggle, `source: "webhook"`.
- `generateTranscriptForMeeting(…, deadline)`: check before each track and chunk; on deadline mark `whisper` failed with `reason: "deadline"`.
- Page: while `steps.transcript` is running, watch, don't start.

### Slice 6. Cron sweep (AC-9, AC-12)
File: `src/app/api/cron/daily/route.ts` (+ test).
- Up to 5 stuck meetings, oldest first, ended > 1 h ago (`ended_at`, else transcript `updated_at`): stale pending → regenerate; ready transcript and no summary → process; summary and no chunks → embed; ledger failed or stale → `maybeRunLedgerMatch`. `source: "cron"`. Each wrapped in try and catch; one failure never stops the sweep.

## Checks
`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`. Report failures with their output.

## After building
- Update `context/progress-tracker.md`, `context/ui-registry.md`, the model note in `context/library-docs.md`, and the scope #28 milestones.
- Manual (you): in the Stream dashboard set the webhook URL to `https://<production domain>/api/stream/webhook` and enable `call.recording_ready`. The live bilingual test stays deferred to the end with the other live checks.

## Out of scope
Splitting `/api/ai/process`, Whisper chunk parallelism, `whisper-large-v3-turbo`, any paid tier or new provider, a durable job queue.
