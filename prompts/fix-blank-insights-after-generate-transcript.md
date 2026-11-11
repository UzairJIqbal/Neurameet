# Fix: Summary, Overview and other tabs stay blank after Generate Transcript

## Problem (live test 2026-11-11)
After "Generate Transcript" succeeds on the recap page (`AfterMeetingRecap`), the meeting detail tabs
(Overview, AI Summary, Action Items, Category, Decisions and Promises, AI Chat) are empty.

Root cause: `POST /api/transcript/download` only stores the transcript (`transcripts` row) and
returns the text. It never runs the AI pipeline. The upload path (`UploadTranscriptModal`) chains
`/api/ai/process` -> `/api/ai/embed` -> `/api/ledger/match`; the generate path does none of it. The only
recovery today is the owner clicking "Retry summary generation", which is easy to miss.

## Scope (client only, no API or schema change, no new route)
1. New shared helper `src/lib/meeting-pipeline-client.ts`: `runMeetingPipeline(meetingId, signal)` runs
   process, then embed, then `requestLedgerMatch`, returning `{ processed, embedded, matched }`.
   Reuses the same bodies, timeouts (120 s each) and failure rules as `UploadTranscriptModal`
   (process failure is fatal, embed and match are non-fatal). `emailNotifications` is read from the
   same stored preference the upload modal uses.
2. `AfterMeetingRecap`: after a successful generate (`status === "ok"`, not for `exists`), if the caller
   can manage the meeting (owner, or project Owner/Admin: the process route already enforces this, so a
   403 is treated as "not allowed, skip silently"), call the helper. Show a "Creating summary..."
   state and a toast on success or failure. Never block the .txt download on the pipeline.
3. Skip the pipeline when insights already exist for the meeting (a `GET /api/meetings/[id]` check),
   so a re-download never overwrites or re-spends AI quota.
4. Participants who cannot manage the meeting see: "Transcript ready. The meeting owner can create the
   summary."
5. Update the header comment in `AfterMeetingRecap` (it says "never triggers AI").
6. The meeting detail page refetches on mount already, so no change there.

## Not in scope
Auto-running AI from the server (would need `after()` inside the download route; separate decision),
changing the process route, retry UX redesign.

## Tests
- helper: runs in order, process failure stops the chain, embed failure skips match.
- `AfterMeetingRecap`: generate ok runs the pipeline for a manager, skips for `exists`, skips when
  insights exist, shows the owner-only message when process returns 403.

## Manual test steps
1. Finish a recorded call as owner, open the recap, click Generate Transcript.
2. Expect: .txt downloads, "Creating summary..." appears, then a success toast.
3. Open the meeting in Meeting Intelligence: Overview, AI Summary, Action Items, Category filled;
   AI Chat answers from the transcript.
4. As a non-owner participant: generate shows the "owner can create the summary" message, no error.
