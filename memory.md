# Memory — Phase W, Step W1 project workspaces (done, on main)

Last updated: 2026-11-03

## What was built

- W0 `/architect conversations to code` done; spec `docs/specs/0004-conversations-to-code/index.md`. AGENTS.md API contracts and Security lines synced from it.
- W-pre partly done: Live Ledger + Tasdeeq merged to `main` (PR #13).
- W1 built from `prompts/step-W1-project-workspaces.md` (approved):
  - SQL in `supabase/schema.sql` (W1 block): `projects`, `project_members`, `audit_log`, nullable `meetings.project_id`, rpc `create_project`, `transfer_project_ownership`, `remove_project_member`, and `match_ledger_candidates` scoped by project (same signature).
  - Shared role check `src/lib/project-auth.ts` (needs read/content/manage/owner; non member 404, wrong role 403). Every meeting scoped route migrated to it.
  - Project routes under `src/app/api/projects/` (list/create, `[id]`, members, `members/[userId]`, transfer).
  - UI: `src/app/(root)/(home)/projects/` and `src/components/projects/` (ProjectList, CreateProjectDialog, ProjectDetailView, MembersTab), sidebar link, `/projects(.*)` protected in middleware.
  - Helpers: `src/lib/project-client.ts`, `project-types.ts`, `projects.ts`.
  - Ledger match scoped per project (`src/agent/ledger-match.ts`, `loadLiveCandidates(projectId)`).
  - Follow ups exclude project meetings (`src/actions/follow-ups.ts` adds `.is("project_id", null)`).
- Commit `3c44df6` (102 files) merged to `main` via PR #14 into #13; `main` head `7e75913` holds Live Ledger, Tasdeeq, specs, and W1.
- Docs updated: progress-tracker (W1 DONE, SQL applied), build-plan (W1 ✅), scope (W1 ticked), ui-registry (Project Workspace section).

## Decisions made

- Projects, members, roles, invites live in our own Supabase tables, not Clerk Organizations.
- Personal meetings = `project_id` null and behave exactly as before.
- On a project meeting: project Owner or Admin passes every owner only meeting route; meeting delete stays Owner only. by-call DELETE is now Owner only on project meetings; by-call gained a GET returning `{ meetingId }` (user was asked to confirm both; no answer yet).
- Stream call role: `admin` for project Owner/Admin, `call_member` otherwise. MeetingRoom host controls follow `canManage`.
- rpc functions: execute revoked from public/anon/authenticated, granted to service_role only.

## Problems solved

- eslint chokes on paths with brackets: lint `src` and `constants` with JSON output, then filter to changed files.
- Remaining lint errors (guest admit/deny tests `any`, prettier in engagement, guest routes, `Sidebar.tsx`) existed on HEAD before W1; not ours.
- Live Supabase project for this app is "NeuraMeet" id `lsjiwxohfpzdvenbxpeu` (not "Kunji").

## Current state

- W1 SQL applied to live Supabase as migration `w1_projects_and_members` and verified: tables, column, 4 indexes, RLS on, anon cannot execute the functions, all 202 existing meetings have null `project_id`.
- Tests 759/759, tsc clean, `npm run build` passes (last run before commit).
- Known gaps carried to later steps: a Viewer sees an empty action item list until W4 adds `review_state`; guests on project calls not handled until W3; freezeAttesters, seal `owner_id`, and live events still use the creator id.
- LL5 and Tasdeeq live runs still owed (W-pre).

## Next session starts with

1. Step W2 invitations: write `prompts/step-W2-...md` from the 0004 spec (hashed single use tokens, expiry, owner approval, Resend email + copy link fallback), get approval, build.

## Open questions

- Confirm by-call DELETE Owner only on project meetings and the new by-call GET.
- When to do the LL5 and Tasdeeq live runs.
- Rules that hold: work on `main` and push there, no branches or PRs; ask before commit/push; SQL to live Supabase only with explicit OK per block; never read `.env`; plain words, no dashes; end reports with a 2 line summary.
