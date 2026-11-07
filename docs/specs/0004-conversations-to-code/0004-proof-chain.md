# W6. Proof Chain surfaces: Decisions and Promises, Outcome card, Activity

Child of [0004. Conversations to Code](index.md). Creates the `project_activity` view and adds `ledger_links.decided_by`. The other `ledger_links` columns it reads (`evidence_kind`, `evidence_task_link_id`) shipped with W5.

Updated 2026-11-07 at the W6 `/architect`: compared with the W4 and W5 code. New ACs carry letters (AC-57a) so W7 onward keep their numbers. The choices made are listed under *Decisions added at the W6 architect step*, and you may override any of them.

## Summary

This step shows the chain you built in W4 and W5. A project gets a Decisions and Promises tab that lists every ledger item from its meetings with its status, its proof, and the task that carries it. Every task and every promise gets an Outcome card that reads left to right: the quote someone said, the task it became, the PR that shipped it, and whether the promise was confirmed kept. An Activity tab shows what happened in the project, newest first.

## Requirements

- **AC-57**: `GET /api/projects/[id]/ledger` (member) returns the ledger items of the project's meetings with status (open, kept, reversed, overdue by the PKT day), quote, speaker, meeting title and date, the linked task key, each link with its kind, and an `outcome`; 50 at a time, newest first by `ledger_items.created_at` (not the meeting date). Add this route to the API Contracts list with the W6 slice.
- **AC-57a**: The `kind` and `status` filters run in SQL, so a page is never short because of filtering. Overdue means `status = 'open' and due_date < today`. Open means `status = 'open' and (due_date is null or due_date >= today)`. Kept and reversed match the column. The overdue rule applies to any item with a due date, decisions too. Today comes from the server, in `Asia/Karachi` (`MINUTES_TZ`). Valid values: `kind` is `promise` or `decision`, `status` is `open`, `overdue`, `kept`, or `reversed`. Leaving a param out means all. Any other value returns 422.
- **AC-57b**: Paging uses a cursor made of the timestamp plus a stable id, on both this route and Activity, so rows that share a timestamp are never skipped or repeated. A cursor that fails its strict format check returns 422 and never reaches a query filter. See *Paging* for how a page and its next cursor are built.
- **AC-57c**: An item's task is the task whose `source_action_item_id` equals the item's `action_item_id`, or the task named by that action item's `merged_into_task_id`. The direct match wins when both exist. `source_action_item_id` is unique, so there is never more than one direct match. Deleting a task sets both columns to null, so that item then has no task. Decisions have no action item, so they have no task.
- **AC-58**: The Decisions and Promises tab lists those items with filters (kind, status) and a "Needs your review" group for suggested links that Owner and Admin can confirm or reject through the existing `POST /api/ledger/links/[id]/review`.
- **AC-58a**: The "Needs your review" group comes from its own query, unaffected by filters and paging: suggested links on the project's meetings, newest first, up to 50, with an exact total. When there are more than 50, the group says "Showing 50 of N, review these to see the rest", and the refetch after each review brings the next ones in. A meeting link counts only when its evidence meeting is in the same project (see AC-62b). Only Owner and Admin receive it. A Developer sees "Waiting for review" on the item, with no group and no buttons. A Viewer sees the same words, with no link details.
- **AC-58b**: On a project meeting, the meeting's Ledger tab opens for every project member, and the match check and the confirm, reject, and reset controls appear only when `canManage` is true. A code link row gains Confirm and Reject. Personal meetings stay creator only, exactly as today. The reversal badge uses the reversal count from `GET /api/ledger`, under the same rule. `canManage` is true only for Owner and Admin, and false for Developer and Viewer.
- **AC-59**: Confirming a code link sets the item `kept` exactly as a meeting link does today; rejecting leaves it `open`; `reset` works the same.
- **AC-59a**: The review route writes the caller's id to `ledger_links.decided_by` on confirm and reject, and clears it on reset, in the same update as `state` and `decided_at`, never in a second statement. The route works out the project from link to item to meeting to project and checks the role there, and never trusts a project id from the client.
- **AC-60**: The Outcome card shows four steps (Said, Task, Shipped, Kept), on the task drawer and under each item on the project tab and on a project meeting's Ledger tab. A missing step shows muted text, never a fake value. Personal meetings show no card. One helper builds every card (`src/lib/proof-chain.ts`), and the card is read only.
- **AC-60a**: Each step uses the exact state and wording in *Outcome card states* below.
- **AC-60b**: Shipped is the same test `apply_merge_completion` uses, so the card and the task never disagree: `state = 'merged'`, `closes`, `reverted_at is null`, and `base_ref` equals the linked repo's default branch. A link whose repo was unlinked has no default branch, so it does not qualify. After an unlink, only `completion_kind = 'merge'` can show Shipped as merged, as *Shipped order* says.
- **AC-60c**: Kept reads `ledger_items.status`, the one authority, and adds "Waiting for review" when an open item has a suggested link. The card never works it out again from link rows alone.
- **AC-61**: `GET /api/projects/[id]/activity?before=` (member) returns 50 rows from `project_activity` older than `before`, newest first, with actor names from Clerk, plus `nextBefore`; the tab loads more on scroll.
- **AC-61a**: `project_activity` gains `row_id`, uses `decided_by` as the actor on confirmed ledger rows, adds `member.restored` to the allowlist, and drops quote, evidence, proposal title, and invite ref keys from `detail`. New indexes cover `task_events (project_id, created_at desc)` and confirmed `ledger_links (decided_at desc)`. The `meetings` and `audit_log` branches already have theirs.
- **AC-61b**: The route builds every row from a per kind allowlist for all roles and never returns raw `detail`. Names and task keys come from batched lookups. An unknown kind renders as "Something changed".
- **AC-62**: Viewers get the tab, the cards, and Activity with redaction applied in the shared column lists, so the hidden columns are never read for a Viewer on tasks, task detail, `/api/ledger`, and the project ledger: quotes, speakers, and transcript lines show as "Hidden for viewers", and PR titles, repo names, numbers, and links are removed. `project_activity` shows only allowlisted audit actions, so invite and join request rows (emails) never appear.
- **AC-62a**: `/api/ledger` applies the Viewer column lists to items, outgoing links, incoming links, and `liveOnly`, which today still carry quotes. The `quote`, `speaker`, and `lineNumber` types become nullable, and `LedgerTab` shows "Hidden for viewers" for a null quote.
- **AC-62b**: On a project meeting, a meeting link's quote is returned only when its evidence meeting is in the same project, on the project ledger, the "Needs your review" group, and `/api/ledger` (outgoing and incoming). This stops a quote from a personal meeting or another project reaching this project's members. Links that fail the check are never deleted, and a confirmed one still counts toward the item's status. When a personal meeting moves in through `POST /api/meetings/[id]/project`, its older links stay as they are, and a confirmed one with outside evidence shows "Evidence outside this project" with no quote and no meeting link. A suggested one stays out of the group.

## Decisions added at the W6 architect step

Each one is a recommendation. The runner up is what you could pick instead.

| Decision | Why | Runner up |
|---|---|---|
| Page with a cursor of timestamp plus id | W5 batches write rows with the same `created_at`, so a timestamp alone skips or repeats rows | Offset paging, which drifts as new rows arrive |
| Build the cursor filter in one shared helper, with no database function | Viewer column lists keep working, and only one place handles the strict check | A Postgres function per route |
| Add `ledger_links.decided_by` | Activity can name who confirmed a promise, which is the point of a proof trail | Show no name on ledger rows, no schema change |
| Open the meeting Ledger tab to every project member | The route already allows them, and the Outcome card needs a home there | Keep it creator only, so members use the project tab alone |
| Shipped uses the merge completion test | A PR into a side branch must never show as shipped | Any merged link, as the first draft said, which can lie |
| Kept reads the item status | One authority, already maintained by `ledger_recompute_item_status` | Read link state, as the first draft said, which can disagree |
| Hide the speaker from Viewers | `TASK_SELECT_VIEWER` already hides it, so all screens agree | Show the speaker, since Viewers see the assignee |
| Allowlist Activity rows for every role, and strip keys in the view too | One function to test, and a missed field cannot leak, so `redactForViewer` in `project-redact.ts` is no longer needed | Raw `detail` with a Viewer only cleaner |
| Repo rows in Activity say "linked a repository", with no name, for every role | Audit rows hold only a repo id, and no extra lookup is needed | Look the name up for non Viewers |
| Live quote cards and minutes stay outside AC-62 | The owner raises a card on purpose in a call the Viewer is in, and minutes reach only recorded attendees. Blocking them changes shipped Live Ledger behaviour | Hide them now, and accept a Live Ledger retest |
| A Viewer keeps the statement and assignee | Speaker and quote are hidden, while the statement is an AI paraphrase and the assignee is already on the board. This is a small, accepted leak of who said what | Hide the statement too, which leaves the tab with nothing to read |
| Keep the confirmed ledger rows and `decided_by` in Activity | Naming who confirmed a promise is the point of the proof trail | Drop that branch and the column, which is simpler but loses the name |
| Live Ledger check in needs no build | `GET /api/ledger/live/checkin` and `match_ledger_candidates` already filter by project, which satisfies that line in scope row 24 | None |

## Design

### Where each surface lives

| Surface | Place |
|---|---|
| Decisions and Promises tab | `/projects/[id]?tab=promises`, all roles |
| Outcome card | task drawer on the board, under each item on the project tab, and under each item on a project meeting's Ledger tab |
| Activity | `/projects/[id]?tab=activity`, all roles |

There is no W6 image in `context/designs/`, so use the existing tokens and the `STATUS_BADGE` styles from `LedgerTab.tsx`. Success and warning tokens arrive at W8. Every empty state tells you what to do next. No per developer counts or rankings appear anywhere.

### Project ledger response

```ts
{
  items: Array<LedgerItem & {
    derivedStatus: "open" | "kept" | "reversed" | "overdue";
    meeting: { id: string; title: string; startedAt: string };
    links: Array<{ id: string; evidenceKind: "meeting" | "code"; relation: string; state: string }>;
    outcome: Outcome;
  }>;
  nextCursor: string | null;
  canReview: boolean;
  needsReview: ReviewRow[];   // empty unless canReview
  reviewCount: number;        // 0 unless canReview
}
```

Query `ledger_items` with `meetings!inner(id, title, started_at, project_id)` filtered on the project. A `ReviewRow` holds the link id, kind, relation, quote or PR details, confidence, and its item's statement and meeting. After a review, refetch the first page and the group.

### Paging

The cursor is `<timestamp>|<id>`, with the raw database timestamp string. Never pass it through a JS `Date`, which would cut microseconds and cause repeats. One helper in `src/lib/project-select.ts` validates the cursor with a strict pattern and builds the filter:

```
project ledger:  ^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|\+00:00)\|[0-9a-f-]{36}$
Activity:        ^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|\+00:00)\|(te|mt|ll|au):[0-9a-f-]{36}$
<col>.lt."<ts>",and(<col>.eq."<ts>",<id>.lt.<id value>)
```

Sort by the timestamp descending, then the id descending. Activity uses `(occurred_at, row_id)` through `?before=`. The project ledger uses `(created_at, id)` through `?cursor=`. Changing a filter clears the cursor and aborts the request in flight. Every id in these cursors is a uuid. The client always URL encodes the cursor, because `+` would otherwise arrive as a space. To build a page, fetch 51 rows and return 50. The next cursor comes from the 50th row, and it is null when 50 or fewer came back. An empty page returns an empty list and a null cursor, with status 200.

### Outcome card states

```ts
type Outcome = {
  said: { state: "quoted" | "hidden" | "no_quote" | "typed"; meetingId?: string; meetingTitle?: string; quote?: string; speaker?: string; lineNumber?: number };
  task: { state: "linked" | "waiting" | "rejected" | "none" | "decision"; taskId?: string; key?: string; status?: string };
  shipped: { state: "merged" | "reverted" | "manual" | "none" | "not_applicable"; repoFullName?: string; prNumber?: number; prUrl?: string };
  kept: { state: "kept" | "partial" | "reversed" | "review" | "none" | "no_promise"; keptCount?: number; total?: number };
};
```

| Step | State | What you see |
|---|---|---|
| Said | `quoted` | Quote, speaker, line, and a link to the meeting |
| Said | `hidden` | "Hidden for viewers", with the meeting title and link |
| Said | `no_quote` | "Confirmed without a quote" (the quote is null, see *Said rules*) |
| Said | `typed` | "Typed by hand, no quote" (task card only, see *Said rules*) |
| Task | `linked` | Task key and status, which open the drawer |
| Task | `waiting` | "Waiting in proposals" |
| Task | `rejected` | "Proposal rejected" |
| Task | `none` | "No task yet". A Viewer gets this for `waiting` and `rejected` too |
| Task | `decision` | "No task, this is a decision" |
| Shipped | `merged` | Repo, PR number, and link. A Viewer sees "Merged" only |
| Shipped | `reverted` | "Reverted" |
| Shipped | `manual` | "Completed by hand, no PR" |
| Shipped | `none` | "Not yet" |
| Shipped | `not_applicable` | "Not needed" (a decision) |
| Kept | `kept` | "Kept" |
| Kept | `partial` | "1 of 2 kept" (task card only) |
| Kept | `reversed` | "Reversed" |
| Kept | `review` | "Waiting for review" |
| Kept | `none` | "Not yet" |
| Kept | `no_promise` | "No promise linked" (task card only) |

**Shipped order.** Merged if `completion_kind = 'merge'` or a qualifying link exists (AC-60b). Otherwise reverted if a link would qualify except for `reverted_at`. Otherwise manual if `completion_kind = 'manual'`. Otherwise none. For the details, prefer the link whose `pr_url` equals `completion_evidence` when `completion_kind = 'merge'`, because this survives a repo unlink, then the latest `merged_at`. A person's reopen after a merge leaves Shipped as merged, because the PR did merge, while Task shows the reopened status.

**Kept on a task card.** One task can carry several items after a proposal merge, and they may come from different meetings. Any reversed gives `reversed`, all kept gives `kept`, any suggested link gives `review`, some kept gives `partial`, no items gives `no_promise`, otherwise `none`. `total` counts every item on the task, and `partial` never includes a reversed item, because any reversed already gives `reversed`. An item card uses only its own item.

**Said rules.** No flag is stored for `confirmWithoutQuote`, so the state comes from the quote itself. An item card reads `ledger_items.quote`: a value gives `quoted`, null gives `no_quote`. A task card reads `tasks.quote`: a value gives `quoted`. Null with a `source_action_item_id` gives `no_quote`. Null with no source falls back to the earliest merged item by `created_at`, and gives `typed` if there is none. When other items were merged in, the step adds "+N more". Said never reads a link's `quote`, because a code link keeps the PR title there. A Viewer gets `hidden` wherever a quote would show.

**Task rules.** `action_items.review_state` holds `auto`, `proposed`, `confirmed`, or `rejected`. There is no merged value: a merge writes `rejected` and sets `merged_into_task_id`. So look for the task first (AC-57c), and a found task always gives `linked`, even when the state says `rejected`. With no task, `proposed` gives `waiting`, `rejected` gives `rejected`, and `auto` or `confirmed` gives `none`. A decision gives `decision`. A promise with no action item gives `none`.

**Queries.** `src/lib/proof-chain.ts` exports `outcomesForItems(supabase, items, role)` and `outcomeForTask(supabase, task, role)`, both batched, on top of four pure step functions you can test alone. It always reads `task_id, state, closes, base_ref, repo_id, merged_at, reverted_at` to run the test, and adds `repo_full_name, pr_number, pr_url` only when the role is not Viewer. `GET /api/tasks/[id]` adds `outcome` beside `proofChain`, and `/api/ledger` adds it on project meetings only.

### Redaction

The column lists in `src/lib/project-select.ts` leave hidden fields out of the query for a Viewer. Add `LEDGER_ITEM_SELECT_VIEWER` and `LEDGER_LINK_SELECT_VIEWER`. A code link's `quote` column holds the PR title (`add_code_ledger_links`), so the Viewer link list must omit `quote` for every kind. A Viewer keeps statement, assignee, due date, status, meeting title, and date. The browser never receives the hidden fields, so hiding is not a CSS trick. One shared test helper walks a whole Viewer JSON response and fails on any forbidden key, so a missed column list cannot pass quietly.

### Code links in the existing Ledger code

A code `ledger_link` has no evidence meeting and no line. W5 already branches on `evidence_kind` in `/api/ledger`, its types, and `LedgerTab.tsx`. W6 adds the missing Confirm and Reject on `CodeLinkRow`, and shows those buttons only when `canManage` is true.

### Activity rows

```ts
{
  rows: Array<{
    id: string; kind: string; occurredAt: string; actorName: string | null;
    subjectType: string; subjectId: string;
    taskKey?: string; taskTitle?: string; itemStatement?: string; meetingTitle?: string;
    memberName?: string; field?: string; from?: string | null; to?: string | null;
  }>;
  nextBefore: string | null;
}
```

The allowlist below is the full list. A `task.` kind matches `TaskEventKind` in `src/lib/task-types.ts`. The route returns only the fields shown, for every role.

| Kind | Sentence | Fields beyond actor and time |
|---|---|---|
| `task.created` | created WTD-1 | task key, title |
| `task.edited` | changed the title, description, or due date on WTD-1 | task key, `field`, plus `from` and `to` for title and due date (never for description) |
| `task.status_changed` | moved WTD-1 from To do to In review | task key, `from`, `to` |
| `task.assigned` | assigned WTD-1 to a person | task key, `from` and `to` as names |
| `task.unassigned` | unassigned WTD-1 | task key, `from` as a name |
| `task.completed_manual` | completed WTD-1 by hand | task key |
| `task.completed_by_merge` | WTD-1 completed by a merged PR | task key |
| `task.reopened_by_revert` | WTD-1 reopened, its PR was reverted | task key |
| `task.pr_linked` | a PR was linked to WTD-1 | task key |
| `task.pr_state_changed` | a PR on WTD-1 is now merged | task key, `to` from `detail.state` |
| `task.proposal_merged` | a promise was merged into WTD-1 | task key |
| `meeting.created` | added a meeting | meeting title |
| `meeting.moved` | moved a meeting into the project | meeting title |
| `ledger.kept_confirmed`, `ledger.reversed_confirmed` | confirmed a promise as kept or reversed | item statement |
| `project.created` | created the project | none |
| `project.ownership_transferred` | transferred ownership to a person | member name |
| `member.joined`, `member.left`, `member.restored` | joined, left, or was restored | member name |
| `member.removed` | removed a person | member name |
| `member.role_changed` | changed a person's role | member name, `to` as the role |
| `repo.linked`, `repo.unlinked` | linked or unlinked a repository | none |

`field` shows as a plain label (title, description, due date), not a column name. Status shows in the same words as the board. PR rows never carry a PR number, repo, or title, for any role.

Rows are independent sentences, so a `pr_state_changed` landing just before its `pr_linked` (W5's known limit) reads fine. Rejected and reset decisions stay out by design, and `task.reopened_by_revert` covers a revert. The sentinel at the end of the list uses an `IntersectionObserver`. The first load uses `useLoadingTimeout` and `LoadError`. A failed later page shows a "Load more" button to retry.

The SQL is in the W6 section of [index.md](index.md), the one place that holds the schema.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Overdue, project ledger | today | server, `Intl.DateTimeFormat("en-CA", { timeZone: MINUTES_TZ })`, new `pktToday()`. `MINUTES_TZ` is a constant in `src/lib/minutes-types.ts`, not an env var, so Vercel needs no setting |
| Overdue, meeting Ledger tab | today | browser, the `?today=` the route already requires |
| Task for an item | key, status | AC-57c |
| Waiting or rejected | proposal state | `action_items.review_state`, by *Task rules* |
| Said on a task or item | quote | `tasks.quote` or `ledger_items.quote`, by *Said rules* |
| Shipped | PR | `task_links`, by AC-60b and *Shipped order* |
| Default branch | branch | `github_repos.default_branch` joined on `repo_id` |
| Kept | state | `ledger_items.status`, plus suggested rows in `ledger_links` |
| `canReview`, `canManage` | role | `requireProjectRole` and `NEED_ROLES.manage`, `GET /api/meetings/[id]` |
| Confirmer | id | `userId` from Clerk in the review route |
| Activity actor | name | `lookupProfiles(...).name`, never the email. `detail.source = 'github'` shows "GitHub". A null actor shows "Someone". An id with no Clerk match shows "Unknown member" |
| Activity member target | name | `target_id` through `lookupProfiles`, on member rows and ownership transfer |
| Activity from and to, assignee rows | name | `from_value` and `to_value` are user ids, resolved with `lookupProfiles`, same fallback as the actor |
| Activity task key, title | key, title | `tasks`, batched by `subject_id` |
| Activity item statement | text | `ledger_items`, batched by `subject_id` |
| `row_id` | id | branch prefix plus the row id, in the view |

### Proposed contract lines for `/sync`

```
GET  /api/projects/[id]/ledger     → (extended) items carry outcome; adds nextCursor, canReview, needsReview, reviewCount; a bad cursor is 422
GET  /api/projects/[id]/activity   → (extended) ?before= is a timestamp|id cursor; rows are allowlisted for every role; adds nextBefore
GET  /api/tasks/[id]               → (extended) adds outcome
GET  /api/ledger                   → (extended) adds outcome on project meetings; a Viewer's items and links omit quote, speaker, and line
POST /api/ledger/links/[id]/review → (extended) records decided_by
```

At the same `/sync`, reconcile the review route: one line still says owner only, and a later line says owner or admin on a project meeting. Also add `canManage` being false for Developer and Viewer.

### Critical test scenarios

- Happy path: after W5's merge, the tab shows the item with a suggested code link; the Owner confirms; the item is kept and the Outcome card has all four steps, verifies **AC-57**, **AC-58**, **AC-59**, **AC-60**.
- Reject and reset: rejecting leaves the item open, reset returns it to the group and clears `decided_by`, verifies **AC-59**, **AC-59a**.
- Failure: a reverted PR shows Shipped "Reverted" and Kept back to "Not yet", verifies **AC-60a**, **AC-60c**.
- Side branch: a merged closing PR into a non default branch leaves Shipped "Not yet", verifies **AC-60b**.
- Unlink: after a repo unlink, a task completed by merge still shows its PR, verifies **AC-60a**.
- Merged proposal: a promise merged into an existing task shows that task, and a task with two items shows "1 of 2 kept", verifies **AC-57c**, **AC-60a**.
- Decision: a decision shows "No task, this is a decision" and "Not needed", verifies **AC-57c**, **AC-60a**.
- Filters: 60 items with 3 overdue return those 3 under the overdue filter, and an item due today is open, verifies **AC-57a**.
- Auth: a Viewer response from all four routes contains no quote, speaker, line, PR title, repo name, or PR link (asserted on the JSON, and on the columns requested), a Developer cannot confirm a link (403) and gets an empty `needsReview`, verifies **AC-58a**, **AC-62**, **AC-62a**.
- Ledger tab: an Admin who did not create a project meeting sees the tab and its controls, a Viewer sees the tab with no controls, a personal meeting stays creator only, verifies **AC-58b**.
- Outside evidence: a suggested link whose evidence meeting is personal or in another project never reaches the group, and a confirmed one shows no quote, verifies **AC-62b**.
- Cross project: an Owner of project A gets 403 reviewing a link in project B, verifies **AC-59a**.
- Mapping: a merged proposal (`rejected` with `merged_into_task_id`) shows Task as `linked`, not `rejected`, verifies **AC-60a**.
- Paging: 120 activity rows load in three pages with no gap or repeat, including 60 rows sharing one timestamp, verifies **AC-57b**, **AC-61**.
- Bad input: a cursor holding `),or(` returns 422, and an unknown `kind` or `status` returns 422, verifies **AC-57a**, **AC-57b**.
- Activity detail: a `proposal_merged` row returns no quote or title, and a `member.joined` row returns no ref or email, verifies **AC-61a**, **AC-61b**.
- Viewer walk: the shared helper finds no forbidden key anywhere in a Viewer response from any of the four routes, verifies **AC-62**.
- Demo: one promise from a real Urdu English meeting traced in the UI from quote to reviewed task to merged PR to kept, verifies the scope row's done line.

## Build plan

1. Schema: add `decided_by`, the `task_events` index, and `project_activity`, satisfies **AC-61a**. Then the cursor helper, `pktToday()`, and the project ledger route with its tab and filters, satisfies **AC-57**, **AC-57a**, **AC-57b**, **AC-57c**, **AC-58**.
2. "Needs your review" group, wired to the review route, which now records `decided_by`, satisfies **AC-58a**, **AC-59**, **AC-59a**.
3. `proof-chain.ts` with tests, `outcome` on the three routes, and the Outcome card on the project tab and the task drawer, satisfies **AC-60**, **AC-60a**, **AC-60b**, **AC-60c**.
4. Viewer column lists on `/api/ledger`, nullable types through `LedgerTab` and other consumers, the Ledger tab opened to project members, code link buttons, and the card on that tab, satisfies **AC-58b**, **AC-62**, **AC-62a**, **AC-62b**.
5. Activity route with its allowlist, and the Activity tab with scroll loading, satisfies **AC-61**, **AC-61b**. Correct W5's AC-55 in [0004-github.md](0004-github.md) in this step: it says event `detail` holds only ids, while `proposal_merged` also holds a quote and a title, which AC-61a now strips.
6. Viewer JSON tests across all four routes, the demo run, then run `/imprint`, satisfies **AC-62** and the done line.

## Consequences

- Each ledger page does extra batched reads for tasks, proposals, PR links, and repos. Two or three queries per page is fine on the free tier, and there is no extra AI call.
- `ledger_links` changes shape, so apply the SQL before you deploy the review route.
- Nullable quote types ripple into `LedgerTab` and any other code that reads `LedgerItem`, which is more edits than the feature suggests.
- Older confirmed rows, and rows the matcher confirms from a live mark (`ledger-match.ts`), have no `decided_by`, so Activity says "Someone" for them.
- A Viewer in a live call still sees a raised quote card. This is a known limit, listed for W9.
- The meeting Ledger tab uses the browser's day for overdue while the project tab uses the PKT day, so the two can differ for a few hours for someone outside Pakistan.
- Opening the Ledger tab widens who sees meeting links on project meetings. The redaction in AC-62a must ship in the same step, and never after it.

## Follow-up

- W9: add the live quote card limit and the Tasdeeq minutes check to the security suite.
- Owed from earlier steps, and worth doing first, since the demo needs them: the W5 second Owner check, the W2 to W4 manual tests, LL5, and the Tasdeeq live run. None of them blocks the code.

## Rationale (short)

The chain already exists in the data after W5; this step mostly reads it. A SQL view for Activity means no second write path to keep in sync. Showing "Not yet" instead of hiding a step makes the card honest: you see exactly which link is missing. Reusing the merge completion test and the item status keeps one answer to "did it ship" and "was it kept", so the card cannot contradict the task.
