# Memory — Phase W Step W8 closed, GitHub connect rework

Last updated: 2026-11-08

## What was built

W8 (workspace shell, personal views, notifications, Ctrl K) is committed and pushed (`1902e43`). Spec `docs/specs/0004-conversations-to-code/0004-workspace-shell.md` stays In Progress until the user says `done`. Prompt `prompts/step-W8-workspace-shell.md`.

This session added the GitHub connect rework on top (committed and pushed to main this session):

- `src/lib/github.ts`: `appSlug()` reads the slug from the App behind the credentials (cached, falls back to `NEXT_PUBLIC_GITHUB_APP_SLUG`); `installUrls` takes the slug.
- `src/app/api/github/callback/route.ts`: new `install` outcome. With no installations found it redirects straight to the App install page.
- `src/app/api/projects/[id]/github/repos/route.ts`: install URL built with `appSlug()`.
- `src/components/projects/GitHubTab.tsx`: one primary "Connect GitHub" (or "Reconnect GitHub") action, "Manage repositories on GitHub" opens a new tab, list refreshes on tab focus.
- `scripts/github-app-manifest.mjs`: one click local GitHub App creation, writes credentials to a git ignored file.
- Tests: callback, github routes, github-ui unit tests, `tests/w-test/github-connect.spec.ts`, type fix in `w8-shell.spec.ts`.
- Docs: W8 spec follow ups, `context/progress-tracker.md` W8 line, this file.

## Decisions made

- Projects, members, roles and invites stay in our own Supabase tables, not Clerk Organizations. The PDF is layout only; locked Stitch tokens stay.
- Resend invite route returns 403 "Only the owner can invite an Admin". The invited email is never returned. No team names for link or non matching invites.
- Viewer rules: no quotes, no comment counts, no PR refs, `task.commented` hidden from Viewer activity.
- My Tasks uses a base select with no quotes for any role. Overdue is judged against the server `today`. "Due this week" is today plus 6 days.
- Raise hand is a one shot reaction, no persistent hand state. No new `position: fixed` (ui-rules).
- Local dev GitHub App `neurameet-local-x072s` has no webhook (GitHub rejects a localhost hook URL), so PR to task links come only from "Sync now" (`recentPulls` in `src/lib/github-rules.ts`).
- Commit and push go straight to main, no branches or PRs, and only after asking.

## Problems solved

- Install link used the wrong App slug: now read from the App via `GET /app`.
- Double back navigation after GitHub Configure: GitHub's Save does not redirect on an installed App, so Manage opens in a new tab and the list refreshes on focus.
- "We couldn't connect to the meeting service" on the dev server is the 12 s `useLoadingTimeout` tripping on a cold `next dev`. Run Playwright and manual checks against `npm run build` and `npm start`.
- BSD `xargs` has no `-a`; use `tr '\n' '\0' | xargs -0`. `eslint --fix` fixes prettier only in files without the `eslint-disable prettier/prettier` header.
- Permission classifier denied reads of `.env.local` through Bash and minting a Clerk sign-in ticket. Do not work around them; the Chrome extension was not connected, so the user ran the live GitHub checks by hand.

## Current state

All checks passed 2026-11-08. Live GitHub results: repo linked, Sync linked PR #1 ("NEU-1 W8 check PR" in `neurameet-w8-test`) to task NEU-1, Show commits returned the commit, account connect (`GET /user`) stored the login. vitest, tsc, build and lint were clean at the last full run. The `npm start` server on port 3000 is stopped.

Left uncommitted on purpose: `.env.example`, `context/designs/NeuraMeet-UI-Overview.pdf`, `reports/tasdeeq-seed-285970e0-5c71-4a08-b1d0-bdb43d8998d2.json`.

## Next session starts with

1. Step W9 (security suite and bilingual end to end run): write the prompt file in `prompts/`, ask "Good to execute?", implement only after approval.
2. Add `.env.example` lines `RESEND_WORKSPACE_FROM=` and `CRON_SECRET=` (earlier edit was denied) and set both in Vercel at Deploy.

## Open questions

- Unverified: `requested_reviewer.id` in the `review_requested` payload (needs a public webhook URL, left for Deploy), and the `project` call type `create-call-reaction` grant for members (run the Stream check).
- Run the optional architect cross check on the W8 spec?
- Spec status for W8 flips from In Progress only when the user says `done`.
