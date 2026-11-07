# W5. GitHub App, PR linking, and merge completion

Child of [0004. Conversations to Code](index.md). Uses the W5 SQL block (which now includes the `ledger_links` change) and the configuration list in the umbrella.

Updated 2026-11-05 at the W5 `/architect`: compared with the W4 code and GitHub's docs. New ACs carry letters (AC-43a) so W6 onward keep their numbers. The choices made are listed under *Decisions added at the W5 architect step*, and you may override any of them.

## Summary

The project Owner installs the NeuraMeet GitHub App from a GitHub tab on the project page and links repos to the project. A repo belongs to one project only. When a pull request names a task key like `NM-42` in its title, body, or branch, the task shows that PR and moves along the board. When a PR that says "Closes NM-42" is merged into the repo's default branch, the task completes by itself. The promise behind the task is not marked kept automatically: it gets a "kept" suggestion with the PR as evidence, and the Owner or Admin confirms it, the same way meeting evidence works in the Promise Ledger. A revert reopens the task.

## Requirements

- **AC-43**: `GET /api/projects/[id]/github/repos` returns an `installUrl` and an `authorizeUrl`, each carrying a signed `state` (`{ projectId, userId, exp }`). `installUrl` installs the App on a new account. `authorizeUrl` is for an account where the App is already installed. Both end at the single callback `GET /api/github/callback` (GitHub skips the Setup URL when user authorization is on), which checks `state`, that its `userId` is the signed in user, and that the caller is still the Owner, exchanges `code` for a short lived user token, and lists the caller's own installations with it (`GET /user/installations`). When `installation_id` is present and not in that list, nothing is stored. Otherwise every listed installation is upserted into `github_installations` and gets a fresh row in `github_installation_claims`. The user token is discarded and never stored. When an `installation_id` already exists, `installed_by` keeps its first value.
- **AC-43a**: The callback never shows raw JSON. Every outcome redirects to `/projects/[id]?tab=github&github=<code>` with `connected`, `not_yours`, `requested` (`setup_action=request`, an organization owner must approve first), or `failed`. A missing, expired, or wrongly signed `state` (for example, arriving from GitHub's own settings page) redirects to `/projects?github=expired`, because no project can be trusted. A signed out visitor goes to `/sign-in` with `redirect_url` set back to the callback.
- **AC-44**: `POST /api/github/webhook` reads the raw body, computes HMAC SHA-256 with `GITHUB_WEBHOOK_SECRET`, and compares it to `X-Hub-Signature-256` with `timingSafeEqual` before parsing; a missing or wrong signature returns 401 and stores nothing. A missing secret in the environment is logged and returns 401 too, so it fails closed.
- **AC-45**: A `Content-Length` over 1 MB returns 413 before the body is read, and a body over 1 MB after reading (no header sent) also returns 413. A valid delivery is inserted into `github_deliveries` keyed on `X-GitHub-Delivery`; a duplicate id returns 202 and does nothing more, unless that row is `failed`, or still `received` after 5 minutes, in which case one atomic conditional update reclaims it and only the run that wins processes it again. Processing runs in `after()`, and the route answers 202 within GitHub's 10 second limit.
- **AC-46**: `POST /api/projects/[id]/github/repos` links a `repoId` only when it is in the repo list of an installation the caller may use (AC-47; read with an installation token), else 422; a repo id from anywhere else is never trusted.
- **AC-47**: The Owner may use an installation that has a claim by them no older than 30 days, or one that already has a repo linked to this project (so a new Owner after a transfer still sees it). Deleted or suspended installations do not count. The repo list shows those repos with their link state; linking a repo already linked to another project returns 409; unlinking keeps old `task_links`.
- **AC-48**: A `pull_request` event on a linked repo finds keys with `\b([A-Z]{2,5})-(\d{1,6})\b` in the title and body, and the same pattern ignoring case in the head branch (branches are usually lowercase, like `nm-42-fix`). A key links only when its prefix is this project's `task_prefix` and the task exists, and only the first 20 valid keys of a PR count. One `task_links` row per task and PR, created or updated from any handled payload (so a `closed` event with no earlier `opened` still links), skipped when the stored `pr_updated_at` is strictly newer than the payload's `pull_request.updated_at`, with `closes = true` when a closing word sits directly before the key in the title or body. `pr_title` is cut to 300 characters; the PR body is never stored.
- **AC-48a**: A PR from a fork (`head.repo` is null or its id differs from the base repo) links with `from_fork = true`, moves no task on the board, and never counts as a closing PR that is still open. It can complete a task only once merged, because a merge is a maintainer's act. So on a public repo a stranger cannot move your board or block a completion.
- **AC-48b**: A revert PR (title starts with `Revert "`, or the first line of the body matches `revertTarget`) counts as naming no keys, so it never links a task and never closes one, even though GitHub's title repeats the original "Closes NM-42".
- **AC-48c**: Every processed event refreshes all links of that PR (state, title, URL, base, merge time). A key no longer in the text keeps its link but gets `closes = false`, so a stale closing word can neither complete the task nor block another PR. It does not unlink.
- **AC-48d**: `merged` is final: a link stored as `merged` never goes back to another state, and its `closes` no longer changes. An `edited` event on a merged PR refreshes the title only, and creates no link, so editing "Closes NM-9" into an old PR completes nothing.
- **AC-49**: Status moves (only forward, never out of `blocked` except to complete): a draft PR moves `todo` to `in_progress`; a ready PR moves `todo` or `in_progress` to `in_review`; a PR closed without merge moves `in_review` back to `in_progress` when no other linked PR, apart from fork PRs, is open or draft. A move fires only when the link is new or its state changed, so a `synchronize` or a Sync never undoes a person's move. Moves run in the SQL function `apply_github_move`, which locks the row and bumps `version`, so an open board gets the normal 409. Each move writes a `task_events` row with `actor_id` null and `detail = { source: 'github', taskLinkId }`, and the UI shows "GitHub" for that source.
- **AC-50**: Completion runs in the SQL function `apply_merge_completion(task)`, which locks the task row (`select ... for update`), so two closing PRs processed at the same time cannot both leave it open. It is called for every task with a closing link on the PR being processed, and for tasks that just lost one (that may have been the last one blocking). It completes the task (`completion_kind = 'merge'`, `completion_evidence` = PR URL; `merge_sha` stays on the link) only when all hold: the link is merged and not reverted, its base branch equals the repo's stored default branch (refreshed from the payload first), the link has `closes = true`, its merge is later than the task's latest reopen, and no other `closes = true` link on that task is still `open` or `draft` in a repo that is linked now under a live installation (fork links never block). Otherwise the link updates and the task stays where it is.
- **AC-51**: In the same transaction as that completion, each `ledger_items` row whose `action_item_id` is the task's `source_action_item_id`, or an action item with `merged_into_task_id` = this task, gets a code `ledger_link` (`evidence_kind = 'code'`, `relation = 'kept'`, `state = 'suggested'`, `quote` = PR title, `confidence = 1`) unless one already exists for that item and link. A task someone completed by hand before the merge stays manual but gets the same suggestion. The ledger item status does not change until an Owner or Admin confirms it through the existing review route.
- **AC-52**: A merged PR into the default branch whose body starts with `Reverts <owner>/<repo>#<N>`, where the repo is this repo, sets `reverted_at` on every merged link of PR N; only when a link is the one whose PR URL is the task's `completion_evidence` and `completion_kind` is `merge` does it move the completed task to `in_progress` with a `reopened_by_revert` event. A suggested code ledger link for it is deleted; a confirmed one becomes `rejected` and the item's status is recomputed (`open` unless a meeting link was also confirmed).
- **AC-52a**: `POST /api/ledger/links/[id]/review` returns 409 "This PR was reverted" for `confirm` or `reset` on a code link whose task link has `reverted_at`.
- **AC-53**: `installation` `deleted` sets `deleted_at` and deletes its `github_repos` rows, and `suspend` sets `suspended_at`; both stop processing for its repos. `installation_repositories` `removed` unlinks those repos; `unsuspend` clears `suspended_at`. `task_links` survive all of these.
- **AC-54**: `POST /api/projects/[id]/github/sync` (Owner or Admin) first refreshes `full_name` and `default_branch` from the installation's repo list, then reads each linked repo's 30 most recently updated PRs, then each `open` or `draft` link not already seen, oldest `last_synced_at` first. At most 100 PRs per run, and it stops starting new reads after 45 seconds. Each PR goes through the same rules as a webhook, including PRs never linked and reverts that were missed. It returns counts plus `partial: true` when a limit stopped it, and returns 429 when the last sync of this project was under 60 seconds ago.
- **AC-55**: A new task drawer, opened by clicking a board card, shows the task's PRs (repo, number, title, state, merged or reverted) and "Completed by merge" with the PR link; Viewers see only the state and "Completed by merge", never private repo names, PR titles, or links, because `GET /api/tasks/[id]` uses a viewer column list that leaves those out. Event `detail` holds ids, except `proposal_merged`, which also holds a quote and a title; W6 AC-61a strips those before any Activity row is built.
- **AC-55a**: `GET /api/ledger` returns `evidenceKind` on each link, a nullable `evidenceMeetingId` and `lineNumber`, and for a code link `pr: { repoFullName, prNumber, prUrl, reverted }`. `LedgerTab` shows a code link as "Merged PR · repo #N" with the PR title and a link, never "line null". W6 builds the fuller surfaces on this.
- **AC-56**: A task with `completion_kind = 'merge'` can be reopened by an Owner or Admin by hand (W4 AC-40), and an older merge cannot complete it again (AC-50); GitHub never deletes a task or changes its title or assignee.

## Decisions added at the W5 architect step

Each one is a recommendation. The runner up is what you could pick instead.

| Decision | Why | Runner up |
|---|---|---|
| A second "I already installed it" button, plus a small `github_installation_claims` table | A second Owner on the same organization proves access in one click. It stores no GitHub identity, so W0's "no GitHub account table" stands | Document it as a limit: only the first person who installs can link |
| A claim expires after 30 days | Someone who left the GitHub organization loses the ability to link its repos. Re proving takes one click | No expiry, which is simpler but keeps old access |
| Fork PRs link but cannot move or block | Public repos let strangers open PRs | Ignore forks fully, which loses real outside contributions |
| One GitHub App per environment | An App has one webhook URL, and the install flow lands on the first callback URL. A dev App now, a production App at Deploy | One App, swapping URLs by hand each time |
| Sync also reads recently updated PRs | Finds PRs never linked and missed reverts. GitHub does not retry failed deliveries, and a local tunnel misses events while you are offline | Open links only, which is cheaper but misses those cases |
| GitHub tab for Owners, Sync button on the Tasks tab | The repo route is Owner only by contract, and Admins may sync. W8 folds the tab into Settings | Build the full Settings tab now, which is W8's job |
| A task drawer in W5 | There is no task detail UI today, and W6 already plans its Outcome card there | PR chip on the card only, which W6 would then redo |
| Ledger code link display ships in W5 | W5 writes the first code links, so `LedgerTab` would otherwise show "line null" | Hold code links until W6, which breaks the demo order |

## Design

### GitHub calls without Octokit

`src/lib/github.ts` (server only):

- `appJwt()`: RS256 JWT signed with Node `crypto.createSign("RSA-SHA256")` over `{ iat: now - 60, exp: now + 540, iss: GITHUB_APP_ID }` using `GITHUB_APP_PRIVATE_KEY`.
- `installationToken(installationId)`: `POST /app/installations/{id}/access_tokens` with the JWT; kept in memory for that request only.
- `userToken(code)`: `POST https://github.com/login/oauth/access_token` with client id and secret.
- `userInstallations(token)`: `GET /user/installations`, at most 5 pages of 100.
- `installationRepos(installationId)`: `GET /installation/repositories` with an installation token, at most 5 pages of 100, for AC-46 and the first step of AC-54.
- `recentPulls(fullName, token)`: `GET /repos/{full_name}/pulls?state=all&sort=updated&direction=desc&per_page=30`. `pull(fullName, n, token)`: `GET /repos/{full_name}/pulls/{n}`.
- `verifySignature(rawBody, header)`: HMAC SHA-256 hex, `sha256=` prefix, `timingSafeEqual` on equal length buffers.
- Every fetch sets `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and a 10 second `AbortSignal.timeout`.

The webhook and callback routes run on the Node runtime (they need `crypto`). `after` comes from `next/server`. `src/middleware.ts` needs no change: its protected list has no `/api` entry, so both routes reach their own checks. Do not add them to `isPublicRoute`, because that list redirects signed in users to `/dashboard`.

### Key parsing

`src/lib/github-keys.ts`, pure and unit tested:

- `findKeys(text, { ignoreCase })` returns unique `{ prefix, number }` in order of appearance from `\b([A-Z]{2,5})-(\d{1,6})\b`, with the prefix upper cased. `ignoreCase` is used for the branch only.
- `closingKeys(text)` matches `\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b:?\s+([A-Z]{2,5})-(\d{1,6})\b`, case insensitive on the word only. The branch name never closes (a branch like `fix/NM-4` links but does not close). One closing word covers one key, so "Closes NM-1, NM-2" closes `NM-1` and only links `NM-2`.
- `revertTarget(body)` matches `^Reverts ([\w.-]+\/[\w.-]+)#(\d+)` on the first line.
- `isRevert(title, body)` is true when the title starts with `Revert "` or `revertTarget` matches.

### One rule function

`src/lib/github-rules.ts` holds `applyPrSnapshot(supabase, repo, snapshot, source)`, which the webhook and Sync both call, so they cannot disagree. `syncProject(supabase, projectId)` lives in the same file because W8's cron calls it too (AC-76). A snapshot is built from a webhook payload or a REST PR the same way: `merged` comes from `merged_at` being set in both, which avoids depending on fields that differ between the two shapes.

`applyPrSnapshot`, in order:

1. Load the PR's links by `(repo_id, pr_number)`. Stop if a stored `pr_updated_at` is strictly newer.
2. If `isRevert`: when merged into the default branch and `revertTarget`'s repo equals this repo (ignoring case), call `apply_merge_revert` for each merged link of the target PR. Treat the keys as empty and continue.
3. If this is an `edited` event on a PR whose links are merged, update the title on those links and stop.
4. Work out keys, keep this project's prefix, take the first 20, and look up the tasks by `(project_id, number)`.
5. Upsert the links under AC-48c and AC-48d. Write `pr_linked` for a new link and `pr_state_changed` for a changed state, each with `actor_id` null and `detail = { source: 'github', taskLinkId, state }`.
6. Fire moves under AC-49, skipped for fork links.
7. Call `apply_merge_completion` for the tasks in AC-50. It is safe to repeat, so a redelivery after a crash finishes the job.

### Webhook flow

1. Check `Content-Length` (413 over 1 MB); read `await request.text()`; check the length; verify; 401 on failure.
2. Insert the delivery row; on unique violation run the conditional reclaim (AC-45), and return 202 when it updates no row.
3. Return 202; inside `after()`: `ping` and any other unhandled event get status `ignored`. For `pull_request`, load the repo by `payload.repository.id`; ignore when not linked or the installation is deleted or suspended; refresh `default_branch` and `full_name` from the payload; call `applyPrSnapshot`; set status `processed`, or `failed` with the error text. A failure is logged and never thrown out of `after()`.

Handled `pull_request` actions: `opened`, `edited`, `reopened`, `ready_for_review`, `converted_to_draft`, `synchronize`, `closed`. `installation` `created` is ignored, because the callback writes that row.

### Where the UI lives

- `GitHubTab.tsx`, a new `github` tab in `ProjectDetailView.tsx`, shown to the Owner only: the two buttons, the repo list with link and unlink, and a toast read from `?github=`. Admins see no tab.
- A "Sync GitHub" button on the Tasks tab header for Owner and Admin, showing the counts in a toast.
- `TaskDrawer.tsx`, opened from `TaskCard`: title, status, PR list, recent events. W6 adds the Outcome card here. Its loading state uses `useLoadingTimeout` with `LoadError`.
- `LedgerTab.tsx`: the code link row from AC-55a.
- All of it follows `context/ui-tokens.md`. No design image covers these surfaces, so they follow the existing Tasks tab.

### Notifications

On merge completion and revert reopen, W8 writes `task_completed_by_merge` and `task_reopened_by_revert` to the assignee, and `kept_suggestion` to the Owner and Admins. Until W8 ships, these are skipped (no table yet); the board and ledger still show the change.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Install proof | caller's installations | `GET /user/installations` with the user token from the callback `code` |
| State check | project and caller | `state` = signed `{ projectId, userId, exp }`, HMAC SHA-256 with a key from `crypto.hkdfSync` over `GITHUB_APP_CLIENT_SECRET` (info `install-state`), 10 minute expiry |
| Installation row | account login and type | the `account` object in the `GET /user/installations` response |
| Usable installations | claim or existing link | `github_installation_claims` younger than 30 days, or `github_repos.project_id` |
| Repo link check | allowed repo ids | `GET /installation/repositories` for the caller's usable installations |
| Repo row | `full_name`, `default_branch`, `private` | that same list response, never the request body |
| Event order | PR time | `pull_request.updated_at` against `task_links.pr_updated_at` |
| Webhook | repo, project | `github_repos.repo_id = payload.repository.id` |
| Merge rule | default branch | `github_repos.default_branch`, refreshed from `payload.repository.default_branch` or the Sync repo list |
| Merged | merged or not | `merged_at` being set, in webhook and REST alike |
| Fork check | fork or not | `head.repo.id` against `repository.id`; a null `head.repo` counts as a fork |
| Completion | evidence, sha | `html_url` into `completion_evidence`; `merge_commit_sha` into `task_links.merge_sha`, null when the response has none |
| Reopen cutoff | latest reopen | newest `task_events.created_at` with `from_value = 'completed'` |
| Code ledger link | item | `ledger_items.action_item_id` = `tasks.source_action_item_id`, or an action item with `merged_into_task_id` = the task |
| Sync | PR state | `recentPulls` and `pull` with an installation token |
| Sync cooldown | last sync time | latest `audit_log` row `github.synced` for the project |
| Actor label | "GitHub" | `task_events.detail.source`, since `actor_id` is null |

### Critical test scenarios

- Happy path: a fixture `pull_request.closed` merged into `main` with body "Closes NM-1" completes `NM-1` and adds a suggested code ledger link, verifies **AC-48**, **AC-50**, **AC-51**.
- Failure: merged into `develop` (not completed), merged without a closing word (linked only), two closing PRs with one still open (not completed), verifies **AC-50**.
- Revert: "Reverts owner/repo#7" reopens the task and removes the suggestion; reverting a PR that did not complete the task leaves it completed; a revert merged into `develop` does nothing; the revert's own `Revert "Closes NM-1"` title does not complete the task again, verifies **AC-48b**, **AC-52**.
- Reopen: the Owner reopens a merge completed task, then another link on it changes state, and the task stays open; a new closing PR merged after that completes it, verifies **AC-50**, **AC-56**.
- Stale links: editing "Closes NM-1" out of an open PR lets another PR complete it; an open closing link in a repo that was unlinked no longer blocks; a fork's open closing PR does not block; a fork's PR moves no card, verifies **AC-48a**, **AC-48c**, **AC-50**.
- Merged is final: editing "Closes NM-9" into a merged PR changes nothing; an older `opened` event with the same second after `closed` merged leaves it merged, verifies **AC-48d**.
- Races: two closing PRs merged at once complete the task once; an `edited` event older than the stored one changes nothing; a `closed` event arriving first still links and completes, verifies **AC-48**, **AC-50**.
- Retry: a `failed` delivery redelivered is processed once even when two runs try; a 2 MB body gets 413, verifies **AC-45**.
- Security: bad signature 401, missing secret 401, replayed delivery id changes nothing, someone else's installation id on the callback stores nothing and redirects with `not_yours`, a `state` for another user is refused, a repo id outside your installation 422, a key with another project's prefix ignored, verifies **AC-43** to **AC-46**, **AC-48**.
- Viewer: `GET /api/tasks/[id]` for a Viewer holds no repo name, PR title, URL, or evidence, verifies **AC-55**.
- Sync: a merged PR never seen by a webhook gets linked and completes the task; a second run inside 60 seconds gets 429; a 101st PR is left for the next run with `partial: true`, verifies **AC-54**.
- Ledger: a code link renders without "line null"; confirming one on a reverted PR gets 409, verifies **AC-52a**, **AC-55a**.

## Build plan

Before task 1 you create the dev GitHub App (the prerequisite in the umbrella). Tasks follow the Extend approach: each slice works on the running app before the next.

1. W5 SQL block (`ledger_links` change, tables, `add_code_ledger_links`, `apply_merge_completion`, `apply_github_move`, `apply_merge_revert`), with RLS, grants, and revokes, satisfies **AC-45**, **AC-50**, **AC-51**.
2. `src/lib/github.ts` and `src/lib/github-keys.ts` with unit tests, satisfies **AC-44**, **AC-48**, **AC-48b**, **AC-52**.
3. The callback route plus the repo link routes and `GitHubTab`, satisfies **AC-43**, **AC-43a**, **AC-46**, **AC-47**.
4. `github-rules.ts` and the webhook route with linking, status moves, merge completion, revert, and installation events, satisfies **AC-44**, **AC-45**, **AC-48** to **AC-53**.
5. Sync route and button, `prLinks` on `GET /api/tasks/[id]` with the viewer column list, and `TaskDrawer`, satisfies **AC-54**, **AC-55**, **AC-56**.
6. `/api/ledger` and `LedgerTab` for code links, plus the 409 in the review route, satisfies **AC-52a**, **AC-55a**.

## Consequences

- Good: webhook and Sync share one rule function, and every task change happens under a row lock, so a missed or repeated delivery ends in the same place.
- Good: nothing in event `detail` names a repo or PR, so W6's Activity tab needs no extra redaction for GitHub rows.
- Cost: three SQL functions and one small table more than the first draft, and a dev App plus a production App to keep configured.
- Limit: a re applied change (`Revert "Revert ..."`) does not complete the task again. An Owner completes it by hand or a new closing PR does.
- Limit: a claim only proves access at claim time, so for up to 30 days a person removed from a GitHub organization can still link its repos. Existing links keep working until unlinked.
- Limit: a hand written revert with no `Reverts owner/repo#N` line reopens nothing. An Owner reopens by hand.
- Limit: one PR can touch at most 20 tasks, and Sync reads at most 100 PRs per run.
- Limit: a merged PR with no links, later edited to name a key, can still be linked by Sync, because Sync cannot tell it apart from a merge whose webhook was missed.
- Limit: outgoing code links on the Ledger tab have no Confirm or Reject buttons yet. The review route accepts them; W6 builds the fuller surface. For Viewers, code links hide the PR and the quote; full meeting quote redaction also stays W6.

## Rationale (short)

A GitHub App gives per repo access, a webhook secret, and short lived tokens, all free. Proving the installation with the user's own token stops someone from claiming another person's installation id. Completion needs these rules because a merge into a feature branch, or a PR that only mentions a key, does not mean the work shipped. The promise only gets a suggestion because code merged is not always the promise kept; a person decides. See the W5 section of [rationale.md](rationale.md).
