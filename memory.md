# Memory — Recap speed, project redirect, Team & Tasks tab

Last updated: 2026-11-12

## What was built

All pushed to main (latest `004d1fc`). Last production deploy `neurameet-d880zzgd0` is Ready.

- Recap speed:
  - `src/agent/transcript-generation.ts`: `cleanupTranscript` returns the raw text when it is under 1500 chars and has no Urdu or Hindi script (`CLEANUP_SKIP_MAX_CHARS`, `NON_LATIN_SCRIPT`).
  - `src/lib/meeting-pipeline-client.ts`: `/api/ai/embed` now starts at the same time as `/api/ai/process`, then ledger match runs.
  - `src/agent/models.ts`: the Gemini structured call sets `thinkingConfig.thinkingBudget: 0`.
  - `AfterMeetingRecap.tsx`: poll every 5000 ms, `NO_RECORDING_POLL_CAP = 60`.
- Recap redirect: `getMeetingRecap` (`src/lib/meeting-recap.ts`) returns `projectId`. After the summary is created, a project meeting goes to `/projects/{id}?tab=tasks`. The bottom button reads "Go to Project" for project meetings, otherwise "Go back to Dashboard".
- `AddMembersDialog.tsx`: the "Invite by email" tab is removed and the dialog opens on the link tab. The email sections are still in the file as dead code. Five email-only tests were deleted from `invites-ui.test.tsx`.
- `ProjectDetailView.tsx`: the tab label is now "Team & Tasks". The tab id stays `tasks` (`?tab=tasks`).
- Tests updated: `models.test.ts`, `transcript-generation.test.ts`, `meeting-pipeline-client.test.ts`, `AfterMeetingRecap.test.tsx`.

## Decisions made

- `/api/ai/process` stays one large structured call. It was not split because of the cross-references (`actionItemIndex`, `relatedDecisionIndex`) and the amount of write logic.
- Invites are link only, with no invite email.
- Only the project owner links GitHub repos.

## Problems solved

- Parallelising embed broke 3 pipeline tests and 1 cleanup test. Fixed with URL-based fetch mocks and an Urdu string in the cleanup test input.
- The Gemini timing script only works when run from the project root.
- `vercel --prod` was blocked once by the auto classifier. It went through after the user explicitly ordered a deploy.

## Current state

- The code, tests and deploy are done. Recap speed is not verified live. Gemini returned "high demand" and "Headers Timeout" during timing tests. When Gemini fails, the app falls back to Groq, which is slower.
- It is unconfirmed whether Gemini accepts `thinkingBudget: 0`. A rejection also causes the Groq fallback.
- `context/progress-tracker.md` and `context/ui-registry.md` have NOT been updated for the project UI changes, the speed work, the redirect, the email-tab removal or the tab rename.
- GitHub task linking:
  - Key regex is `\b([A-Z]{2,5})-(\d{1,6})\b`.
  - `Closes KEY-1` completes the task on merge. One closing word covers one key.
  - A draft PR sets the task to In Progress, which shows in To Do. Ready for review sets In Review. A merge into the default branch completes it. A revert reopens it.
  - "Sync now" re-applies the same rules.
  - Jair and Alisnain have joined via Google. They need collaborator access on the repo on GitHub. This has not been tested live.

## Next session starts with

1. Update `context/progress-tracker.md` and `context/ui-registry.md` for the changes above.
2. Check the Vercel logs for the recap pipeline: does Gemini accept `thinkingBudget: 0`, and how long does `/api/ai/process` take?
3. Run the live GitHub test: a PR titled `KEY-1 ...` from a member, then Sync now.

## Open questions

- Should ledger, minutes and dissent extraction move out of the one big `/api/ai/process` call to make it faster?
- Remove the leftovers: `ProjectSettingsTab.tsx`, `DecisionsTab.tsx` and its test, the email-invite dead code in `AddMembersDialog.tsx`, and the unused `typeAddress` helper in `invites-ui.test.tsx` (lint warning)?
- Other live checks still owed: F10 bilingual call, W2 to W6 manual tests, LL5, Tasdeeq live run.
