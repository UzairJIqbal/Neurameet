# Implementation Prompt — F1–F4: Transcript Generation (fetch + extract + transcribe + merge + wire pipeline)

> Build spec derived from the approved F1 architect blueprint
> (`~/.claude/plans/playful-honking-alpaca.md`). F0 is
> CLOSED (live-verified 2026-08-22). This prompt covers F1 (enable capture
> + fetch), F2 (ffmpeg extract/segment + Whisper), F3 (chronological merge),
> and F4 (wire into existing Upload → AI Process pipeline). The owner-only
> "Generate Transcript" button (F5) is included because it is the trigger that
> calls the new route.

## ZERO-COST RULE (non-negotiable)
Only free tiers: Stream individual recording + Groq Whisper free tier. No
paid API, no second speech-to-text provider (Groq is SOLE), no paid vector
DB, no paid host. `@ffmpeg/ffmpeg` is MIT, in-process — allowed. `GROQ_API_KEY`
stays server-side ONLY (security invariant).

## Pre-build verification gates
1. **Stream SDK check (permanent rule):** before editing the `getOrCreate`
   `settings_override` in `MeetingModel.tsx` / `PersonalRoomPage.tsx`, confirm
   the `individual_recording` field shape against the installed
   `@stream-io/node-sdk` types (or the official Stream `stream` skill).
   `individual_recording: { mode: "auto-on" }` is ALREADY verified by F0
   (the diagnostic used it and returned per-participant audio). The optional
   `audio_only: true` sub-field is NOT yet confirmed — verify it via the
   Stream skill BEFORE adding it; if unsupported, use `{ mode: "auto-on" }`
   only. Do not assume.
2. **ffmpeg core loading:** decide local bundling. Prefer loading
   `@ffmpeg/core` from the installed package (copy the wasm to a served path
   or load via `toBlobURL` from a local route) rather than the unpkg CDN, to
   keep runtime self-contained and zero-cost-reliable on Vercel. Validate the
   wasm actually loads in the Next.js Node runtime (not edge).

## What to build

### 1. Enable per-participant capture (F1 trigger config)
Files: `src/components/MeetingModel.tsx`, `src/components/PersonalRoomPage.tsx`.
- `MeetingModel.tsx` `createMeeting` + `ScheduleMeeting` `getOrCreate` blocks:
  change `individual_recording: { mode: "disabled" }` →
  `individual_recording: { mode: "auto-on" }` (add `audio_only: true` ONLY if
  gate 1 confirms support).
- `PersonalRoomPage.tsx` `getOrCreate` block AND the defensive `update()` block:
  same flip. Keep `frame_recording` untouched.
- These are client components calling the Stream SDK — already use
  `settings_override`, no new pattern. No architecture change.

### 2. Core module — `src/agent/transcript-generation.ts` (server-only, no React)
Export `generateTranscriptForMeeting({ userId, meetingId, streamCallId, streamCallType })`
returning a discriminated result:
`{ status: "ok", transcript: string } | { status: "too_short" } | { status: "failed", message }`.

Steps inside:
a. **Ownership check:** `supabaseServer().from("meetings").select("user_id").eq("id", meetingId).single()`; assert `user_id === userId`, else 401.
b. **Fetch individual recordings:** `new StreamClient(apiKey, secret).video.listRecordings({ type, id })`, keep only `recording_type === "individual"`. Each has a `url` (`url || file_url || video_url`) and `filename`. If none → `failed` ("No recordings found").
c. **Speaker mapping:** parse `user_<id>_` from `filename` (F0 pattern). Resolve display name:
   query `attendance_events` for that `user_id` in this meeting (B2 schema has the
   participant); if found use its `participant_email`/`name`; else look up via
   Stream/Clerk user; fallback `Speaker <short-id>` (first 8 chars of id).
d. **Per track:** download the `.mkv` buffer (server-side fetch). Skip early if
   buffer is empty or audio duration < ~10 s (compute via ffmpeg `ffprobe`
   equivalent or after extraction) → that speaker skipped (edge case 1 & 3).
e. **ffmpeg extract + segment (F2):** one pass per track:
   `ffmpeg -i in.mkv -vn -ar 16000 -ac 1 -f segment -segment_time 600 out_%03d.flac`.
   Produces ~10-min 16 kHz mono FLAC chunks (≈6–10 MB each, under 25 MB).
f. **Transcribe chunks in parallel (F2):** for each chunk, `fetch`
   `https://api.groq.com/openai/v1/audio/transcriptions` with
   `Authorization: Bearer $GROQ_API_KEY`, multipart `file` = flac,
   `model: whisper-large-v3-turbo`, `response_format: verbose_json`,
   `timestamp_granularities: ["segment"]`, omit `language` (EN/UR auto-detect).
   Collect `{ speaker, startSec, text }` per segment. **Retry ONCE on failure**
   (edge case 2 & 4). If a chunk fails after retry → that track fails; continue
   other tracks. Optionally capture `language` from `verbose_json`.
g. **Merge (F3):** collect all segments across all tracks, sort by `startSec`,
   emit `SpeakerName: text` per line (edge case 6 — overlap handled by
   per-track + timestamp sort). Drop empty-text segments silently.
h. **Edge case 3 (short meeting):** if no track yielded any speech → return
   `too_short` ("Meeting too short to transcribe"); do not store empty text.
i. **Edge case 2 (all failed):** if every track failed → return
   `failed` ("Transcript generation failed, try manual upload"). Non-fatal.
j. **No content filtering (edge case 7):** transcribe as-is.

### 3. Trigger route — `src/app/api/transcript/generate/route.ts` (server-only, `runtime = "nodejs"`)
- `auth()` → 401 if no `userId`.
- Parse `{ meetingId, streamCallId, streamCallType }`.
- Call `generateTranscriptForMeeting(...)`.
- On `ok`: store transcript reusing the `/api/transcript/upload` insert pattern
  (`source: "recording"`, `raw_text: transcript.trim()`) — create/lookup the
  meeting row is NOT needed (meeting already exists); insert into `transcripts`
  with the existing `meeting_id`. Then REUSE existing downstream by calling
  `/api/ai/process` (POST `{ meetingId }`) — same as the manual flow's next
  step. (Reuse, don't duplicate the AI logic.)
- On `too_short` → 200 `{ status: "too_short", message }`.
- On `failed` → 200 `{ status: "failed", message }` (non-fatal; UI shows
  "try manual upload").
- Wrap everything in try/catch; log; never crash the run.
- `export const runtime = "nodejs";` (ffmpeg wasm needs Node).

### 4. UI trigger (F5) — `src/components/meeting-intelligence/RecordingTab.tsx`
- Add owner-only "Generate Transcript" button above the recordings list
  (Recording tab already renders only for `isOwner`).
- Calls `POST /api/transcript/generate` with `{ meetingId, streamCallId: meeting.streamCallId, streamCallType: "default" }`.
- States: idle → "Generate Transcript"; generating → spinner + disabled;
  success → toast "Transcript ready" (link to Summary); failed →
  "Transcript generation failed, try manual upload" + manual-upload link;
  too_short → "Meeting too short to transcribe".
- Disable if a transcript already exists for `meetingId` (query
  `transcripts` or pass an existing flag) to avoid duplicate generation.
- Use `react-hot-toast` (the only toast lib) for feedback.

## Files
Create:
- `src/agent/transcript-generation.ts`
- `src/app/api/transcript/generate/route.ts`
Modify:
- `src/components/MeetingModel.tsx` (individual_recording auto-on ×2)
- `src/components/PersonalRoomPage.tsx` (individual_recording auto-on ×2)
- `src/components/meeting-intelligence/RecordingTab.tsx` (button + states)
Add deps:
- `@ffmpeg/ffmpeg`, `@ffmpeg/util`, `@ffmpeg/core` (or `@ffmpeg/core-mt`)

## Reuse (do NOT duplicate)
- `/api/transcript/upload` transcript insert shape (`source: "recording"`).
- `/api/ai/process` for Summary/Action Items/Category/RAG.
- `attendance_events` (B2) for speaker names.
- `GROQ_API_KEY` server-only for Whisper REST call.

## Verification
1. `npm run type` (typecheck), `npm run lint`, `next build` all pass.
2. Local e2e: enable auto-on; start meeting; speak EN + a few UR words; end;
   wait for Stream to finalize individual `.mkv`; on Recording tab click
   Generate → Summary / Action Items / Category populate; speaker labels =
   participant names (not `Speaker <id>`).
3. Edge cases: <10 s meeting → "too short"; muted participant → skipped;
   forced Groq failure (bad key) → "failed, try manual upload", no crash.
4. Confirm `GROQ_API_KEY` never imported client-side; route is Node runtime.
5. Update `progress-tracker.md` (F1–F4 ✅) and `ui-registry.md` after build.

## Out of scope
- Server-side job queue fallback if wasm proves too heavy on Vercel (flagged
  open risk; escape hatch only).
- Auto-trigger on call end (approved as on-demand only).
- Composite frame recording (D3.4 parked).
