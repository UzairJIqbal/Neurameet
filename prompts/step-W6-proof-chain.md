# Step W6: Proof Chain surfaces (Decisions and Promises, Outcome card, Activity)

Spec: `docs/specs/0004-conversations-to-code/0004-proof-chain.md` (child of the umbrella `index.md`, tier GA), accepted on 2026-11-07. This prompt covers the W6 Build plan items 1 to 6 and satisfies AC-57 to AC-62b, including the lettered ACs. The spec is the contract: where this prompt is shorter, the spec wins.

Rules in force: Next.js 15 App Router, strict TypeScript, no `any`, plain JSON errors `{ error }`, every UI load uses `useLoadingTimeout` plus `LoadError`, tokens only (no hex, no raw color classes), react-hot-toast only. No new dependency, no new AI call, no new provider. Work on `main`, no branch, no PR. Ask before commit and push.

No Stream code changes in this step. `node_modules/next/dist/docs/` does not exist in this install. There is no W6 image in `context/designs/`, so the look comes from existing tokens and the `STATUS_BADGE` styles in `LedgerTab.tsx`. Success and warning tokens wait for W8.

## 0. Before code

**You do nothing first.** No new secret, no new service, and no setting on Vercel or GitHub.

**I do these:**

- Read the `context/` files in the order AGENTS.md lists, before the first edit.
- Mark Step W6 in `context/build-plan.md` as in progress. Its line says "meeting Outcome card" and "Live Ledger check in scoped to the project". The spec settles both: the card appears on three surfaces, and the check in needs no build.
- Scope feature 24 is already `in-progress`. I tick only the milestone sub boxes I finish, and leave Verify, Test, Review, and Document alone.
- `src/lib/project-redact.ts` does not exist, so the spec's line about no longer needing it means nothing to delete.

## 1. Schema, cursor, and project ledger, Build plan item 1 (AC-57, AC-57a, AC-57b, AC-57c, AC-58, AC-61a)

**SQL.** Append the umbrella's W6 block to `supabase/schema.sql`, exactly as written: `ledger_links.decided_by`, the indexes `task_events_project` and `ledger_links_confirmed`, the `project_activity` view (`security_invoker`, branches `te`, `mt`, `ll`, `au`, audit allowlist with `member.restored`), `grant select` to `service_role`, and `revoke all` from `anon, authenticated`.

I show you the SQL and apply it to the live NeuraMeet project (`lsjiwxohfpzdvenbxpeu`) only with your OK. The block has no `delete from`, so the MCP can run all of it. Then I confirm the column, both indexes, the view, its grants, and that a `member.joined` row carries no ref or email. The SQL must be live before the new review route runs, because that route writes `decided_by`.

**Helpers in `src/lib/project-select.ts`.**

- A cursor helper with the two strict patterns from *Paging*. A cursor that fails returns 422 and never reaches a filter. It builds `<col>.lt."<ts>",and(<col>.eq."<ts>",<id>.lt.<id value>)`.
- The raw database timestamp is used as is, and never passes through a JS `Date`.
- `pktToday()` uses `Intl.DateTimeFormat("en-CA", { timeZone: MINUTES_TZ })`.

**`GET /api/projects/[id]/ledger`** (member, through `requireProjectRole`).

- Query `ledger_items` with `meetings!inner(id, title, started_at, project_id)` filtered on the project, sorted by `created_at` then `id`, both descending.
- `kind` and `status` run in SQL by the AC-57a rules, and any other value returns 422.
- Fetch 51, return 50. The next cursor comes from the 50th row, and is null when 50 or fewer came back.
- The item's task follows AC-57c, and the direct match wins.

**UI.** New `promises` tab in `ProjectDetailView.tsx` for all roles, `src/components/projects/DecisionsTab.tsx`, with kind and status filters. Changing a filter clears the cursor and aborts the request in flight. The client URL encodes the cursor. Every empty state tells you what to do next.

## 2. Needs your review, Build plan item 2 (AC-58a, AC-59, AC-59a)

- The group comes from its own query, unaffected by filters and paging: suggested links on the project's meetings, newest first, up to 50, with an exact total. A meeting link counts only when its evidence meeting is in the same project.
- Only Owner and Admin receive it. Everyone else gets `needsReview: []`, `reviewCount: 0`, and `canReview: false`. A Developer sees "Waiting for review" on the item. A Viewer sees the same words with no link details.
- Above 50 it says "Showing 50 of N, review these to see the rest". After each review, the first page and the group refetch.
- `POST /api/ledger/links/[id]/review`: `nextState` also returns `decided_by`, which is `userId` on confirm and reject, and null on reset. It goes in the same update as `state` and `decided_at`. The route already walks link to item to meeting and checks the role there, and the reverted PR 409 stays.

## 3. Outcome card, Build plan item 3 (AC-60, AC-60a, AC-60b, AC-60c)

- `src/lib/proof-chain.ts`: `outcomesForItems(supabase, items, role)` and `outcomeForTask(supabase, task, role)`, both batched, on four pure step functions (Said, Task, Shipped, Kept) that follow the *Shipped order*, *Kept on a task card*, *Said rules*, and *Task rules* in the spec.
- It keeps its own read of `task_links`, because `TASK_LINK_SELECT_VIEWER` lacks `closes`, `base_ref`, `repo_id`, and `task_id`. It always reads `task_id, state, closes, base_ref, repo_id, merged_at, reverted_at`, and adds `repo_full_name, pr_number, pr_url` only when the role is not Viewer.
- Shipped uses the same test as `apply_merge_completion`, with `github_repos.default_branch` joined on `repo_id`. Kept reads `ledger_items.status` and adds the review state, and never works it out from link rows alone.
- `src/components/projects/OutcomeCard.tsx`, read only, four steps with the exact wording from the *Outcome card states* table. A missing step shows muted text.
- `outcome` goes on the project ledger, on `GET /api/tasks/[id]` beside `proofChain`, and on `/api/ledger` for project meetings only. The card goes on the project tab and in `TaskDrawer.tsx`'s `DrawerBody`. Personal meetings show no card.

## 4. Redaction and the meeting Ledger tab, Build plan item 4 (AC-58b, AC-62, AC-62a, AC-62b)

This ships as one unit, because opening the tab without the redaction would show quotes to Viewers.

- `LEDGER_ITEM_SELECT_VIEWER` and `LEDGER_LINK_SELECT_VIEWER` in `project-select.ts`. The Viewer link list omits `quote` for every kind, because a code link keeps the PR title there.
- `GET /api/ledger` uses those lists for items, outgoing links, incoming links, and `liveOnly`. Today `toOutgoingLinks` blanks a quote only for code links, and `incoming` and `liveOnly` still carry quotes, so all of them change.
- AC-62b: on a project meeting, a meeting link's quote is returned only when its evidence meeting is in the same project. Otherwise it shows "Evidence outside this project" with no quote and no meeting link. Links that fail the check are never deleted, and a confirmed one still counts toward status.
- `quote`, `speaker`, and `lineNumber` become nullable in `src/lib/meeting-types.ts`. I then check each consumer: `LedgerTab.tsx`, `src/agent/prep.ts`, `src/components/PrepPage.tsx`, `src/lib/ledger-client.ts`, `src/lib/ledger-client.test.ts`, and `src/lib/minutes-seal.ts`. A null quote shows "Hidden for viewers".
- `MeetingTabs.tsx`: the tab opens when `meeting.projectId` is set, or when you created a personal meeting. The reversal badge fetch uses the same rule. `Recording` stays exactly as it is.
- `LedgerTab.tsx` gains a `canManage` prop from `GET /api/meetings/[id]`. Check again and every review button appear only when it is true. `CodeLinkRow` gains Confirm and Reject, plus Undo once a link is decided (AC-58b lists reset among the controls), using the existing `review` function. The Outcome card sits under each item on project meetings.

## 5. Activity, Build plan item 5 (AC-61, AC-61b)

- `GET /api/projects/[id]/activity?before=` (member): 50 rows from `project_activity`, sorted by `occurred_at` then `row_id`, both descending, plus `nextBefore`. A bad cursor returns 422.
- Every row is built from the per kind allowlist in the spec for all roles, and raw `detail` is never returned. An unknown kind renders as "Something changed".
- Names and task keys come from batched lookups. `detail.source = 'github'` shows "GitHub", a null actor shows "Someone", and an id with no Clerk match shows "Unknown member". `lookupProfiles` only covers users Clerk returns, so the route handles missing ids itself. Assignee `from` and `to` are user ids and get the same treatment.
- New `activity` tab for all roles, `src/components/projects/ActivityTab.tsx`. The first load uses `useLoadingTimeout` and `LoadError`. An `IntersectionObserver` sentinel loads more, and a failed later page shows a "Load more" button to retry.
- Correct W5's AC-55 in `0004-github.md`: it says event `detail` holds only ids, while `proposal_merged` also holds a quote and a title, which AC-61a strips.

## 6. Viewer tests and closing, Build plan item 6 (AC-62, done line)

- One shared test helper walks a whole Viewer JSON response and fails on any forbidden key. It runs across all four routes (`/api/projects/[id]/ledger`, `/api/projects/[id]/activity`, `/api/tasks/[id]`, `/api/ledger`). The tests also assert the columns requested, so a hidden column is proven unread and not just removed afterwards.
- Unit tests cover the spec's *Critical test scenarios* that do not need a browser: the four step functions, side branch, unlink, merged proposal, decision, filters, due today, 422 on `),or(`, paging across 60 rows sharing one timestamp, Developer 403, cross project 403, outside evidence, Activity allowlist, and `decided_by` set and cleared.
- Run `npx tsc --noEmit`, lint, `npm run build`, and `npx vitest run`.
- Run `/imprint`. Update `context/progress-tracker.md` and `context/ui-registry.md`.
- AGENTS.md API Contracts: add the five proposed lines from the spec, no path or method changes. Reconcile the review route line, which still says owner only. Add `canManage` being false for Developer and Viewer.
- `docs/scope/scope.md`: tick the finished milestone sub boxes only.

## What this step does not finish

These need you and a live run. The code does not depend on them, but the feature's done line does.

- The demo: one promise from a real Urdu English meeting traced in the UI from quote to reviewed task to merged PR to kept.
- Owed from earlier steps, and worth doing first since the demo needs them: the W5 second Owner check, the W2 to W4 manual tests, LL5, and the Tasdeeq live run.
- Known limits the spec accepts: a Viewer in a live call still sees a raised quote card (listed for W9), older confirmed rows show "Someone" in Activity, and the meeting tab uses the browser's day for overdue while the project tab uses the PKT day.

## Manual test steps (after the build)

You can run these with a project that has a merged PR from the W5 test repo. Use the accounts you already have for each role.

1. As Owner, open `/projects/[id]?tab=promises`. Your items show status, quote, speaker, meeting, and task key. The filters narrow the list, and an item due today reads open.
2. Under "Needs your review", confirm a code link. The item becomes Kept and the card fills all four steps. Press Undo on the meeting's Ledger tab, and it returns to the group.
3. Reject a code link. The item stays open.
4. Sign in as Developer. There is no group and no buttons, and the item says "Waiting for review".
5. Sign in as Viewer, open the tab, the task drawer, the meeting's Ledger tab, and Activity. Each shows "Hidden for viewers" where a quote would be, and no PR title, repo, or link. In the browser's network panel, confirm that those fields are missing from the JSON.
6. Open a project meeting's Ledger tab as an Admin who did not create it. The tab and its controls appear. Open a personal meeting as someone else, and the tab stays hidden.
7. Open `?tab=activity`. Rows read as sentences, newest first, and more load as you scroll. Confirm that your earlier confirmation names you, and that invite rows never appear.
8. Check that a merged PR into a side branch leaves Shipped "Not yet", and that a reverted PR shows "Reverted" with Kept back to "Not yet".
