# Memory — Follow ups grouped by meeting

Last updated: 2026-11-16

## What was built

All pushed to main and deployed (Vercel production Ready). Commits `39afec7` (feature) and `414830c` (in call guest poll test + previous memory).

- Follow-ups page redesign (prompt `prompts/followups-grouped-by-meeting.md`):
  - `src/components/follow-ups/FollowUpList.tsx` rewritten: one card per meeting (title links to `/meeting-intelligence/{id}`, "X of Y done" progress over all of that meeting's items), Open (default) / Completed / All tabs with counts, Overdue and Needs attention chips, Details link, delete. Exports `groupByMeeting`, `isOverdue`, `parseDay`.
  - New `src/components/follow-ups/FollowUpCheck.tsx`: shared tick, optimistic, calls the `updateFollowUpStatus` server action, reverts with a toast on failure.
  - `ActionItemsTab.tsx`: new `canManage` prop (from `MeetingTabs`: `!projectId && isOwner`); owner sees the tick, others a status chip; "See all follow-ups" link.
  - API: GET `/api/follow-ups` adds `meetingStartedAt` (started_at else created_at); GET `/api/meetings/[id]` adds `followUpId`/`followUpStatus` on personal meeting action items (no follow_ups query for project meetings). Both added as "(extended)" lines in AGENTS.md.
  - Types in `src/lib/meeting-types.ts`; tests updated/added; registry + tracker updated. vitest 1976 passing.

## Decisions made

- No DB change, no new route. Follow ups stay personal meeting only; project meetings use Tasks.
- In the Open view a meeting with nothing open left disappears (it shows under Completed / All).

## Problems solved

- "Still seeing the old page": the user was viewing the deployed Vercel site, and the code was not yet pushed. A push to main auto deploys; check with `vercel ls` and `vercel inspect <url>` (status Ready). The local process on port 3100 belongs to `summit-roofing`, not NeuraMeet.
- Any client component that imports `@/actions/follow-ups` (which imports `server-only`) needs `vi.mock("@/actions/follow-ups", ...)` in jsdom tests (done in `MeetingTabs.test.tsx`).
- `npx eslint --fix` rewrites out of scope files; run `npx prettier --write` only on your own files instead.

## Current state

- Follow ups redesign live; the user has not yet confirmed it after a hard refresh.
- Carried over: in call guest pop up not live tested; bilingual transcript (spec 0005) live test result not reported; old unused `n` lint warning in `MeetingRoom.tsx`; pre-existing prettier errors in `MeetingTabs.test.tsx` and `src/app/api/meetings/[id]/members/*`.
- Never commit `neurameet-source.zip` or `reports/tasdeeq-seed-*.json`.

## Next session starts with

1. Ask the user to hard refresh `/follow-ups` and confirm the grouped cards, tick, and Action Items tab sync work live.
2. Ask for the transcript test result and the in call guest pop up test result.

## Open questions

- Does the follow ups redesign feel clear enough live?
- Carried over: Gemini `thinkingBudget: 0`; leftovers cleanup (`ProjectSettingsTab.tsx`, `DecisionsTab.tsx`, email invite dead code); live GitHub `KEY-1` PR test; LL5 and Tasdeeq live runs.
