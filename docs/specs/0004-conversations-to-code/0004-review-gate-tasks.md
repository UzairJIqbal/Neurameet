# W4. Review gate, keyed tasks, and the board

Child of [0004. Conversations to Code](index.md). Uses the W4 SQL block (`action_items` review columns, `tasks`, `task_events`, `create_project_task`, `match_project_tasks`, the full `remove_project_member`).

## Summary

On a project meeting, the AI's action items become proposals, not follow ups. Each proposal shows the exact transcript line it came from, checked by code, not trusted from the AI. It only suggests an assignee when the person who said the words is the person who will do the work, and it warns you when a similar open task already exists. An Owner or Admin confirms, edits, rejects, or merges each one. A confirmed proposal becomes a task with a key like `NM-42` on a Kanban board, where Developers move their own and unassigned tasks.

## Requirements

- **AC-30**: `/api/ai/process` on a project meeting writes action items with `review_state = 'proposed'` and creates no `follow_ups`; on a personal meeting it behaves exactly as today (`auto` plus follow ups, `meetings.user_id` owner check). On a project meeting only Owner or Admin may run it: a non member gets 404, a Developer or Viewer gets 403, and the role check runs before any AI call. At most 50 action items are kept per run (the first 50 in model order).
- **AC-31**: For each proposal, the server locates its quotes in the stored transcript with the existing `findQuoteLines`; the search runs over the full `transcripts.raw_text` (not the truncated prompt input), so line numbers match the transcript view. A quote counts only when it matches exactly one line, and the first such quote in the model's array order sets `quote` (the model's quote string, trimmed, at most 500 characters), `quote_line` and `quote_speaker` (from the match), and `quote_verified = true`; when none matches exactly one line, `quote_verified = false`, the quote fields stay null, and the assignee stays null.
- **AC-32**: `proposed_assignee_id` is set only when the quote is verified and its speaker label resolves to exactly one active project member (own track rule) and the AI's assignee names that same person (name rule in *Speaker to member*); in every other case it stays null.
- **AC-33**: Each proposal title is embedded (one batch call to the existing `gemini-embedding-001`, 768 dimensions); the call is wrapped in a 10 second timeout. The vector is stored in `action_items.embedding` and copied into the task on confirm when the title is unchanged; an edited title gets one new `embedTexts` call on confirm (failure leaves the task embedding null); `match_project_tasks` at similarity 0.85 or higher sets `duplicate_of_task_id` and `duplicate_score` to the closest open task. An embedding failure is logged and leaves all three null; the proposal still saves.
- **AC-34**: Reprocessing a project meeting returns 409 "Proposals were already reviewed" once any of its action items is `confirmed` or `rejected` (merged counts as rejected) or is the `source_action_item_id` of a task, and changes nothing. The route checks this before the AI call (fast fail) and again inside `replace_meeting_proposals`, which locks the meeting row, so a confirm that lands during the AI call wins and the reprocess returns 409. Before any review it deletes only the meeting's `proposed` items and their `ledger_items` rows and writes the new ones; `writeLedgerItems` links ledger rows to the new ids. Proposal ids change, so the Proposals tab refetches. This keeps every task's `source_action_item_id` and every `ledger_items.action_item_id` valid.
- **AC-35**: `POST /api/proposals/[id]/review` (Owner or Admin) runs every decision through one SQL function, `review_proposal`, that takes the meeting row lock and flips the item with `update action_items set review_state = ... where id = $id and review_state = 'proposed'`; no row hit returns 409 "Already decided" (so a double click or two reviewers never make two tasks). `confirm` then creates the task inside the same function (same body as `create_project_task`) with the edited title (1 to 200 characters, else 422), due date (`YYYY-MM-DD` or null), and assignee, plus the quote snapshot. Assignee: when the `assigneeId` key is present its value is used (null means Unassigned); when absent, `proposed_assignee_id` is used. Either way it must be an active member, checked inside the function, else 422 "Assignee is no longer a member". A proposal with `quote_verified = false` can be confirmed only with `confirmWithoutQuote: true`, else 422.
- **AC-36**: `reject` sets `rejected`; `merge` with `mergeIntoTaskId` locks that task (`select ... for update`) inside `review_proposal` and requires it to be in the same project and not `completed` (else 409 "That task is closed"); it sets `rejected` and `merged_into_task_id`, writes a `proposal_merged` task event on that task carrying the quote in `detail.quote`, does not bump the task's `version`, and creates no task. Looking up the task for an item checks `tasks.source_action_item_id`, then `action_items.merged_into_task_id`.
- **AC-37**: Developers see proposals read only; Viewers get 403 on the proposals route. Every task read a Viewer makes (board, `GET /api/tasks/[id]`) omits `quote`, `quote_speaker`, `quote_line`, `completion_evidence`, and `detail.quote` on `proposal_merged` events. `embedding` is never returned to anyone.
- **AC-38**: `POST /api/projects/[id]/tasks` (Developer or higher) creates a task with the next key; the assignee, when given, must be an active member (422). Two concurrent creates get different keys. `GET /api/projects/[id]/tasks` returns `{ tasks, truncated }`: tasks ordered by `status, position, number`, at most `BOARD_COLUMN_LIMIT` (200) per status, and `truncated` maps each capped status to its total so the column shows "Showing 200 of N". `q` matches a case insensitive part of the title, or an exact key (`NM-12` or `12`). `status` and `assigneeId` filter (`assigneeId=none` for Unassigned). `cursor` stays in the contract but W4 ignores it (the per column cap replaces paging).
- **AC-39**: `PATCH /api/tasks/[id]` enforces the matrix (Developer: own or unassigned only, may assign an unassigned task only to self), requires `ifVersion` and applies the change in one `update ... where id = $id and version = $ifVersion` that also bumps `version` (no row hit: 409 with the current task); a new assignee is checked as an active member inside that same SQL (else 422), writes one `task_events` row per changed field (a reorder inside the same column writes none), and refuses moving to `completed` without `completionEvidence` (1 to 2000 characters, else 422). Moving to `completed` sets `completion_kind = 'manual'`, `completed_at`, and `completed_by` in that same update (the table's check constraints need it). 200 and 409 both return the full task. A non member gets 404, a member without the right gets 403.
- **AC-40**: Moving a `completed` task out of `completed` is Owner or Admin only and clears the completion fields in the same update.
- **AC-41**: The board lives in a new **Tasks** tab of `ProjectDetailView` (beside Members), visible to every member. It shows five columns (To do, In progress, In review, Completed, Blocked) with drag and drop (`@hello-pangea/dnd`), keyboard moves included; dropping a card into Completed opens a dialog asking for the evidence (a link or a note) before the PATCH, and cancel puts the card back; a 409 on drop puts the card back and refetches; the board refetches on window focus and every 30 seconds.
- **AC-42**: Each task card shows key, title, assignee, due date, and a quote chip when it has a quote. Proposals live in a new **Proposals** tab of `ProjectDetailView`, one queue across all the project's meetings (newest meeting first), shown to Owner, Admin, and Developer (read only for Developer) and not rendered for Viewers. `GET /api/projects/[id]/proposals` returns only `proposed` items, ordered by meeting date newest first, then `quote_line`, at most 200, with `meetingTitle`, `meetingDate`, and `duplicate: { key, title, score }` joined on the server (key from `projects.task_prefix`); a suggested assignee who is no longer an active member is returned as null. The tab refetches on window focus. Each proposal shows its meeting title and quote, line, speaker, "No matching transcript line" when unverified, and "Looks like NM-12" with a Merge button when a duplicate was found.

## Design

### Decisions settled 2026-11-03 (W4 architect pass)

- **Unverified proposals are kept, flagged, never dropped.** A proposal whose quote matches no single transcript line is saved with `quote_verified = false`, no assignee, and the "No matching transcript line" label. It becomes a task only when an Owner or Admin confirms it with `confirmWithoutQuote: true` (AC-35). Why: dropping it silently loses real tasks when the AI misquotes, while the review gate already stops a hallucinated item from becoming a task on its own. Runner up: drop it (stricter, but the loss is invisible). Scope row 22's "Done when" now reads "flagged" to match.
- **The duplicate check compares against open tasks only**, not pending proposals (AC-33 unchanged). Once one proposal is confirmed, later ones are flagged against its task. Runner up: also match pending proposals, which needs a second match function and a merge into proposal case for little gain.
- **Placement**: Tasks and Proposals are tabs on the existing project page, so W8 can move them into the workspace shell without rework. Runner up: separate routes, which W8 would restructure anyway.

### Speaker to member (own track rule)

The speaker label comes from the transcript line (`speakerLabel`). It resolves to a user id in this order, stopping at the first that gives exactly one active member: a `minutes_speaker_claims` row for the meeting and label; `attendance_events` rows for the meeting whose `participant_name` equals the label (case insensitive), whose `user_id` is not null, and whose user is an active member. Speaker claims are reached through the meeting's `minutes_reviews` row (claims are keyed by `review_id`) and compared on the normalized lowercase label. Generated transcripts (Phase F) label lines with the Stream display name, so the second rule covers them; uploaded transcripts often resolve to nothing, which is the safe default. The AI's `assignee` string must then name that member. The server builds one name map per request from a single batched Clerk lookup of active members. A match is an exact case insensitive full name, or a first name that only one active member has. `null`, empty, "me", "I", "unassigned", or more than one matching member means no match.

### Position

Drop computes `position` as the midpoint of the neighbours' positions (top: first minus 1, bottom: last plus 1). When a gap falls under `1e-6`, the server calls `renumber_task_column(project, status)`, which locks that column's rows and sets them 1, 2, 3 in one update. Renumbering does not bump `version` and writes no events, so it never turns another person's drag into a 409.

### W4 SQL additions (append to the umbrella W4 block at build time)

- `replace_meeting_proposals(p_meeting, p_items jsonb, p_actor)`: `select ... for update` on the meeting row; raise `proposals_reviewed` (route maps to 409) if any action item of the meeting is `confirmed` or `rejected` or is some task's `source_action_item_id`; delete the meeting's `proposed` items (their `ledger_items` go with them through the route's ledger rewrite); insert the new rows; return their ids in input order.
- `review_proposal(p_item, p_decision, p_title, p_assignee, p_assignee_given boolean, p_due, p_merge_task, p_embedding, p_actor, p_confirm_without_quote boolean)`: locks the item's meeting row, flips `review_state` with the `where review_state = 'proposed'` guard, then confirms (task insert with the same key counter as `create_project_task`, active member check on the assignee), rejects, or merges (locks the target task). Returns the task (confirm, merge) or the item (reject). Named exceptions map to 409 or 422 in the route.
- `renumber_task_column(p_project uuid, p_status text)`: as in *Position*.
- `review_proposal`, `replace_meeting_proposals`, and `renumber_task_column` are revoked from public, anon, and authenticated and granted to `service_role`, like `remove_project_member`.

### Tasks created by the move route (AC-25)

`move_meeting_to_project` sets `review_state = 'confirmed'` on every action item that became a task and fills that task's `source_action_item_id`, so AC-34 treats the meeting as reviewed and a reprocess can never delete them. The mover is the task's `created_by` and the event's `actor_id`.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Proposal | quote, line, speaker | `findQuoteLines(transcripts.raw_text, quote)` over the model's `quotes`; exactly one match counts |
| Proposal | assignee suggestion | own track rule above |
| Proposal | duplicate | `match_project_tasks(project, embedding, 0.85)` |
| Confirm | key | `create_project_task` |
| Confirm | promise link | `ledger_items.action_item_id = proposal id` already exists from 0001; the task reaches it through `tasks.source_action_item_id` |
| Confirmed task | embedding | `action_items.embedding`, copied when the title is unchanged; else one `embedTexts` call |
| Confirm | assignee | `assigneeId` when the key is present (null allowed), else `proposed_assignee_id`; active member check in `review_proposal` |
| Proposal | AI assignee to member | one batched Clerk lookup of active members per request; name rule in *Speaker to member* |
| Proposals tab | meeting title, date, duplicate key | joined on the server: `meetings.title`, `meetings.started_at`, `projects.task_prefix || '-' || tasks.number` |
| Board | truncated counts | `count(*)` per status in the same request |
| Manual task | embedding | one `embed` call on create; failure leaves null |
| Viewer reads | fields | shared select in `src/lib/project-select.ts`: no `quote`, `quote_speaker`, `quote_line`, `completion_evidence`, or event `detail.quote`; `embedding` never selected for anyone |
| Board | members for the assignee picker | `GET /api/projects/[id]/members` |

Constants in `src/lib/tasks.ts`: `DUPLICATE_THRESHOLD = 0.85`, `BOARD_REFETCH_MS = 30_000`, `BOARD_COLUMN_LIMIT = 200`, `PROPOSALS_LIMIT = 200`, `MAX_PROPOSALS_PER_MEETING = 50`, `QUOTE_MAX_CHARS = 500`, `EVIDENCE_MAX_CHARS = 2000`, `EMBED_TIMEOUT_MS = 10_000`.

### Critical test scenarios

- Happy path: process a project meeting with three action items, one verified with own track speaker, confirm it into `NM-1`, verifies **AC-30**, **AC-31**, **AC-32**, **AC-35**.
- Duplicate: a proposal "Fix login bug" next to open task "Fix the login bug" is flagged and merged, verifies **AC-33**, **AC-36**.
- Reprocess: before review, proposed ones are replaced; after one confirm, reprocess returns 409 and nothing changes, verifies **AC-34**.
- Quote: a quote that matches two lines is unverified and gets no assignee, verifies **AC-31**, **AC-32**.
- Concurrency: two creates at once get `NM-1` and `NM-2`; two PATCHes with the same `ifVersion`, the second gets 409, verifies **AC-38**, **AC-39**.
- Race: confirm a proposal while a reprocess is mid AI call; the reprocess returns 409 and the task keeps its `source_action_item_id`; two confirms at once give one task and one 409, verifies **AC-34**, **AC-35**.
- Merge into a task that was completed after the page loaded returns 409, verifies **AC-36**.
- Viewer reads a task with a merged quote and sees no quote anywhere in the response, verifies **AC-37**.
- Move in: a reprocess after a move returns 409 and the moved tasks survive, verifies **AC-25**, **AC-34**.
- Auth: Developer moves someone else's task (403), assigns an unassigned task to another person (403), Viewer opens proposals (403), verifies **AC-37**, **AC-39**.

## Build plan

1. W4 SQL block (including `version`, `embedding`, `merged_into_task_id`) plus the *W4 SQL additions* (`replace_meeting_proposals`, `review_proposal`, `renumber_task_column`), replace `remove_project_member` with the full body (keeping `p_actor_role`), satisfies **AC-34** to **AC-36**, **AC-38**, **AC-39**.
2. Extend `/api/ai/process` for project meetings (proposals, quote location, own track rule, duplicate check, reprocess rule), satisfies **AC-30** to **AC-34**.
3. Proposals list and review routes, satisfies **AC-35** to **AC-37**.
4. Task routes, satisfies **AC-38** to **AC-40**.
5. Install `@hello-pangea/dnd` (check for its skill first), add the Tasks and Proposals tabs to `ProjectDetailView`, build the board and proposals panel, satisfies **AC-41**, **AC-42**.
6. Ship W3's move route and button now that `tasks` exists, satisfies **AC-24**, **AC-25**.

Build status (2026-11-03): items 2 to 6 built and tested (943 tests pass, tsc and build clean). Item 1 is written in `supabase/schema.sql` and waits to be applied live as migration `w4_review_gate_tasks`.

### Build note (2026-11-03)

Where the build differs from the text above:

- `replace_meeting_proposals` also deletes the meeting's legacy `auto` action items, so a moved meeting does not keep stale follow up style rows next to its proposals.
- `update_task` takes no role argument. The route enforces the role matrix in code (`src/lib/task-rules.ts`, `patchDenial`) before it calls the function.
- Request bodies are validated by hand, matching the other routes; no zod.
- A Developer may unassign themselves from their own task (take or drop), not only take an unassigned one.
- The project page reads `?tab=` with `useSearchParams`, so it sits inside a `Suspense` boundary.
- Component tests mock `@hello-pangea/dnd` and call `onDragEnd` directly; real drag is covered by the manual run.

## Rationale (short)

Extending `action_items` instead of a new proposals table keeps the 0001 ledger link (`ledger_items.action_item_id`) working for free. Code checks the quote, so a hallucinated quote cannot become a task silently. The assignee rule is strict because a wrong assignee is worse than none. An integer `version` gives safe board moves without realtime, and unlike a timestamp it cannot collide or lose precision in JSON.
