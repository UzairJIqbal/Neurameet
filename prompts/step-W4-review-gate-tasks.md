# Step W4: Review gate, keyed tasks, and the Kanban board

Spec: `docs/specs/0004-conversations-to-code/0004-review-gate-tasks.md` (child of the umbrella `index.md`, Status In Progress, tier GA), accepted at `/architect` on 2026-11-03. This prompt covers the W4 Build plan items 1 to 6 and satisfies AC-30 to AC-42, plus W3's AC-24 and AC-25 (move a meeting into a project). The spec is the contract: where this prompt is shorter, the spec wins.

Rules in force: Next.js 15 App Router, strict TypeScript, no `any`, plain JSON errors `{ error }`, every UI load uses `useLoadingTimeout` plus `LoadError`, tokens only (no hex, no raw color classes), react-hot-toast only. One new dependency: `@hello-pangea/dnd` 18.x (React 19 peer supported, already named in `context/library-docs.md`; no agent skill exists for it, so I build from its README API: `DragDropContext`, `Droppable`, `Draggable`, `onDragEnd`). No new provider, no new env var. Work on `main`, no branch, no PR. Ask before commit and push.

No Stream code changes in this step.

## 0. Before code

- Mark Step W4 in `context/build-plan.md` as in progress.
- AGENTS.md API Contracts already list every W4 route and `POST /api/meetings/[id]/project`. Nothing to add.

## 1. Schema, Build plan item 1 (W4a)

Append `-- ===== W4. Proposals, tasks, board (spec 0004, child 0004-review-gate-tasks) =====` to `supabase/schema.sql` with:

- The umbrella W4 block exactly: `action_items` review columns (with `embedding vector(768)` and `merged_into_task_id`), `tasks`, `task_events`, the two FKs, indexes, `create_project_task`, `match_project_tasks`.
- `remove_project_member` replaced with the full body (keeps `p_actor_role`, keeps `set search_path = public`, adds the task unassign plus `unassigned` events).
- The three new functions from *W4 SQL additions*:
  - `replace_meeting_proposals(p_meeting uuid, p_items jsonb, p_actor text) returns setof uuid`: locks the meeting row (`for update`); raises `proposals_reviewed` when any of the meeting's items is `confirmed` or `rejected` or is some task's `source_action_item_id`; deletes the meeting's `proposed` items; inserts the new rows from `jsonb_to_recordset` (`id, title, assignee, due_date, quote, quote_speaker, quote_line, quote_verified, proposed_assignee_id, duplicate_of_task_id, duplicate_score, embedding`, `review_state = 'proposed'`); returns the ids in input order. The route passes ids it generated up front, so the Tasdeeq minutes draft keeps naming the right rows.
  - `review_proposal(p_item, p_decision, p_title, p_assignee, p_assignee_given, p_due, p_merge_task, p_embedding, p_actor, p_confirm_without_quote) returns jsonb`: locks the item's meeting row; flips `review_state` with the `where review_state = 'proposed'` guard (raise `already_decided`); confirm checks `quote_verified or p_confirm_without_quote` (raise `quote_unverified`), resolves the assignee (`p_assignee_given` picks `p_assignee`, else `proposed_assignee_id`), checks it is an active member (raise `assignee_not_member`), then runs the same body as `create_project_task` (calls it directly, so the key counter lives in one place) with the quote snapshot and `p_embedding` (null means copy `action_items.embedding`); reject sets `rejected`; merge locks the target task `for update`, requires same project and not `completed` (raise `task_closed`), sets `rejected` plus `merged_into_task_id`, writes a `proposal_merged` event with `detail = {quote, actionItemId}`, no `version` bump. Every flip also sets `reviewed_by`, `reviewed_at`. Returns `{ task }` or `{ item }`.
  - `renumber_task_column(p_project uuid, p_status text)`: locks that column's rows and sets `position` to 1, 2, 3 in `position, number` order; no `version` bump, no events.
  - `move_meeting_to_project` from `0004-project-meetings.md` (AC-25), unchanged.
- RLS on for `tasks` and `task_events` (no policies), `grant select, insert, update, delete ... to service_role`; every new function revoked from `public, anon, authenticated` and granted to `service_role`, all with `set search_path = public` like the W1 functions.

I show you the SQL, apply it to the live NeuraMeet project (`lsjiwxohfpzdvenbxpeu`) as migration `w4_review_gate_tasks` only with your OK, then confirm the columns, both tables, the functions, and the grants. Every existing `action_items` row reads `review_state = 'auto'`.

## 2. Shared helpers

- `src/lib/tasks.ts` (browser safe): the eight constants from the spec, `TASK_STATUSES` plus labels (To do, In progress, In review, Completed, Blocked), `taskKey(prefix, number)`, `parseTaskKeyQuery(q, prefix)` (`NM-12` or `12` → number), `midpointPosition(before, after)` and `needsRenumber(a, b)` (gap under `1e-6`). Unit tested.
- `src/lib/task-types.ts`: `Task`, `TaskEvent`, `Proposal`, `TasksResponse` (`{ tasks, truncated }`).
- `src/lib/project-select.ts` (`server-only`): `TASK_SELECT_FULL`, `TASK_SELECT_VIEWER` (no `quote`, `quote_speaker`, `quote_line`, `completion_evidence`; `embedding` in neither), `redactEventForViewer(event)` (drops `detail.quote`), `taskSelectFor(role)`.
- `src/lib/with-timeout.ts`: `withTimeout(promise, ms)` rejecting with a timeout error. Unit tested.
- `src/lib/rpc-error.ts` only if `rpcErrorCode` is not already shared (reuse the W2 helper if it is).

## 3. Process route, Build plan item 2 (W4b, AC-30 to AC-34)

`src/app/api/ai/process/route.ts`. Personal meetings keep today's code path byte for byte (owner check, delete all, `auto` items, follow ups).

For a meeting with `project_id`:
- Auth already runs `checkMeetingAccess(..., "manage")` before the AI call (Owner or Admin; 404 non member, 403 others). Kept and covered by a test.
- Before the AI call: fast check, any item of the meeting that is `confirmed`/`rejected` or a task's `source_action_item_id` → 409 "Proposals were already reviewed".
- After extraction: keep the first `MAX_PROPOSALS_PER_MEETING` items (the minutes draft uses the same capped list).
- New `src/agent/proposals.ts` (server only), small pure pieces plus one orchestrator:
  - `locateQuote(rawText, quotes)` → first quote with exactly one `findQuoteLines` hit on the full `raw_text`; trimmed, cut to 500 chars.
  - `resolveSpeakerMember(supabase, meetingId, label, activeIds)` → speaker claims (via `minutes_reviews`, normalized lowercase label) then `attendance_events.participant_name` case insensitive, `user_id` not null and active; exactly one or null.
  - `buildNameMatcher(profiles)` → exact case insensitive full name, or a first name only one member has; null, empty, "me", "I", "unassigned", or ambiguous → null.
  - `suggestAssignee(...)` → only when the quote is verified, the speaker resolves, and the AI assignee names that same member.
  - Embeddings: one `embedTexts(titles)` under `withTimeout(EMBED_TIMEOUT_MS)`; on failure log and leave embedding and duplicate fields null; else `match_project_tasks(project, vec, DUPLICATE_THRESHOLD)` per item (top hit).
  - Active members and their names: one `project_members` read plus one `lookupProfiles` call per request.
- Write order so a 409 changes nothing: `replace_meeting_proposals` first (maps `proposals_reviewed` to 409), then the existing insights rewrite, then `writeLedgerItems` with the new ids. No follow ups.
- Response unchanged plus `proposalCount`.

Also in `GET /api/meetings/[id]`: switch on the W3 placeholder, Viewers get action items filtered by `review_state = 'confirmed'`.

## 4. Proposal routes, Build plan item 3 (W4c, AC-35 to AC-37, AC-42 data)

- `GET /api/projects/[id]/proposals`: owner, admin, developer (`NEED_ROLES.content`), Viewer 403, non member 404. `proposed` items of the project's meetings, meeting `started_at` desc then `quote_line`, at most `PROPOSALS_LIMIT`, joined `meetingTitle`, `meetingDate`, `duplicate { key, title, score }`; `proposedAssigneeId` nulled when not an active member; `embedding` never selected. Returns `{ proposals, canReview }`.
- `POST /api/proposals/[id]/review`: zod body per the contract; loads the item and its meeting's `project_id` (no project or non member → 404, not owner or admin → 403). Confirm validates title 1 to 200 (422), `dueDate` `YYYY-MM-DD` or null (422); title edited → one `embedTexts` call (failure leaves null). Calls `review_proposal`; maps `already_decided` and `task_closed` to 409, `quote_unverified` and `assignee_not_member` to 422 with the spec's messages.

## 5. Task routes, Build plan item 4 (W4c, AC-37 to AC-40)

- `GET /api/projects/[id]/tasks` (member): filters `status`, `assigneeId` (`none`), `q`; per status at most `BOARD_COLUMN_LIMIT` ordered `position, number`, and a `count` per status for `truncated`; select by role from `project-select.ts`; adds `key`.
- `POST /api/projects/[id]/tasks` (`content`): `{ title, description?, assigneeId?, dueDate? }`; assignee must be active (422); one embed call (failure leaves null); `create_project_task`.
- `GET /api/tasks/[id]` (member): task, events (Viewer redacted), PR links (empty list until W5), proof chain (source meeting id and title, quote for non Viewers).
- `PATCH /api/tasks/[id]`: new SQL function `update_task(p_task, p_actor, p_actor_role, p_patch jsonb, p_if_version)` keeps the version check, the assignee active check, the completion rules, and the per field events in one transaction (raise `stale`, `assignee_not_member`, `forbidden`, `evidence_required`). The route checks the role matrix first (Developer: own or unassigned, may assign an unassigned task only to self; reopen from completed Owner or Admin only), validates `completionEvidence` 1 to 2000, then calls it. 200 and 409 both return the full task (role filtered). When a reorder leaves a gap under `1e-6`, the route calls `renumber_task_column` after the update and returns the renumbered task. (`update_task` goes into the same migration as section 1; I add it to the spec's *W4 SQL additions* list as a build note so the spec stays the contract.)

## 6. UI, Build plan item 5 (W4d, AC-41, AC-42)

- `npm install @hello-pangea/dnd`.
- `ProjectDetailView.tsx`: tab bar becomes Members, Tasks, Proposals (Proposals hidden for Viewers), same tab styling as today, selection in the URL `?tab=`.
- `src/components/projects/TasksBoard.tsx`: five columns, `DragDropContext`/`Droppable`/`Draggable` (keyboard drag via space and arrows comes with the library), optimistic move, PATCH with `ifVersion`; 409 → revert and refetch with a toast; drop into Completed opens `CompleteTaskDialog` (evidence textarea, 1 to 2000), cancel reverts. Refetch on window focus and every `BOARD_REFETCH_MS`. "Showing 200 of N" under a capped column. Search box and assignee filter. "New task" button for Developer or higher (`NewTaskDialog`). Loads guarded by `useLoadingTimeout` plus `LoadError`.
- `TaskCard.tsx`: key, title, assignee name, due date, quote chip (tooltip with the quote, line, speaker; not shown to Viewers since the field is absent).
- `ProposalsPanel.tsx`: one list, meeting title and date, quote with line and speaker or "No matching transcript line", suggested assignee, "Looks like NM-12" with Merge; Owner or Admin get inline edit of title, assignee (member select), due date, and Confirm, Reject, Merge buttons (an unverified one asks "Confirm without a transcript line?" first); Developer sees it read only. Refetch on focus; 409 → toast and refetch.
- Dialogs reuse the existing dialog pattern in `InviteDialog.tsx`; client fetchers go into `src/lib/project-client.ts`.
- No `context/designs/*.png` covers these screens, so I reuse the current project page cards, badges, and buttons with tokens from `context/ui-tokens.md`.

## 7. Move a meeting in, Build plan item 6 (W4e, AC-24, AC-25)

- `POST /api/meetings/[id]/project` (`[id]` is the meeting uuid): body `{ projectId }`; meeting creator only; `requireProjectRole(..., NEED_ROLES.content)` on the target first; already in a project → 409 "Meetings can't leave a project"; calls `move_meeting_to_project`, maps `not_movable` (in project already) and `minutes_review` (409 "Finish or cancel the minutes review first").
- Button "Move to project" on the meeting detail Overview for the creator of a personal meeting: a small dialog with the project select (projects where role is developer or higher), confirm text says the follow ups become proposals; on success refetch the meeting.
- Ticks W3's milestone W3e in `docs/scope/scope.md`.

## 8. Tests

- Unit: `tasks.ts`, `with-timeout.ts`, `proposals.ts` pieces (quote one hit vs two, cut to 500; name matcher rules; speaker resolution order; assignee only with a verified own track quote), `project-select.ts` redaction.
- Routes (mock style of `process/route.test.ts`):
  - process: project meeting writes proposals through the RPC with no follow ups; Developer 403 and no AI call; 409 fast check; 409 from the RPC after the AI call leaves insights untouched; embed failure still saves; personal path unchanged (existing tests stay green).
  - proposals GET (Viewer 403, nulled assignee); review (409 already decided, 422 title, 422 unverified without the flag, 422 assignee, 409 task closed, confirm calls embed only when the title changed).
  - tasks GET (Viewer select has no quote, truncated counts, key query), POST (422 assignee), PATCH (Developer other's task 403, assign other 403, reopen by Developer 403, evidence 422, 409 stale returns the task).
  - move route (non creator 404, Viewer 403, 409 cases).
  - component: `TasksBoard` 409 revert and the Completed dialog cancel; `ProposalsPanel` read only for Developer.
- The SQL race cases (two confirms, confirm during reprocess, two creates) run live against Supabase in the test steps below, since vitest mocks the database.
- Then `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`.

## 9. After the build

- Update `context/progress-tracker.md`, `context/ui-registry.md` (`TasksBoard`, `TaskCard`, `ProposalsPanel`, `CompleteTaskDialog`, `NewTaskDialog`, `MoveToProjectDialog`, new tabs), `context/build-plan.md`, the spec Build plan ticks, scope row 22 milestones W4a to W4e, and W3e on row 21. Feature stays `in-progress` for `/check verify` and `/test` (GA tier).
- Append the verify steps to `docs/specs/0004-conversations-to-code/verify.md` if you want them saved.

## Test steps for you (after the build)

1. Upload a transcript into a project meeting as Owner: the Action Items appear as proposals in the project's Proposals tab, no follow ups exist, each shows its line or "No matching transcript line".
2. Confirm one: it shows as `NM-1` in To do. Reprocess the meeting: 409 "Proposals were already reviewed".
3. Create task "Fix the login bug", then reprocess a fresh meeting that says "fix login bug": the proposal shows "Looks like NM-2"; Merge it, the task gains a `proposal_merged` event.
4. As a Developer, drag your own task to In progress (works), someone else's (snaps back with a toast); drop into Completed, cancel (back), then add evidence (completed).
5. Open the board in two tabs, move the same card in both: the second gets the conflict toast and refreshes.
6. As a Viewer, open the Tasks tab: cards have no quote chip, the Proposals tab is absent, `GET /api/projects/[id]/proposals` returns 403.
7. Move a personal meeting with open and completed follow ups into a project: proposals and one completed task appear, follow ups are gone, reprocess returns 409.
8. A personal meeting still processes into follow ups exactly as before.
