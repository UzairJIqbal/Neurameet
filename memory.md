# Memory — Invite email removal, post-transcript AI pipeline (on top of F10)

Last updated: 2026-11-11

## What was built

Commit `772332b` (pushed to main, both production builds Ready on Vercel: `neurameet-4182nwnoq` from the push, `neurameet-3kiv8msdv` from `vercel --prod`):

- Invite email removed: deleted `src/lib/invite-email.ts`, `sendProjectInviteEmail`, the invite email budget and `invite.emailed` audit code. Create and resend invitation responses now carry only `{ link }`. `AddMembersDialog` and `InvitesPanel` say "Copy the link and send it yourself". Spec 0004 AC-15 updated. Kept: in-app invite notification, and the W8 notification and digest emails (still gated on `RESEND_WORKSPACE_FROM`).
- Blank tabs after Generate Transcript: new `src/lib/meeting-pipeline-client.ts` (`runMeetingPipeline`: checks manage access and missing summary via `GET /api/meetings/[id]`, then `/api/ai/process`, `/api/ai/embed`, `requestLedgerMatch`). `AfterMeetingRecap.tsx` runs it after a fresh (not cached) generated transcript and shows a "Creating the summary" line. Never blocks the .txt download.
- No-transcript summary tab: `SummaryTab` shows "No transcript yet" with an "Open meeting recap" link instead of a useless Retry; `MeetingDetail.retrySummary` surfaces the server error text.
- `src/lib/invitations.test.ts`: pinned the clock (fixture invite had expired).
- Plans: `prompts/fix-no-transcript-summary-state.md`, `prompts/fix-blank-insights-after-generate-transcript.md`.

Earlier F10 work (commit `f88d29a`): silence stripping, `whisper-large-v3`, in-flight lock, auto-on individual recording, honest recap states. See progress tracker.

## Decisions made

- Invites are copy-link only; no invite email, no Resend invite sending.
- The AI chain after Generate Transcript runs client-side from the recap page (no server `after()` change). Server-side auto-run was left as a separate decision.
- The "Invite by email" tab in the invite dialog was kept: it creates an invite bound to that email address, copy the link. Not renamed.
- Supabase project NeuraMeet (`lsjiwxohfpzdvenbxpeu`) is the app DB. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push straight to main.
- F10: option A auto-on recording, `whisper-large-v3`, Groq free limits 20 req/min and 7,200 audio s/hour.

## Problems solved

- Root cause of blank Summary/Overview: `/api/transcript/download` only stores the transcript and never runs AI.
- "Email not sent" in the invite dialog was `RESEND_WORKSPACE_FROM` unset in production, now moot.
- `vercel --prod --yes` prints little here; confirm with `vercel ls --prod` (shows status).
- macOS BSD `sed -i` needs `''`; `npm run lint` shows about 880 baseline prettier errors.

## Current state

tsc clean, full vitest 1912 passing, build passes, deployed. NOT verified live: that the tabs now fill after Generate Transcript, and the F10 two-account bilingual call. Why meeting `77caf6f9` had no transcript is unknown (probably never recorded or generated).

## Next session starts with

1. Ask the user how the live test went: Generate Transcript as owner, then Overview, AI Summary, Action Items, Category and AI Chat should all be filled. Also the non-owner path (download only, no summary).
2. If tracks are missing, check Stream recording settings first (the stream-react skill calls auto recording a paid feature, but the F0 gate showed it works on this account).
3. Owed live checks: F10 bilingual call, W2 to W6 manual tests, LL5, Tasdeeq live run, W9 injection probe, AC-83 bilingual run, the `requested_reviewer.id` webhook payload, GitHub PR test (PR titled `KEY-1 ...`, Sync now, expect Read 1 and Linked 1).

## Open questions

- Rename or remove the "Invite by email" tab now that nothing is emailed?
- Move the post-transcript AI chain server-side so it runs even if the recap page is closed?
- Visual and accessibility check of the DotTime redesign is still owed. D3.4 recording access control stays parked.
- Left out of commits: `neurameet-source.zip`, `reports/tasdeeq-seed-*.json`; `scripts/stream-f0-check-recording-modes.mjs` is a throwaway diagnostic.
