# Step W8: Workspace shell, personal views, notifications, Ctrl K

Spec: `docs/specs/0004-conversations-to-code/0004-workspace-shell.md`, deepened on 2026-11-07. It is the contract. This prompt follows its Build plan items 1 to 21 in order and satisfies AC-70 to AC-79. Scope feature 26, tier GA. You approved this step up front ("with a YES to execute").

The spec recommends several sessions, stopping after slices 5, 12, and 17. Each slice leaves the app working, so a stop at any slice boundary is safe. The tracker says which slices landed.

Rules in force: strict TypeScript, no `any`, plain JSON errors `{ error }`, every UI load uses `useLoadingTimeout` plus `LoadError`, tokens only (no hex, no raw color classes), react-hot-toast only, no new `position: fixed`, reuse `Button` from `stateful-button.tsx`. Stream code is checked with the `stream-react` skill first. Clerk code is checked with the installed Clerk skills first. Work on `main`. I ask before any commit or push.

The PDF `context/designs/NeuraMeet-UI-Overview.pdf` sets layout and information architecture only. Its colors do not apply (AC-79a).

## 0. Before code

**You do this at some point:** add these two lines to `.env.example` (my permissions block me from that file), and set both in Vercel at Deploy:

```
RESEND_WORKSPACE_FROM=
CRON_SECRET=
```

**I do this first:** mark Step W8 as in progress in `context/build-plan.md` and `context/progress-tracker.md`. Scope feature 26 is already `in-progress`.

**Things the spec does not name, for your review:**

1. **Search path on the two new functions.** The W8 block writes `add_task_comment` and `project_task_counts` with no `set search_path`. Every other function in `supabase/schema.sql` sets it, so I add `set search_path = public`.
2. **Grants on the new tables.** The block grants `task_comments` to `service_role` and leaves the rest to "per slice". I add the same grant for `notifications` and `user_settings`, or the server could not read them.
3. **`next/dist/docs` is not in this install.** `AGENTS.md` asks me to read it first. The folder does not exist on Next 15.5.18, so I follow `src/app/api/github/webhook/route.ts`, which already uses `after()` from `next/server`.

## 1. SQL, Build plan item 1

Append the W8 block from `docs/specs/0004-conversations-to-code/index.md` (lines 638 to 770) to `supabase/schema.sql`, plus the `update_task` change: `priority = coalesce(p_patch->>'priority', o.priority)` in the update, and an `edited` event with detail `{"field":"priority"}`, same signature. Apply it to the live NeuraMeet project (`lsjiwxohfpzdvenbxpeu`), then confirm the tables, columns, grants, and RLS live. The block only adds; existing rows take the column defaults.

## 2. `notify`, Build plan item 1

`src/lib/notifications.ts`: `notify(supabase, { userIds, projectId, kind, title, body, link, dedupeKey, email? })`, the constants, and `NOTIFICATION_CATEGORIES`. `src/lib/email.ts` exports `escapeHtml` and gains `sendWorkspaceEmail`. `workspaceEmailBudgetLeft` also counts `notifications.emailed_at`. Tests cover AC-71, AC-71a, AC-71c, AC-74.

## 3. The remaining slices

Built in the spec's order, each to its ACs:

2. Wire `notify` into routes and `src/lib/github-rules.ts`.
3. Notification routes, `GET /api/my-counts`.
4. Event email gate, settings route, Settings toggle.
5. Daily cron, `maxMs` on `syncProject`, `vercel.json`.
6. Check the layout against the PDF, add tokens (`context/ui-tokens.md` first, then `tailwind.config.ts`).
7. Sidebar, header, Help, avatar menu, `/profile`, middleware, bell, `/notifications`.
8. Settings tabs, account state, callback branch, `/api/settings/github`, `pr_review_requested`.
9. Project fields, `project_task_counts`, New Project, My Projects.
10. Tab keys and aliases, header, Settings tab, Overview, empty states.
11. Priority, Tasks with Review, filters, Board and List.
12. Comments, drawer, commits route.
13. Members table, Add Members, Resend, `member_role_changed`, `member_joined`.
14. Invite page, `/api/invitations/mine`, banner, `project_invitation`.
15. Schedule fields, `meeting_scheduled`, Meetings tab.
16. Meeting Details header, Transcript tab, proposals on Action Items.
17. GitHub tab, summary route, `pr_author_login`.
18. Decisions and Activity filters, AI Assistant tab.
19. `GET /api/my-tasks`, `/my-tasks`, My Dashboard, My Meetings.
20. `cmdk`, palette, search route, `q` on `/search`, Raise hand, auth layouts.
21. `tests/w-test`, `context/ui-registry.md`, `context/progress-tracker.md`, `/imprint`.

## 4. Checks

After each batch: `npx tsc --noEmit`, lint, `npx vitest run`, and a build where practical. I report exact test steps tied to ACs at the end, and which slices landed and which remain.
