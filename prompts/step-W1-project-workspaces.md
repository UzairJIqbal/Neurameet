# Step W1: Projects, members, roles, and the shared role check

Spec: `docs/specs/0004-conversations-to-code/0004-projects-roles.md` (child of the umbrella `index.md`, Status Proposed, tier GA). This prompt covers the whole W1 Build plan (items 1 to 5) and satisfies AC-1 to AC-12. No invitations yet (W2), no tasks yet (W4), so a second member exists only through the test fixture or a direct SQL insert until W2 lands.

Rules in force: Next.js 15 App Router, strict TypeScript, no `any`, every route returns plain JSON errors, every load in the UI uses `useLoadingTimeout` plus `LoadError`, tokens only (no hex, no raw color classes), react-hot-toast only. No new dependency, no new env var, no new provider.

## 0. Before code

- Branch: `feat/project-workspaces`, cut from `feat/live-ledger-tasdeeq` (PR #13 is still open, so W1 stacks on it). If PR #13 merges first, rebase onto `main`.
- AGENTS.md API Contracts and the Security list already carry every Phase W line (applied by `/sync` on 2026-11-03). Nothing else in AGENTS.md changes here.
- Set the umbrella `index.md` `**Status**:` from `Proposed` to `In Progress`. Mark scope row #20 and Step W1 in `context/build-plan.md` as in progress.

## 1. Schema (`supabase/schema.sql`), Build plan item 1

Append a `-- ===== W1. Projects and members =====` section with exactly the umbrella's W1 SQL block:

- Tables `projects`, `project_members` (with `project_members_one_owner` and `project_members_active_user`), `audit_log` (with `audit_log_project`).
- `meetings.project_id uuid references projects(id) on delete restrict` plus `meetings_project`.
- Functions `create_project`, `transfer_project_ownership`, and the new `match_ledger_candidates` (same signature, so existing callers keep working).
- `remove_project_member(p_project, p_user, p_actor, p_actor_role)` **without** the two task statements (`tasks` and `task_events` do not exist yet). W4 replaces it with `create or replace` and the full body.
- `enable row level security` on the three new tables, no policies, `grant all ... to service_role` in the same style as the ledger and minutes tables.
- For each new or replaced function: `revoke execute ... from public, anon, authenticated` then `grant execute ... to service_role`.
- Everything idempotent (`if not exists`, `create or replace`).

I show you the SQL, apply it to the Supabase project only with your OK, then confirm with an `information_schema` query that the tables, the column, and the functions are live.

## 2. The shared role check (`src/lib/project-auth.ts`, `server-only`), Build plan item 2

Exactly the umbrella's *Authorization contract*:

- `ProjectRole`, `MeetingNeed`, `ProjectAccessError(status: 403 | 404, message)`.
- `requireProjectRole(supabase, userId, projectId, allowed)`: one read of `project_members` where `removed_at is null`, no cache. Not a member (or no such project) → 404 with the same body as a missing row. Role not in `allowed` → 403.
- `requireMeetingAccess(supabase, userId, meetingId, need, personalFallback?)`:
  - Missing meeting → 404.
  - Personal meeting (`project_id` null): `manage` and `owner` need `meetings.user_id === userId`; `read` and `content` pass when the caller is the owner or `personalFallback()` returns true. Failure is 404 for someone with no relation, matching each route's current behavior (I keep the exact status each route returns today so existing tests stay green; where a route returns 403 today it keeps 403).
  - Project meeting: `read` → any role, `content` → owner, admin, developer, `manage` → owner, admin, `owner` → owner. Non member 404, wrong role 403.
  - Returns `{ meetingId, projectId, role }`.
- `accessErrorResponse(err)`: turns a `ProjectAccessError` into `NextResponse.json({ error }, { status })`, so every route handles it in one line.
- Tests `src/lib/project-auth.test.ts` with a mocked Supabase client: member per role, removed member (404), outsider (404), personal meeting owner, personal fallback true and false, missing meeting.

## 3. Project and member routes, Build plan item 3

New files under `src/app/api/projects/`, each with `auth()` from Clerk, the caller id never taken from the body, and `ProjectAccessError` mapped through the helper:

| Route | Rule |
|---|---|
| `POST /api/projects` | name 1 to 80 chars (trimmed), `taskPrefix` `^[A-Z]{2,5}$`, else 422 and nothing created; calls `create_project` |
| `GET /api/projects` | active memberships joined to projects, each with your role and member count |
| `GET /api/projects/[id]` | member: project, your role, counts (members, meetings) |
| `PATCH /api/projects/[id]` | owner only, accepts only `name` (a `taskPrefix` key is 422), updates `updated_at` |
| `DELETE /api/projects/[id]` | owner only, `confirmName` must equal the name (422). 409 "Sealed minutes can't be deleted" when any project meeting has a row in `minutes_seals`. Otherwise deletes each meeting through the same cascade the existing `DELETE /api/meetings/[id]` uses (I extract that cascade into a shared server function so both routes call one code path, no copy), then the project, then writes `audit_log` `project.deleted` |
| `GET /api/projects/[id]/members` | member: active members, role, joined date, name and email from Clerk `users.getUserList({ userId })` in one batch; a failed lookup shows "Unknown member" and no email |
| `PATCH /api/projects/[id]/members/[userId]` | owner or admin, `{ role }` in `admin`, `developer`, `viewer`. Own role → 409. Target is owner → 409 (use transfer). Granting or removing admin needs the owner (admin caller → 403). Writes `audit_log` `member.role_changed` with from and to |
| `DELETE /api/projects/[id]/members/[userId]` | you leaving, or owner or admin removing. Calls `remove_project_member` with the role from `requireProjectRole`. Owner target → 409 "Transfer ownership first". `not_removable` → 403 |
| `POST /api/projects/[id]/transfer` | owner only, `{ userId }`; calls `transfer_project_ownership`; `target_not_admin` → 409, nothing changes |

Shared parsing and Clerk lookups live in `src/lib/projects.ts` (server only). Shared response types in `src/lib/project-types.ts` (no `server-only`, the UI imports them). Tests per route for the happy path, 422, 409, 403, and 404 cases in the spec's *Critical test scenarios*.

## 4. Migrate every meeting route, Build plan item 4

Follow the route migration table in `0004-projects-roles.md` row by row. For each route:

- Replace the hand written `meetings.user_id` check with `requireMeetingAccess(..., need)`. Where the route today allows an attendee or participant, pass that existing check as `personalFallback`, unchanged.
- Personal meetings behave exactly as before. All 555 existing tests must stay green without edits to their expectations.
- Add two tests per migrated route: a non member on a project meeting gets 404, a Viewer gets 403 where the need is content or manage (a Developer gets 403 where the need is manage).

Special rows:

- `follow-ups` and `follow-ups/[id]`: a project meeting has no follow ups, so 404.
- `ledger/match`: the new `match_ledger_candidates` already picks the whole project on a project meeting; the route only changes its access check.
- `ledger/live/checkin`: on a project call, candidates come from the project's meetings instead of the owner's.
- `meetings/[id]` GET: adds `projectId`, `role`, `canManage`. For a Viewer, the response leaves out the transcript fields and returns only action items with `review_state` confirmed. That column arrives in W4, so in W1 a Viewer gets no action items on a project meeting (I note this in the progress tracker so W4 switches it on).
- `meetings/[id]/members`: project meeting needs an active member; the Stream call role is `admin` for Owner and Admin and `call_member` for Developer and Viewer. Before touching this Stream code I check the `stream-react` skill (`references/VIDEO.md`) for the current `updateCallMembers` role shape, per the Stream verification rule.
- `meetings/by-call/[callId]` and the guest and attendance write routes stay unchanged.
- `findLiveMeeting` (`src/lib/live-ledger-auth.ts`) and `loadMeeting` (`src/lib/minutes-review.ts`) keep returning `ownerId` and gain `isManager(userId)`, which calls `requireMeetingAccess(..., "manage")`. Every owner branch inside Live Ledger and Tasdeeq switches to `isManager`.
- `src/components/MeetingRoom.tsx`: host controls use `canManage` from `GET /api/meetings/[id]` instead of `call.state.createdBy`. On a personal meeting `canManage` equals today's owner check, so nothing changes for you there.

## 5. Pages, Build plan item 5

- `src/middleware.ts`: add `/projects(.*)` to `isProtectedRoute`.
- `/projects`: your projects as cards (name, prefix, your role, member count), a Create button that opens a dialog with name and prefix. The prefix is suggested from the capitals of the name (or the first letters, uppercased, 2 to 5), and you can edit it. A 422 shows the server message under the field.
- `/projects/[id]`: page shell with a header (name, prefix, your role) and a Members tab. Other tabs arrive in their steps.
- Members tab: list with name, email, role, joined date. Role select and Remove button appear only where your role allows (the server still checks). "Leave project" for non owners. For the owner: "Transfer ownership" (choose an active Admin) and "Delete project" (type the project name to enable the button).
- A Projects link in the sidebar, using the existing nav item pattern and tokens.
- Every server call goes through a small client file `src/lib/project-client.ts`. Every load uses `useLoadingTimeout` plus `LoadError`. Toasts via react-hot-toast.
- After the UI: run `/imprint`, update `context/ui-registry.md`.

## 6. Checks and close

- `npx tsc --noEmit`, `npx eslint` on the changed files, `npx vitest run`, `npm run build`. All must pass.
- Update `context/progress-tracker.md` and `context/build-plan.md` (W1 done, W2 next) and tick the W1 boxes in `docs/scope/scope.md` row #20.
- Feature stays `in-progress` (GA tier): `/check verify` and `/test` close it.

## Test steps for you (after the build)

1. Open `/projects` while signed out: you land on sign in.
2. Create a project "NeuraMeet Core" with prefix `NM`. Try prefix `nm1`: you see the 422 message and no project is made.
3. In Supabase, insert a second user as `developer` into `project_members` for the project (W2 will do this through invites). Sign in as that user: you see the project with role Developer and no role or remove controls.
4. As the owner, make that user Admin, then Viewer. Try to change your own role: the control is not there, and a direct API call returns 409.
5. As the second user, open `/api/projects/<id>` after the owner removes you: 404.
6. Open one of your personal meetings and run the usual flow (upload, process, chat, ledger, minutes): everything works as before.
7. Delete the project: the button stays disabled until you type the exact name.
