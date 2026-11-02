# W4. Review gate, keyed tasks, and the board

Child of [0004. Conversations to Code](index.md). Uses the W4 SQL block (`action_items` review columns, `tasks`, `task_events`, `create_project_task`, `match_project_tasks`, the full `remove_project_member`).

## Summary

On a project meeting, the AI's action items become proposals, not follow ups. Each proposal shows the exact transcript line it came from, checked by code, not trusted from the AI. It only suggests an assignee when the person who said the words is the person who will do the work, and it warns you when a similar open task already exists. An Owner or Admin confirms, edits, rejects, or merges each one. A confirmed proposal becomes a task with a key like `NM-42` on a Kanban board, where Developers move their own and unassigned tasks.

## Requirements

- **AC-30**: `/api/ai/process` on a project meeting writes action items with `review_state = 'proposed'` and creates no `follow_ups`; on a personal meeting it behaves exactly as today (`auto` plus follow ups).
- **AC-31**: For each proposal, the server locates its quotes in the stored transcript with the existing `findQuoteLines`; a quote counts only when it matches exactly one line, and the first such quote sets `quote`, `quote_line`, `quote_speaker`, and `quote_verified = true`; when none matches exactly one line, `quote_verified = false`, the quote fields stay null, and the assignee stays null.
- **AC-32**: `proposed_assignee_id` is set only when the quote is verified and its speaker label resolves to exactly one active project member (own track rule) and the AI's assignee names that same person; in every other case it stays null.
- **AC-33**: Each proposal title is embedded (one batch call to the existing `gemini-embedding-001`, 768 dimensions); the vector is stored in `action_items.embedding` and copied into the task on confirm (no second embed call); `match_project_tasks` at similarity 0.85 or higher sets `duplicate_of_task_id` and `duplicate_score` to the closest open task. An embedding failure is logged and leaves all three null; the proposal still saves.
- **AC-34**: Reprocessing a project meeting returns 409 "Proposals were already reviewed" once any of its proposals is `confirmed`, `rejected`, or merged, and changes nothing; before any review it replaces the `proposed` items. This keeps every task's `source_action_item_id` and every `ledger_items.action_item_id` valid.
- **AC-35**: `POST /api/proposals/[id]/review` (Owner or Admin) with `confirm` creates a task through `create_project_task` with the edited title, assignee, and due date and the quote snapshot, sets `review_state = 'confirmed'`; a proposal with `quote_verified = false` can be confirmed only with `confirmWithoutQuote: true`, else 422. Deciding twice returns 409.
- **AC-36**: `reject` sets `rejected`; `merge` with `mergeIntoTaskId` (an open task in the same project) sets `rejected` and `merged_into_task_id`, writes a `proposal_merged` task event on that task carrying the quote, and creates no task. Looking up the task for an item checks `tasks.source_action_item_id`, then `action_items.merged_into_task_id`.
- **AC-37**: Developers see proposals read only; Viewers get 403 on the proposals route.
- **AC-38**: `POST /api/projects/[id]/tasks` (Developer or higher) creates a task with the next key; the assignee, when given, must be an active member (422). Two concurrent creates get different keys.
- **AC-39**: `PATCH /api/tasks/[id]` enforces the matrix (Developer: own or unassigned only, may assign an unassigned task only to self), requires `ifVersion` and applies the change in one `update ... where id = $id and version = $ifVersion` that also bumps `version` (no row hit: 409 with the current task); a new assignee is checked as an active member inside that same SQL (else 422), writes one `task_events` row per changed field, and refuses moving to `completed` without `completionEvidence` (422).
- **AC-40**: Moving a `completed` task out of `completed` is Owner or Admin only and clears the completion fields.
- **AC-41**: The board shows five columns (To do, In progress, In review, Completed, Blocked) with drag and drop (`@hello-pangea/dnd`), keyboard moves included; dropping a card into Completed opens a dialog asking for the evidence (a link or a note) before the PATCH, and cancel puts the card back; a 409 on drop puts the card back and refetches; the board refetches on window focus and every 30 seconds.
- **AC-42**: Each task card shows key, title, assignee, due date, and a quote chip when it has a quote; the proposals panel shows quote, line, speaker, "No matching transcript line" when unverified, and "Looks like NM-12" with a Merge button when a duplicate was found.

## Design

### Speaker to member (own track rule)

The speaker label comes from the transcript line (`speakerLabel`). It resolves to a user id in this order, stopping at the first that gives exactly one active member: a `minutes_speaker_claims` row for the meeting and label; `attendance_events` rows for the meeting whose `participant_name` equals the label (case insensitive), whose `user_id` is not null, and whose user is an active member. Speaker claims are reached through the meeting's `minutes_reviews` row (claims are keyed by `review_id`) and compared on the normalized lowercase label. Generated transcripts (Phase F) label lines with the Stream display name, so the second rule covers them; uploaded transcripts often resolve to nothing, which is the safe default. The AI's `assignee` string must then match that member's Clerk full name or first name (case insensitive).

### Position

Drop computes `position` as the midpoint of the neighbours' positions (top: first minus 1, bottom: last plus 1). When a gap falls under `1e-6`, the server renumbers that column 1, 2, 3 in one update.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Proposal | quote, line, speaker | `findQuoteLines(transcripts.raw_text, quote)` over the model's `quotes`; exactly one match counts |
| Proposal | assignee suggestion | own track rule above |
| Proposal | duplicate | `match_project_tasks(project, embedding, 0.85)` |
| Confirm | key | `create_project_task` |
| Confirm | promise link | `ledger_items.action_item_id = proposal id` already exists from 0001; the task reaches it through `tasks.source_action_item_id` |
| Confirmed task | embedding | `action_items.embedding`, copied |
| Manual task | embedding | one `embed` call on create; failure leaves null |
| Viewer reads | fields | shared select in `src/lib/project-select.ts`: no quote, line, or completion evidence |
| Board | members for the assignee picker | `GET /api/projects/[id]/members` |

Constants in `src/lib/tasks.ts`: `DUPLICATE_THRESHOLD = 0.85`, `BOARD_REFETCH_MS = 30_000`, `BOARD_COLUMN_LIMIT = 200`.

### Critical test scenarios

- Happy path: process a project meeting with three action items, one verified with own track speaker, confirm it into `NM-1`, verifies **AC-30**, **AC-31**, **AC-32**, **AC-35**.
- Duplicate: a proposal "Fix login bug" next to open task "Fix the login bug" is flagged and merged, verifies **AC-33**, **AC-36**.
- Reprocess: before review, proposed ones are replaced; after one confirm, reprocess returns 409 and nothing changes, verifies **AC-34**.
- Quote: a quote that matches two lines is unverified and gets no assignee, verifies **AC-31**, **AC-32**.
- Concurrency: two creates at once get `NM-1` and `NM-2`; two PATCHes with the same `ifVersion`, the second gets 409, verifies **AC-38**, **AC-39**.
- Auth: Developer moves someone else's task (403), assigns an unassigned task to another person (403), Viewer opens proposals (403), verifies **AC-37**, **AC-39**.

## Build plan

1. W4 SQL block (including `version`, `embedding`, `merged_into_task_id`), replace `remove_project_member` with the full body (keeping `p_actor_role`), satisfies **AC-38**, **AC-39**.
2. Extend `/api/ai/process` for project meetings (proposals, quote location, own track rule, duplicate check, reprocess rule), satisfies **AC-30** to **AC-34**.
3. Proposals list and review routes, satisfies **AC-35** to **AC-37**.
4. Task routes, satisfies **AC-38** to **AC-40**.
5. Install `@hello-pangea/dnd` (check for its skill first), build the board and proposals panel, satisfies **AC-41**, **AC-42**.
6. Ship W3's move route and button now that `tasks` exists, satisfies **AC-24**, **AC-25**.

## Rationale (short)

Extending `action_items` instead of a new proposals table keeps the 0001 ledger link (`ledger_items.action_item_id`) working for free. Code checks the quote, so a hallucinated quote cannot become a task silently. The assignee rule is strict because a wrong assignee is worse than none. An integer `version` gives safe board moves without realtime, and unlike a timestamp it cannot collide or lose precision in JSON.
