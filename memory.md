# Memory — Phase W Step W8, workspace shell

Last updated: 2026-11-08

## What was built

W8 code is built in 21 slices (all uncommitted), spec `docs/specs/0004-conversations-to-code/0004-workspace-shell.md` (still In Progress), prompt `prompts/step-W8-workspace-shell.md`.

- Data and server: notifications migration (applied live to the NeuraMeet Supabase project), `notify` library and routes (`/api/notifications`, `/api/notifications/read`), `/api/my-counts`, `/api/my-tasks`, `/api/settings/notifications`, `/api/settings/github`, `/api/cron/daily` with `vercel.json`, `/api/projects/search`, task comments and commits routes, invitations mine routes.
- Shell: new Sidebar and Navbar header (breadcrumbs, bell, Help, profile menu), `src/components/shell/` (CommandPalette, DashboardCards, MyTasksPage, NotificationsPage, NotificationBell, HelpDialog, ShellContext), success and warning tokens.
- Projects: My Projects, project header and tabs (Overview, Tasks Board and List, Members with `AddMembersDialog`, Meetings, GitHub, Decisions, Activity, AI Assistant, Settings), invite page, task drawer with comments.
- Personal views: My Tasks, My Dashboard (`DashboardContent` rewrite), My Meetings (`MeetingList` with project filter), `/search?q=`.
- Meeting room: Raise hand (one shot reaction). Auth: shared `AuthLayout` redesign (50/50 split, Proof Chain staircase).
- Docs: `context/ui-registry.md` (AddMembersDialog replaces InviteDialog, shell rows, AuthLayout row), `context/progress-tracker.md` W8 line, `docs/scope/scope.md` feature 26 build boxes ticked. `tests/w-test/w2-invitations.spec.ts` rewritten for `AddMembersDialog`.

## Decisions made

- Projects, members, roles and invites stay in our own Supabase tables, not Clerk Organizations. The PDF is layout only; locked Stitch tokens stay.
- Resend invite route returns 403 "Only the owner can invite an Admin". The invited email is never returned. No team names for link or non matching invites.
- Viewer rules: no quotes, no comment counts, no PR refs, `task.commented` hidden from Viewer activity.
- My Tasks uses a base select with no quotes for any role. Overdue is judged against the server `today`. "Due this week" is today plus 6 days.
- Dashboard keeps Join, Schedule and Upload as a secondary row. Scheduled meetings sit under Upcoming in MeetingList. Delete on project meetings is Owner only.
- Palette Projects match name in memory. Palette meetings and decisions are scoped to active projects plus your own personal rows.
- Raise hand is a one shot reaction, no persistent hand state. No new `position: fixed` (ui-rules).
- Auth pages reuse `AuthLayout` and keep existing forms.

## Problems solved

- tsc caught a bug in `MeetingModel.tsx` (instant meeting `details`), fixed.
- BSD `xargs` has no `-a`; use `tr '\n' '\0' | xargs -0`. `eslint --fix` fixes prettier only in files without the `eslint-disable prettier/prettier` header.
- Vacuous `callsOf` test assertions replaced with real ones.

## Current state

Checks before the last doc edits: vitest 149 files and 1611 tests pass, `npx tsc --noEmit` clean, `npm run build` passes, eslint 0 errors and 7 warnings (unused vars and one exhaustive-deps, plus unused disable directives). Nothing committed or pushed. Spec W8 not yet Accepted, Verify and Test boxes not ticked. The architect cross check did not run. Earlier open items: Tasdeeq live run needs signing key env values, LL5 live run, W-pre commit.

## Next session starts with

1. Ask before committing W8 (and the earlier in flight work), then commit to main (no branches or PRs).
2. Run `/check verify workspace shell` with a live browser pass against the ACs.
3. Add `.env.example` lines `RESEND_WORKSPACE_FROM=` and `CRON_SECRET=` (earlier edit was denied) and set both in Vercel at Deploy.
4. Then Step W9 (security suite and bilingual end to end run).

## Open questions

- GitHub App permission for `GET /repos/{owner}/{repo}/pulls/{n}/commits`: if it needs more, hide "Show commits" rather than widen the App.
- Unverified live: `GET /user` for account connect, `requested_reviewer.id` in `review_requested` payload, and the `project` call type `create-call-reaction` grant for members (run the Stream check).
- Run the optional architect cross check on the W8 spec?
