# W6. Proof Chain surfaces: Decisions and Promises, Outcome card, Activity

Child of [0004. Conversations to Code](index.md). Uses the `project_activity` view and the `ledger_links` change (shipped with W5).

## Summary

This step shows the chain you built in W4 and W5. A project gets a Decisions and Promises tab that lists every ledger item from its meetings with its status, its proof, and the task that carries it. Every task and every promise gets an Outcome card that reads left to right: the quote someone said, the task it became, the PR that shipped it, and whether the promise was confirmed kept. An Activity tab shows what happened in the project, newest first.

## Requirements

- **AC-57**: `GET /api/projects/[id]/ledger` (member) returns the ledger items of the project's meetings with status (open, kept, reversed, overdue by the PKT day), quote, speaker, meeting title and date, the linked task key (through `action_item_id = tasks.source_action_item_id`), and each link with its kind; paginated 50 at a time by `created_at`. Add this route to the API Contracts list with the W6 slice.
- **AC-58**: The Decisions and Promises tab lists those items with filters (kind, status) and a "Needs your review" group for suggested links that Owner and Admin can confirm or reject through the existing `POST /api/ledger/links/[id]/review`, which accepts code links and on a project meeting checks `requireMeetingAccess(..., "manage")`.
- **AC-59**: Confirming a code link sets the item `kept` exactly as a meeting link does today; rejecting leaves it `open`; `reset` works the same.
- **AC-60**: The Outcome card shows four steps (Said, Task, Shipped, Kept), each filled or empty: Said from the task quote (meeting title, speaker, line, link to the meeting); Task from the key and status; Shipped from the merged `task_links` row (repo, PR number, link); Kept from the code or meeting link state. A missing step shows a muted "Not yet", never a fake value.
- **AC-61**: `GET /api/projects/[id]/activity?before=` (member) returns 50 rows from `project_activity` older than `before`, newest first, with actor names from Clerk; the tab loads more on scroll.
- **AC-62**: Viewers get the tab, the cards, and Activity with redaction applied in the shared select (`src/lib/project-select.ts`), so the hidden columns are never read for a Viewer on tasks, task detail, `/api/ledger`, and the project ledger: quotes and transcript lines show as "Hidden for viewers", PR titles, repo names, and links are removed, and an activity row whose detail holds them keeps only its kind and time. `project_activity` shows only allowlisted audit actions, so invite and join request rows (emails) never appear.

## Design

### Where each surface lives

| Surface | Place |
|---|---|
| Decisions and Promises tab | `/projects/[id]?tab=promises` |
| Outcome card | task drawer on the board, and under each ledger item on the meeting's Ledger tab when the meeting is in a project |
| Activity | `/projects/[id]?tab=activity` |

The existing meeting Ledger tab (`LedgerTab.tsx`) keeps its layout and gains the Outcome card for items with a task. Personal meetings show no card.

### Redaction

The column lists in `src/lib/project-select.ts` leave the hidden fields out of the query for a Viewer, and `redactForViewer(row)` in `src/lib/project-redact.ts` cleans activity `detail` JSON. The browser never receives the hidden fields, so hiding is not a CSS trick.

### Code links in the existing Ledger code

A code `ledger_link` has no evidence meeting and no line. `/api/ledger` (`LINK_COLUMNS`), its types in `src/lib/meeting-types.ts`, and `LedgerTab.tsx` branch on `evidence_kind`: a code link shows the PR instead of a quote and line, and never assumes `evidence_meeting_id` is set.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Overdue | today | Asia/Karachi calendar day on the server |
| Task for an item | key, status | `tasks.source_action_item_id = ledger_items.action_item_id` |
| Shipped | PR | `task_links` where `state = 'merged'` and `reverted_at is null`, latest `merged_at` |
| Kept | state | `ledger_links` for the item, confirmed first, else suggested |
| Activity actor | name | Clerk users batched per page; a null actor with `detail.source = 'github'` shows as "GitHub"; unknown shows "Unknown member" |

### Critical test scenarios

- Happy path: after W5's merge, the tab shows the item with a suggested code link; the Owner confirms; the item is kept and the Outcome card has all four steps, verifies **AC-57** to **AC-60**.
- Failure: a reverted PR shows Shipped empty and Kept back to "Not yet", verifies **AC-60**.
- Auth: a Viewer response contains no quote, PR title, or repo name (asserted on the JSON), a Developer cannot confirm a link (403), verifies **AC-58**, **AC-62**.
- Paging: 120 activity rows load in three pages with no gap or repeat, verifies **AC-61**.

## Build plan

1. Project ledger route, code link support in the review route, and code link handling in `/api/ledger`, its types, and `LedgerTab`, satisfies **AC-57**, **AC-58**, **AC-59**.
2. `project_activity` view (`security_invoker`, allowlist, revokes) and the activity route, satisfies **AC-61**, **AC-62**.
3. `project-select.ts` and `redactForViewer` with tests, applied to these routes, satisfies **AC-62**.
4. Decisions and Promises tab, Outcome card (task drawer and Ledger tab), Activity tab, run `/imprint` after, satisfies **AC-58**, **AC-60**, **AC-61**.

## Rationale (short)

The chain already exists in the data after W5; this step only reads it. A SQL view for Activity means no second write path to keep in sync. Showing "Not yet" instead of hiding a step makes the card honest: you see exactly which link is missing.
