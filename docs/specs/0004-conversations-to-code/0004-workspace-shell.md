# W8. Workspace shell, personal views, notifications, and Ctrl K

Child of [0004. Conversations to Code](index.md). Uses the W8 SQL block (`notifications`, `user_settings`) and the configuration list (`CRON_SECRET`, `RESEND_WORKSPACE_FROM`, `vercel.json`).

## Summary

This step ties the workspace together. A project page gets its final tab layout. You get a My Tasks page across every project, a bell with your notifications, an optional email for each event, and one morning digest. Ctrl K (Cmd K on a Mac) opens a quick jump to any project, task, or meeting you can see. Two new color tokens (success and warning) arrive for task and status states.

## Requirements

- **AC-70**: The project page has tabs Overview, Board, Meetings, Decisions and Promises, Activity, Assistant, Members, Settings; tabs your role cannot use are hidden (Assistant hidden for Viewers, Settings for non Owners and non Admins), and the server still checks every route.
- **AC-71**: Notifications are written for: `task_assigned` (to the new assignee, not when you assign yourself), `proposals_ready` (Owner and Admins, once per processed meeting), `join_request` (Owner and Admins), `join_approved` (the requester), `task_completed_by_merge` and `task_reopened_by_revert` (the assignee), `kept_suggestion` (Owner and Admins). Each insert uses `on conflict (dedupe_key) do nothing` with these keys: `task_assigned:<taskId>:<version>`, `proposals_ready:<meetingId>:<processedAt>`, `join_request:<requestId>`, `join_approved:<requestId>`, `task_completed_by_merge:<taskId>:<mergeSha>`, `task_reopened_by_revert:<taskId>:<revertPr>`, `kept_suggestion:<ledgerLinkId>`. A failed insert is logged and never fails the main action.
- **AC-72**: The bell shows the unread count and the latest 20, with "Mark all read"; `GET /api/notifications` pages by `cursor`; `POST /api/notifications/read` marks only the caller's rows.
- **AC-73**: The bell refetches on window focus and every 60 seconds (no realtime).
- **AC-74**: An event email is sent only when `RESEND_WORKSPACE_FROM` is set, the recipient's `user_settings.email_notifications` is true (missing row means true), and the workspace event budget for today (UTC) is not spent: fewer than 60 sent, counting `notifications.emailed_at` plus `audit_log` `invite.emailed`; the email has the title, body, and an absolute link from `NEXT_PUBLIC_APP_URL`. A failed send is logged and leaves `emailed_at` null.
- **AC-75**: `POST /api/settings/notifications { emailNotifications }` upserts `user_settings`; the Settings toggle calls it alongside its existing localStorage write, and a failed call shows a toast and keeps the local value.
- **AC-76**: `GET /api/cron/daily` (`maxDuration = 60`) returns 401 unless `Authorization` is `Bearer CRON_SECRET`; it sends one digest per user with at least one task due today or overdue (PKT day) or unread notifications from the last 24 hours, skipping users whose `digest_sent_on` is today and stopping at 20 digests a day, then sets `digest_sent_on` (email toggle as in AC-74; Clerk emails looked up in batches with `getUserList`); purges `github_deliveries` older than 30 days, and runs GitHub Sync for each project with open links (100 PR reads per project, at most 5 projects per run, oldest synced first); it returns counts.
- **AC-77**: `/my-tasks` (added to `isProtectedRoute` with `/my-tasks(.*)`) lists your assigned open tasks across active projects, grouped Overdue, Due today, Upcoming, No date, with the project and key; `GET /api/meetings` adds project meetings from your active projects with `projectId` and your role, and accepts `?projectId=` for one project (404 for a non member).
- **AC-78**: Ctrl K or Cmd K opens a `cmdk` palette with Projects, Tasks (by key or title), and Meetings you can access, from one server search call debounced 200 ms; Escape closes it; it never lists rows from projects you are not an active member of.
- **AC-79**: `context/ui-tokens.md` gains `success` and `warning` tokens (light and dark) used for the Completed and Blocked states and the overdue badge; no raw color classes or hex values are added.

## Design

### Where notifications are written

One helper `notify(supabase, { userIds, projectId, kind, title, body, link, dedupeKey })` in `src/lib/notifications.ts`, called after the main write succeeds, inside `after()` when it sends email. Callers: task PATCH and review confirm (assigned), `/api/ai/process` (proposals ready), join request create and approve (W2 routes), webhook processing (merge, revert, kept suggestion).

### Palette search

The palette calls `GET /api/projects/search?q=` (added with this slice to the API Contracts list): title `ilike` on projects, tasks, and project meetings limited to the caller's active projects, 5 per group, plus a `KEY-123` exact match. It never uses embeddings.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Email toggle on the server | boolean | `user_settings.email_notifications`, default true |
| Email address | primary email | Clerk on the server at send time |
| Today | date | Asia/Karachi day; the email budgets count by UTC day (Resend's day) |
| Digest once a day | date | `user_settings.digest_sent_on` |
| Digest content | tasks, notifications | `tasks` due on or before today and not completed; unread `notifications` from 24 hours |
| Cron auth | secret | `CRON_SECRET` from Vercel |

Constants in `src/lib/notifications.ts`: `EVENT_EMAIL_DAILY_CAP = 60`, `DIGEST_DAILY_CAP = 20`, `BELL_REFETCH_MS = 60_000`, `CRON_SYNC_PROJECTS = 5`.

### Critical test scenarios

- Happy path: assigning a task to someone writes one notification and, with the sender set, one email; the bell count goes up, verifies **AC-71**, **AC-72**, **AC-74**.
- Dedupe: the same event twice writes one row, verifies **AC-71**.
- Budget: with 60 event emails sent today, the 61st event writes the notification and sends no email; a 21st digest is not sent, verifies **AC-74**, **AC-76**.
- Toggle: email off on the server means no event email and no digest email, verifies **AC-74**, **AC-75**, **AC-76**.
- Cron: no header 401; with it, old deliveries go and counts return; a second run the same day sends no second digest, verifies **AC-76**.
- Auth: the palette for a removed member returns nothing from that project, verifies **AC-78**.

## Build plan

1. W8 SQL block, `notify` helper with tests, and the notification routes, satisfies **AC-71**, **AC-72**.
2. Wire `notify` into the W2, W4, and W5 routes, satisfies **AC-71**.
3. Event email gate and the settings route plus the Settings toggle call, satisfies **AC-74**, **AC-75**.
4. Daily cron route and `vercel.json`, satisfies **AC-76**.
5. Shell tabs, bell, My Tasks, meetings list extension, satisfies **AC-70**, **AC-73**, **AC-77**.
6. Install `cmdk` (check for its skill first), palette and its search route, satisfies **AC-78**.
7. Add the success and warning tokens and update `context/ui-registry.md`, run `/imprint`, satisfies **AC-79**.

## Rationale (short)

In app notifications always work; email is an extra that only turns on with a real sender and under the free cap. One daily cron fits Vercel Hobby and does three jobs. Polling every minute is cheap at this scale and needs no realtime service.
