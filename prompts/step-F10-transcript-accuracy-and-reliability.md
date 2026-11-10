# Implementation Prompt — F10: Generate Transcript, Accurate and Reliable

> Goal: when anyone clicks **Generate Transcript** on `/after-meeting/[id]`, they get the
> correct, complete, speaker-labeled transcript of the live meeting, every time.
> Zero-cost rule applies: Stream individual recording + Groq Whisper + the existing
> Gemini→Groq text fallback only. No new provider, no new paid tier, no new route.
> Stream SDK rule applies: verify every Stream call against the `stream-react` skill /
> installed `.d.ts` before touching it.

## Root causes found (read from the code, not yet reproduced live)

Ranked by how likely each is to produce "not what I expected":

1. **Nothing is recorded unless the owner clicks Record.** `individual_recording` is
   `mode: "available"` at all four call-creation sites (`MeetingModel.tsx` x2,
   `PersonalRoomPage.tsx` x2) and `MeetingRoom.tsx` only starts it from the Record control.
   If nobody clicks it, `listRecordings` returns nothing and the page says "still being
   processed" for ~5 minutes (a misleading message), then gives up. The feature cannot
   produce the "absolute transcript" of a meeting that was never recorded.
2. **No `maxDuration` on `POST /api/transcript/download`.** Download of every `.mkv`, ffmpeg
   conversion and Whisper calls run serially inside one request. Other long routes set
   `maxDuration = 60`; this one sets nothing, so a longer meeting can be killed by the
   platform mid-run and the row stays `pending`. The client aborts at 120 s and the
   server keeps running.
3. **The "in flight" guard does not guard.** The route comment says a `pending` row stops a
   second transcription, but the cache check only reads `pending` to skip the cached text.
   Nothing returns early. A second click, the 15 s poll after a client abort, or another
   participant starts a duplicate full generation (duplicate Groq spend against a free
   quota of about 20 requests/min and 2 audio-hours/hour).
4. **Groq 429 is not handled.** `transcribeWithRetry` retries once immediately. A rate-limit
   response fails the track, and `anyError` turns a partly good meeting into "failed".
   Chunks of one track also fire in parallel via `Promise.all`, which makes 429 more likely.
5. **Whisper hallucination on silence is kept.** Segments are kept without checking
   `no_speech_prob`, `avg_logprob` or `compression_ratio`. A muted participant's long silent
   stretch becomes lines like "Thank you." or the domain hint text echoed back (the
   `prompt` hint is sent on every chunk, which makes echo more likely on silence).
6. **Accuracy ceiling.** `whisper-large-v3-turbo` is the weaker model for Urdu and
   code-switched speech. `whisper-large-v3` is on the same free tier and is more accurate.
7. **Lossy AI cleanup is the last stage and overwrites the only copy.** The cleanup model
   rewrites the whole transcript, translates it, and can drop lines. The raw Whisper text
   is never stored, so a bad cleanup cannot be undone or compared.
8. **Cleanup caps.** A very long transcript sent as one prompt can exceed the model's output
   limit, so the guard falls back to raw (untranslated) silently.

## Decision taken: Option A (auto-on) was implemented; it reverses the 2026-08-22 opt-in decision

Added during build: Step 5b, silence stripping with ffmpeg `silencedetect` before upload (Groq free tier is 7,200 audio seconds/hour), with a piece map back to real track time.

## Original decision text

How should recording start?
- **Option A (recommended): auto-start individual audio recording when the first person
  joins** (`individual_recording: { mode: "auto-on" }`, audio only, already proven free and
  working at F0 on 2026-08-22). Show a clear "This meeting is being recorded for the
  transcript" notice in the room. This is the only way to guarantee the transcript exists.
  It reverses the earlier Option B (opt-in) decision from 2026-08-22, so the consent
  notice must be visible to every participant, guests included (reuse the W3 consent
  pattern for project calls).
- **Option B: keep opt-in** but make the recap tell the truth: if no recording exists and
  the call has ended, say "This meeting was not recorded, so there is nothing to
  transcribe. Upload a transcript instead." Plus a stronger Record prompt in the room.

Steps 2 to 8 below are independent of this choice.

## Steps (in order)

1. **Recording capture** (per the decision above). Verify the Stream setting name and shape
   against the installed `@stream-io/node-sdk` / `video-react-sdk` types first.
2. **Real in-flight lock.** In the route, when the row is `pending` and was set recently
   (under about 5 minutes), return `{ status: "pending" }` immediately without starting
   work; the client keeps polling `GET /api/transcript/status`. Needs an `updated_at`
   column on `transcripts` (additive migration in `supabase/schema.sql`; the user runs it).
   A `pending` row older than the stale window is treated as dead and may be restarted.
3. **Budget the request.** `export const maxDuration = 300` (confirm the Hobby ceiling in
   the Next/Vercel docs under `node_modules/next/dist/docs/` first; lower it if needed).
   Process tracks with bounded concurrency (2), chunks sequentially per track, and stop
   cleanly with a retryable `pending` state if the time budget runs out instead of dying.
4. **Rate-limit aware Whisper calls.** Honour `retry-after` on 429, exponential backoff,
   up to 4 attempts. A track that still fails is reported by name; the transcript is
   returned only when every non-silent track succeeded, otherwise state `failed` with the
   speaker names missing (never a silently partial transcript).
5. **Hallucination filter.** Drop a segment when `no_speech_prob > 0.6` and
   `avg_logprob < -1.0`, when `compression_ratio > 2.4`, or when its text equals the
   domain hint. Pure function with unit tests. Send the domain `prompt` only on the first
   chunk of a track.
6. **Model.** Switch to `whisper-large-v3` for accuracy; keep a one-line constant so it can
   be flipped back. Check current Groq free-tier limits first and note them in
   `context/library-docs.md`.
7. **Cleanup safety.** Store the Whisper merged text in `raw_whisper_text` (additive) and the cleaned version in `raw_text`. Cleanup runs in line-batches (about 150 lines) so output limits never
   truncate it, and a batch whose length shrinks below the existing guard keeps its raw
   lines. Speaker labels are verified identical before and after.
8. **Honest recap states.** Replace "still being processed" with accurate copy per state:
   not recorded, processing (with elapsed time), too quiet, failed with the reason and a
   Retry button. Every loading state keeps `useLoadingTimeout` + `LoadError`.

## Out of scope
New transcription vendor, live captions, speaker diarization on a mixed track, changing
the Upload Transcript to AI flow, the Promise Ledger / minutes consumers.

## Tests
- Unit: hallucination filter, retry-after backoff, stale-pending decision, batch cleanup
  label check, offset/merge (existing tests must still pass).
- Route test: second request while `pending` returns `pending` and does not call Stream.
- `npx tsc --noEmit`, lint, `npx vitest run`, `npm run build`.

## Live verification (needs the user, F6-style)
Two accounts, one English-and-Urdu call of about 5 minutes with one participant muted for
a stretch. Expected: both speakers labeled, correct order, no "Thank you." filler from the
muted participant, second click while generating does not start a second run, transcript
downloads for both accounts.

## Docs to update after implementing
`context/progress-tracker.md`, `context/ui-registry.md` (recap states), `context/architecture.md`
(new columns), `context/library-docs.md` (Whisper model and limits).
