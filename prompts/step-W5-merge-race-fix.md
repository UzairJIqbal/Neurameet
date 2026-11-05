# Step W5 fix: a lost link insert must still apply its PR state

Spec: `docs/specs/0004-conversations-to-code/0004-github.md`, AC-48 and AC-50, plus its race test "a `closed` event arriving first still links and completes". Found in the W5 live run on 2026-11-05.

Rules in force: strict TypeScript, no `any`, small functions, no changes outside this task. No Stream code, no SQL change, no new route, no new dependency.

## The bug

PR #9 on the test repo was opened and merged 3 seconds apart. The two deliveries ran in parallel:

1. Both runs loaded the PR's links and found none.
2. The `opened` run inserted the link with state `open`.
3. The `closed` run's upsert (`ignoreDuplicates: true`) returned no row, so `insertLink` returned null and `writeLinks` skipped it (`src/lib/github-rules.ts`, `insertLink` and the `if (!change) continue;` line).

The merged state was thrown away. The delivery ended `processed`, the link stayed `open`, the task stayed In review, no `pr_state_changed` event was written, and nothing was logged. Resending can't help because the delivery is already claimed. Only Sync recovers it.

The comment in `insertLink` ("that run writes the event and the move") is wrong: that run only knows its own, older state.

This can hit any two fast events on a brand new link, not only a merge: `opened` then `closed`, or a draft then `ready_for_review`. Cold starts on Vercel make it more likely.

Status of the diagnosis: seen once live, worked out from the code, the database rows, and the timing. Reproduced on demand during the build: with a local proxy sending each PR's real `opened` and `closed` deliveries together, the old code lost the merge on 2 of 3 PRs.

## The fix, in `src/lib/github-rules.ts`

When the insert loses, reload the PR's links, find the row for this task, and treat it as an existing link, through the same code an existing link already uses.

1. Move the merged or open choice out of the first loop in `writeLinks` into one small helper, `refreshLink(supabase, repo, pr, link, closes)`, which calls `refreshMergedLink` or `refreshOpenLink`, writes the event when the state changed, and returns the change. The first loop calls it, with no change in behavior.
2. In the second loop, when `insertLink` returns null:
   - call `loadLinks` again and find the row with `task_id === target.taskId`
   - no row (for example the repo was just unlinked): `continue`, as today
   - otherwise push the result of `refreshLink(supabase, repo, pr, row, target.closes)`
3. Replace the comment in `insertLink` so it says the caller applies this snapshot to the winner's row.

### Why this is safe in each order

| Winner's row | This run | Result |
|---|---|---|
| `open`, older | merged | `refreshOpenLink` applies it (this is the bug fixed). `pr_state_changed` is written, and `completeTasks` completes the task |
| `open`, older | closed without merge | Applies; the card moves back to In progress under the existing rule |
| `merged`, newer | opened, arriving late | `refreshMergedLink` changes nothing, no event, and the card doesn't move. `completeTasks` may run again, which is already safe to repeat |
| `open`, newer | opened, arriving late | The `lte("pr_updated_at", …)` condition stops the write, and the state stays as it was |
| Same state and time | Same snapshot (webhook and Sync together) | The write repeats harmlessly, with no event and no move |

`previousState` is the stored state rather than null, so a lost insert is not counted in `linked` and writes no second `pr_linked` event.

### Known limit, not fixed here

The two runs write events on their own, so `pr_state_changed` can land a moment before `pr_linked` in `task_events`. The final state is still right. W6's Activity timeline should sort with this in mind; the fix needs nothing for it now.

## Tests, in `src/lib/github-rules.test.ts`

Replace "leaves a link alone when a parallel run inserted it first" (line 236), since it locks in the bug. Each new test queues the first load as empty, the task lookup, an upsert returning no row, then the reload:

1. Merged snapshot, reload returns `link({ state: "open" })`: the link update carries `state: "merged"`, one `pr_state_changed` event and no `pr_linked`, `apply_merge_completion` called with `t1`, `linked` is 0.
2. Closed without merge, reload returns an open link: `apply_github_move` goes from `in_review` to `in_progress`.
3. Opened snapshot, reload returns `link({ state: "merged" })`: no state written, no event, no move.
4. Older snapshot where the conditional update returns no row: no event, state unchanged.
5. Reload finds no row for the task: no update, no event, no throw.

## Checks

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`.

## After the build

- Tick the W5 merge race fix line in `docs/scope/scope.md`, and update the W5 entry in `context/progress-tracker.md`. No `ui-registry.md` change, because there is no UI.
- Ask before committing and pushing to `main`.

## Test steps

The race depends on timing, so a single pass doesn't prove much on its own. The run below repeats it to give the race a fair chance.

1. Start the dev server and the relay.
2. On `neurameet-w5-test`, create 5 tasks in `NM_Test` and open a PR for each with "Closes NMT-n" in the body, merging into `main` straight after opening, with no pause.
3. Without pressing Sync, check each one: the task is Done, the link is `merged`, and the task's events hold `pr_linked` and `pr_state_changed`.
4. Check `task_links` shows no duplicate row for any PR.
5. Press Sync once and confirm it reports `completed: 0`.

Pass: all 5 finish correctly with no Sync. Press Sync only at the end.
