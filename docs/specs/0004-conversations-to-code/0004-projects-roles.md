# W1. Projects, members, roles, and the shared role check

Child of [0004. Conversations to Code](index.md). Uses the W1 SQL block, the role matrix, and the authorization contract from the umbrella.

## Summary

You can create a project, see its members, change roles, remove people, leave, and hand ownership to an Admin. Every API route that today checks `meetings.user_id` by hand moves onto one shared helper, so project meetings follow the role matrix and personal meetings keep working exactly as before. A removed member loses access on their very next request, and their unfinished tasks become Unassigned.

## Requirements

- **AC-1**: `POST /api/projects` with a name (1 to 80 characters) and a 2 to 5 capital letter prefix creates the project and makes the caller its Owner in one database call (`create_project`); a bad prefix returns 422 and creates nothing.
- **AC-2**: `GET /api/projects` returns only projects where the caller is an active member, each with the caller's role.
- **AC-3**: The prefix cannot change after creation; `PATCH /api/projects/[id]` accepts only `name` and is Owner only.
- **AC-4**: Role changes follow the matrix: only the Owner grants or removes Admin, an Admin may switch others between Developer and Viewer, nobody changes their own role (409), and the Owner's role is changed only through transfer.
- **AC-5**: `POST /api/projects/[id]/transfer` makes an active Admin the Owner and the old Owner an Admin in one transaction; any other target returns 409 and nothing changes.
- **AC-6**: `requireProjectRole` and `requireMeetingAccess` return 404 for a non member (same body as a missing row) and 403 for a member whose role is not allowed; every migrated route has a test for both.
- **AC-7**: Every route in the migration table below uses `requireMeetingAccess` with the listed need; on a personal meeting each route behaves exactly as before (existing tests stay green).
- **AC-8**: Removing a member (or a member leaving) is checked inside `remove_project_member(p_project, p_user, p_actor, p_actor_role)` (an Admin removes only Developers and Viewers, else 403), sets `removed_at`, unassigns their unfinished tasks with a `task_events` row each, and writes `audit_log`, all in `remove_project_member`; the Owner cannot be removed or leave (409 "Transfer ownership first").
- **AC-9**: A removed member's very next request to any project route returns 404; there is no cache of roles.
- **AC-10**: `DELETE /api/projects/[id]` is Owner only and needs `confirmName` equal to the project name (else 422). It returns 409 "Sealed minutes can't be deleted" while any of its meetings has sealed minutes; otherwise it deletes each meeting through the existing meeting cascade (transcripts, chunks, action items, attendance, ledger rows), then the project and its tasks (cascade), and writes `audit_log`. The UI asks you to type the project name.
- **AC-11**: The member list shows name and email read from Clerk on the server, never stored, and works when a Clerk lookup fails (shows "Unknown member").
- **AC-12**: A Projects page lists your projects with a Create button, and a Members tab shows members, roles, and the role and remove controls your role allows (controls you cannot use are hidden, the server still checks).

## Design

### Route migration table (`requireMeetingAccess` need per route)

| Route file | Today | Need on a project meeting |
|---|---|---|
| ai/chat (meeting chat) | owner or attendee | content |
| ai/embed | owner | manage |
| ai/process | owner | manage |
| attendance/event | participant write | unchanged |
| attendance/report | owner | manage |
| engagement | owner or attendee | content |
| follow-ups, follow-ups/[id] | owner | personal meetings only; a project meeting has none (404) |
| guest/admit, guest/deny, guest/pending | owner | manage |
| guest/request-join, guest/status, guest/expire | guest flow | unchanged (W3 adds consent) |
| ledger (GET) | owner | read |
| ledger/match, ledger/links/[id]/review | owner | manage; on a project meeting, match candidates come from the whole project (`match_ledger_candidates` change in the W1 SQL block) |
| ledger/live/card, ledger/live/checkin, ledger/live/agreement | owner | manage; check-in lists open items from the project's meetings on a project call |
| ledger/live, ledger/live/vote | participant | unchanged |
| meetings (GET list) | own meetings | own plus active project meetings (W8 finishes the views) |
| meetings/[id] (GET) | owner | read; adds `projectId`, `role`, `canManage`; for a Viewer, no transcript fields and only confirmed action items |
| meetings/[id] (DELETE) | owner | owner |
| meetings/[id]/members | any signed in | project meeting: active member only; Stream call role `admin` for Owner and Admin, `call_member` for Developer and Viewer |
| meetings/by-call/[callId] | lookup | unchanged, returns no project details |
| minutes (GET) owner view | owner | manage; attester view unchanged |
| minutes/review, minutes/seal | owner | manage |
| minutes/claim (assign, clear) | owner | manage; claim by attester unchanged |
| minutes/attest, minutes/suggestion, minutes/pdf, minutes/verify | attester or public | unchanged |
| prep | owner | manage |
| recordings (GET), recordings/[id] (DELETE) | owner | content, manage |
| search | user scoped | unchanged here; W7 adds projectId |
| transcript/upload | owner | manage |
| transcript/download | signed in participant | content to download; manage when the call would generate or rewrite the transcript |
| transcript/status | owner or participant | read |

`src/middleware.ts` protects an explicit list, so this slice adds `/projects(.*)` to `isProtectedRoute` (W2 adds `/invite(.*)`, W8 adds `/my-tasks(.*)`).

Live Ledger and Tasdeeq helpers (`findLiveMeeting` in `src/lib/live-ledger-auth.ts`, `loadMeeting` in `src/lib/minutes-review.ts`) keep returning `ownerId`, and gain an `isManager(userId)` check that calls `requireMeetingAccess(..., "manage")`, so every owner branch inside them follows the matrix without a rewrite.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Create project | Owner id | `auth().userId` |
| Role change | target's current role | `project_members.role` |
| Remove | tasks to unassign | `tasks` where `assignee_id = target` and status not completed |
| Member list | name, email | Clerk `users.getUserList({ userId: [...] })` on the server |
| Delete project | sealed check | `minutes_reviews` with a seal for any meeting where `project_id = id` |
| Host controls in the call | `canManage` | `GET /api/meetings/[id]`; `MeetingRoom.tsx` uses it instead of `call.state.createdBy` |
| Remove | caller role | the role `requireProjectRole` returned, passed as `p_actor_role` |

### UI

`/projects` (list, Create dialog with name and prefix, prefix suggested from the name's capitals, editable). `/projects/[id]` shell with a Members tab now; other tabs arrive in their steps. Use the existing tokens and `useLoadingTimeout` plus `LoadError` for every load.

### Critical test scenarios

- Happy path: create, list, add a member directly in the test fixture, change role, transfer, verifies **AC-1**, **AC-2**, **AC-4**, **AC-5**.
- Failure: Admin tries to grant Admin (403), anyone edits own role (409), Owner leaves (409), verifies **AC-4**, **AC-8**.
- Auth: for every row of the migration table, a non member gets 404 and a Viewer gets 403 where the need is content or manage, verifies **AC-6**, **AC-7**.
- Offboarding: remove a Developer with two open tasks and one completed; the two become Unassigned, the next request returns 404, verifies **AC-8**, **AC-9**.

## Build plan

1. Add the W1 SQL block (tables, indexes, `create_project`, `transfer_project_ownership`, `remove_project_member`, RLS, grants); `tasks` does not exist yet, so W1 ships `remove_project_member` without its two task statements and W4 replaces it (`create or replace`) with the full body shown in the umbrella, satisfies **AC-1**, **AC-5**, **AC-8**.
2. Write `src/lib/project-auth.ts` with unit tests, satisfies **AC-6**, **AC-9**.
3. Project routes and member routes, satisfies **AC-1** to **AC-5**, **AC-8**, **AC-10**, **AC-11**.
4. Migrate every route in the table onto `requireMeetingAccess`, with a non member and Viewer test per route, satisfies **AC-6**, **AC-7**.
5. Projects page and Members tab, satisfies **AC-12**.

## Rationale (short)

One helper beats 30 hand written checks: the owner check was copied per route and a project role would have to be copied again. Returning 404 to non members hides which projects exist. Removal is a timestamp, not a delete, so the audit trail and old task events keep a valid member reference, and rejoining reuses the row.
