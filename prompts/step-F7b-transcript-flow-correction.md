# Implementation Prompt — F7b: Recap page is `.txt`-download ONLY (any signed-in participant); NO AI trigger anywhere in the F-series

## Context / Problem
The earlier F7b prompt (and the code built from it) still assumes an AI pipeline is
triggered from the recording path:
- the recap "Generate Transcript" carried an **Option B owner full-pipeline button**
  (`POST /api/transcript/generate` → AI Summary/Action Items/Category/RAG);
- the Meeting Intelligence **Recording tab** carried an owner-only "Generate Transcript"
  full-pipeline button (same `/api/transcript/generate`);
- a **global `TranscriptPoller`** + `GET /api/transcript/in-flight` existed solely to
  notify the owner when that AI job finished;
- the F-section build-plan described F4 as "feed the merged transcript into
  `/api/transcript/upload` → `/api/ai/process`" — i.e. auto-AI from a recording.

That is the wrong shape. **The F-series' only job is to turn real meeting audio into a
realistic `.txt` file** (the real-world replacement for hand-typed test transcripts).
It must NEVER trigger AI. Every AI path (Summary, Action Items, Category, RAG) is entered
ONLY through the existing **Upload Transcript** flow (Dashboard → Upload Transcript), which
already calls `/api/transcript/upload` → `/api/ai/process` → `/api/ai/embed` unchanged.

## Corrected design (single source of truth)
- **Recap page "Generate Transcript" button = ONE job, ANY signed-in participant (owner or
  not):** produce a downloadable `.txt` in the exact format `Sarah: text` / `Ali: hello`.
  Nothing else. No AI pipeline triggers — not for participants, not for the owner, not
  automatically, not optionally. Only DB writes are what's needed to generate the text
  itself (the `transcripts` row cache of `raw_text`, source `recording`).
- **To get AI processing, the user takes that downloaded `.txt` and uploads it via the
  EXISTING Upload Transcript flow** — exactly like pasting a transcript manually today.
- **Owner EXTRA (kept, simple):** the recap page MAY show an "Insights" link/button to
  `/meeting-intelligence/[id]` IF `meeting_insights` already exists for that meeting (i.e.
  someone already ran AI via the normal Upload Transcript flow). It is a convenience
  shortcut only — it does NOT trigger AI; it just shows/hides based on whether insights
  exist. If it can't be done without new triggering logic, drop it. (Implementation note:
  `GET /api/transcript/status` already returns `hasInsights`; the recap page fetches it on
  mount and renders the link only when true. Low complexity — keep it.)
- **Recording tab = playback only.** Remove the owner full-pipeline button entirely
  (it was added by the previous F7b; it no longer belongs here).
- **Remove the AI-trigger route + global poller.** Delete `POST /api/transcript/generate`,
  `GET /api/transcript/in-flight`, and `src/components/TranscriptPoller.tsx` (and its
  mount in `src/app/layout.tsx`). None are called once the F-series triggers no AI.
- **Graceful degradation stays** for the `.txt` download path only (Stream finalization
  timing, silent tracks, too-short, Groq failure, double-click, logged-out redirect).

## Edge cases (all must degrade gracefully, same discipline as G1/G2)
- No one spoke / silent audio tracks → skip that speaker, don't error.
- Meeting too short to have meaningful audio → clear "Meeting too short to transcribe"
  message, no broken/empty `.txt`.
- Recording never happened (owner never clicked Record) → clear message, NO infinite poll,
  no crash. Cap the `no_recording` retry at ~5 min, then show a final clear message
  ("No recording was captured for this meeting. You can still upload a transcript from the
  Dashboard.").
- Transcription (Groq) fails or times out → clear failure message, retry-once then fail
  gracefully, never hang.
- Non-English / non-Urdu speech detected → transcribe as-is, no blocking.
- Participant clicks Generate Transcript while it's already processing (double-click) → no
  duplicate work, no race condition (button disabled while generating/pending +
  `processing_state` guard on the route).
- Logged-out user reaches the recap page → redirected to sign-in, no broken state.

## Changes (code, for approval — NOT executed yet in this doc pass)
1. **`src/app/api/transcript/generate/route.ts` — DELETE.** It is the AI-trigger-from-
   recording route. No UI calls it after this change.
2. **`src/app/api/transcript/in-flight/route.ts` — DELETE.** Only fed the global poller.
3. **`src/components/TranscriptPoller.tsx` — DELETE**; remove its `<TranscriptPoller />`
   mount + import from `src/app/layout.tsx` (inside `ClerkProvider`).
4. **`src/components/meeting-intelligence/RecordingTab.tsx` — REMOVE the owner "Generate
   Transcript" full-pipeline button + its state machine + `/status` poll + mount-sync.**
   Tab returns to playback-only (recordings fetch + Play anchors). Keep the
   `isOwner` guarding of the tab itself (non-owners still don't see recordings).
5. **`src/components/meeting-intelligence/AfterMeetingRecap.tsx` — REMOVE the Option B
   owner full-pipeline block** (`ownerGen`, `handleOwnerGenerate`, `ownerPollRef`,
   `startOwnerWaiting`, the bordered block, the ownerGen mount-sync). Keep the participant
   `.txt` download button (any signed-in) with its `no_recording` → `pending` poll-and-
   auto-download graceful loop — but **cap the `no_recording` poll at ~5 min** (≈20×15s)
   then show the final "No recording was captured…" message instead of polling forever.
   Keep the "View full meeting insights" link but **gate it on `hasInsights`** (fetch
   `GET /api/transcript/status` on mount; render the link only when `hasInsights` is true
   and the user is signed-in). The button is symmetric for every participant.
6. **`src/app/api/transcript/download/route.ts` — KEEP** (the F-series' only job). It
   already caches `raw_text` and never triggers AI. Confirm its `no_recording`/`too_short`/
   `failed` branches surface real messages. (The client caps the poll now; the route stays.)
7. **`src/app/api/transcript/status/route.ts` — KEEP** (used by the `.txt` poll + the
   recap `hasInsights` gate). No change needed.
8. **`src/lib/transcript-state.ts` — KEEP** (the download route still uses
   `processing_state`). The `processing_state` ALTER migration in `supabase/schema.sql`
   remains REQUIRED on the live DB before deploy (the download route reads/writes it).
9. **`src/agent/transcript-generation.ts` — KEEP** the `no_recording` (retryable) +
   `too_short` returns and the Groq retry-once. **Verify** the merge skips participants
   whose tracks are silent (empty/whitespace segments dropped) so "no one spoke" degrades
   to an empty-but-clean `.txt` rather than an error.

## What does NOT change
- The existing **Upload Transcript** flow (Dashboard → Upload Transcript) — still the ONLY
  AI trigger path. Unchanged.
- `transcript-generation.ts` core (fetch individual audio → Groq Whisper → merge
  "Name: text") — unchanged; it is the `.txt` generator.
- `meeting-recap.ts` public helper, `AfterMeetingRecap` page route, post-call redirect —
  unchanged (the recap page still loads for everyone, logged-out included).
- `processing_state` column + migration (still used by the `.txt` download for graceful
  `no_recording` handling).

## Context files updated by this prompt
- `context/build-plan.md` — F0–F6 rewritten: F4 removed (no auto-AI); F5 reframed as
  `.txt`-only trigger + status; F6 reframed as "`.txt` downloads correctly → uploaded via
  Upload Transcript → insights correct".
- `context/progress-tracker.md` — F-section corrected: F4/F5/F7b entries reflect no AI
  trigger; the previous "graceful degradation + Option B owner button + global poller"
  entry is replaced by the simplified `.txt`-only degradation.
- `context/ui-registry.md` — `RecordingTab`, `AfterMeetingRecap`, `TranscriptPoller`,
  `POST /api/transcript/generate`, `GET /api/transcript/in-flight` entries corrected/deleted.
- `docs/scope/scope.md` — F5/F7 entries reflect `.txt`-only + no AI trigger.

## Out of scope / not changed
- F6 live bilingual verify (next, after this lands).
- Step 11 Deploy (incl. the live `processing_state` migration).
- D3.4 / D3+ (parked).
- No new DB tables, no new providers, no paid APIs (Groq sole STT, Gemini/Groq AI).

## Verification (local, typecheck/build)
- `npx tsc --noEmit` clean; `npm run build` exit 0.
- Manual reasoning: recap "Generate Transcript" for any signed-in participant downloads a
  `.txt` and triggers NO AI (`meeting_insights` stays empty unless uploaded). The Recording
  tab shows playback only (no Generate button). No `TranscriptPoller` import remains in
  `layout.tsx`; `/api/transcript/generate` + `/api/transcript/in-flight` no longer exist.
- Graceful: clicking immediately after a call (Stream not finalized) → `no_recording` →
  polls up to ~5 min → either auto-downloads or shows the clear final message. A participant
  who never recorded → final "No recording was captured…" message. Logged-out click →
  redirect to sign-in.
