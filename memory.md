# Memory — Guest pop up fix + spec 0005 live testing

Last updated: 2026-11-15

## What was built

All pushed to main except the last test (latest commit `b4d60d8`, deploy Ready).

- Spec 0005, faster after meeting pipeline (`aaf41c9`): ending a call goes to `/after-meeting/<callId>`. The Stream webhook `call.recording_ready` (POST `/api/stream/webhook`) runs `runServerPipeline` in `after()` (recording wait, Whisper, cleanup, process, embed, ledger match). The page shows 3 steps from GET `/api/transcript/status` and redirects once the summary is saved. If the webhook never fires, the page runs the pipeline itself; the daily cron picks up stuck meetings. Stream webhook is registered in the Stream dashboard.
- Guest admission toggle clarity, hint line (`30217fd`).
- Guest pop up on the setup screen (`b4d60d8`):
  - New `src/hooks/useGuestRequests.tsx`: the owner Accept/Deny toast (id = `guest_token`, `duration: Infinity`, 10 min TTL), the `call.on("custom")` listener, the 5 s poll of GET `/api/guest/pending?meetingId=<callId>`, and a one time warning after 2 failed polls. Clerk `redirectToSignIn` is held in a ref so effect deps stay `[call, isOwner]`.
  - `MeetingSetup.tsx`: `ProjectInfo.canManage` (from GET `/api/meetings/[id]`), calls `useGuestRequests(call, project?.canManage === true)`.
  - `MeetingRoom.tsx`: the old inline guest effect was replaced by `useGuestRequests(call, isOwner)`.
  - `GuestResponsive.test.tsx` G7.3 token checks now read the hook file. New `MeetingSetup.guest.test.ts` source guard.
  - `context/ui-registry.md` and `context/progress-tracker.md` updated.
- **Uncommitted:** `src/components/MeetingRoom.test.tsx` gained "shows the pop up for a guest found by the pending poll while in the call" (passes, 13/13).

## Decisions made

- The owner guest pop up lives in one shared hook, used on both the setup screen and in the call.
- The setup screen gates on `canManage` from GET `/api/meetings/[id]` (no extra fetch).
- Admitting a guest before the owner has joined the call is allowed.

## Problems solved

- Pop up was missing because only MeetingRoom listened, while the owner was still on the setup screen. Custom events only arrive after joining, so the pending poll is what covers the setup screen.
- `vercel ls neurameet` writes to stderr. Don't redirect `2>/dev/null` when grepping for "Ready".
- DB inspection: a temporary `q.mjs` in the repo root with `@supabase/supabase-js` and the service role key, run with `node --env-file=.env.local q.mjs`, then deleted.
- zsh: quote `--include="*.ts"` or it fails as a glob.

## Current state

- Setup screen pop up: confirmed working live by the user.
- In call pop up: covered by the new test, not yet live tested (no request was made while the owner was in a call).
- The user was mid live transcript test (recording on, English + Urdu, with a promise). Result not yet reported.
- Old lint warning: unused `n` in `MeetingRoom.tsx` (about line 380), predates this session.
- Never commit `neurameet-source.zip` or `reports/tasdeeq-seed-*.json`.

## Next session starts with

1. Ask for the transcript test result. If it failed or was stuck over 5 minutes, get the end time and inspect `transcripts.pipeline` for that meeting.
2. Ask the user to live test the in call guest pop up (owner joined, guest requests from another browser).
3. Ask whether to commit the `MeetingRoom.test.tsx` addition.

## Open questions

- Does the in call pop up work live?
- Is the bilingual (English + Urdu) transcript good enough, and does spec 0005 finish within a reasonable time live?
- Carried over: does Gemini accept `thinkingBudget: 0`; leftovers cleanup (`ProjectSettingsTab.tsx`, `DecisionsTab.tsx`, email invite dead code); live GitHub `KEY-1` PR test; LL5 and Tasdeeq live runs.
