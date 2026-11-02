# W5. GitHub App, PR linking, and merge completion

Child of [0004. Conversations to Code](index.md). Uses the W5 SQL block, the `ledger_links` change, and the configuration list in the umbrella.

## Summary

The project Owner installs the NeuraMeet GitHub App from the project Settings and links repos to the project. A repo belongs to one project only. When a pull request names a task key like `NM-42` in its title, body, or branch, the task shows that PR and moves along the board. When a PR that says "Closes NM-42" is merged into the repo's default branch, the task completes by itself. The promise behind the task is not marked kept automatically: it gets a "kept" suggestion with the PR as evidence, and the Owner or Admin confirms it, the same way meeting evidence works in the Promise Ledger. A revert reopens the task.

## Requirements

- **AC-43**: `GET /api/projects/[id]/github/repos` returns an `installUrl` carrying a signed `state` (`{ projectId, userId, exp }`). After install GitHub sends you to the single callback `GET /api/github/callback` (GitHub skips the Setup URL when user authorization is on), which checks `state` and that the caller is still the Owner, exchanges `code` for a short lived user token, lists the caller's own installations with it (`GET /user/installations`), and stores the installation only when `installation_id` is in that list (else 403 "This installation is not yours"); the user token is discarded and never stored. When the `installation_id` already exists, `installed_by` keeps its first value.
- **AC-44**: `POST /api/github/webhook` reads the raw body, computes HMAC SHA-256 with `GITHUB_WEBHOOK_SECRET`, and compares it to `X-Hub-Signature-256` with `timingSafeEqual` before parsing; a missing or wrong signature returns 401 and stores nothing.
- **AC-45**: A `Content-Length` over 1 MB returns 413 before the body is read. A valid delivery is inserted into `github_deliveries` keyed on `X-GitHub-Delivery`; a duplicate id returns 202 and does nothing more, unless that row is `failed`, or still `received` after 5 minutes, in which case it is processed again. Processing runs in `after()`, and the route answers 202 within GitHub's 10 second limit.
- **AC-46**: `POST /api/projects/[id]/github/repos` links a `repoId` only when it is in the repo list of an installation the caller may use (read with an installation token), else 422; a repo id from anywhere else is never trusted.
- **AC-47**: The repo list shows repos from installations where `installed_by` is the caller, or that already have a repo linked to this project (so a new Owner after a transfer still sees them); linking a repo already linked to another project returns 409; unlinking keeps old `task_links`.
- **AC-48**: A `pull_request` event on a linked repo finds keys with `\b([A-Z]{2,5})-(\d{1,6})\b` in the title, body, and head branch; a key links only when its prefix is this project's `task_prefix` and the task exists; one `task_links` row per task and PR, created or updated from any handled payload (so a `closed` event with no earlier `opened` still links), skipped when the stored `pr_updated_at` is newer than the payload's `pull_request.updated_at`, with `closes = true` when a closing word sits directly before the key in the title or body.
- **AC-49**: Status moves (only forward, never out of `blocked` except to complete): a draft PR moves `todo` to `in_progress`; a ready PR moves `todo` or `in_progress` to `in_review`; a PR closed without merge moves `in_review` back to `in_progress` when no other linked PR is open. Each move writes a `task_events` row with actor `github` and the PR in `detail`.
- **AC-50**: Completion runs in the SQL function `apply_merge_completion(task)`, which locks the task row (`select ... for update`), so two closing PRs processed at the same time cannot both leave it open. It is called after any closing link changes state, including a closing PR closed without merge (that may be the last one that was blocking). It completes the task (`completion_kind = 'merge'`, `completion_evidence` = PR URL, `merge_sha`) only when all hold: `merged` is true, the base branch equals the repo's default branch from that payload, the link has `closes = true`, and no other `closes = true` link on that task is still `open` or `draft`. Otherwise the link updates and the task stays where it is.
- **AC-51**: On that completion, when `tasks.source_action_item_id` matches a `ledger_items.action_item_id`, the server inserts a code `ledger_link` (`evidence_kind = 'code'`, `relation = 'kept'`, `state = 'suggested'`, `quote` = PR title, `confidence = 1`) unless one already exists for that item and link. The ledger item status does not change until an Owner or Admin confirms it through the existing review route.
- **AC-52**: A merged PR whose body starts with `Reverts <owner>/<repo>#<N>` for a merged link of this repo sets `reverted_at` on that link; only when that link is the one whose PR URL is the task's `completion_evidence` does it move the completed task to `in_progress` with a `reopened_by_revert` event; a suggested code ledger link for it is deleted, a confirmed one becomes `rejected` and its item goes back to `open`.
- **AC-53**: `installation` `deleted` or `suspend` events set `deleted_at` or `suspended_at` and stop processing for its repos; `installation_repositories` `removed` unlinks those repos; `unsuspend` clears `suspended_at`.
- **AC-54**: `POST /api/projects/[id]/github/sync` (Owner or Admin) reads current PR state for links that are `open` or `draft`, at most 100 per run, applies the same rules, returns counts, and returns 429 when the last sync of this project was under 60 seconds ago.
- **AC-55**: A task shows its PRs (repo, number, title, state, merged or reverted) and "Completed by merge" with the PR link; Viewers see only the state and "Completed by merge", never private repo names, PR titles, or links.
- **AC-56**: A task with `completion_kind = 'merge'` can be reopened by an Owner or Admin by hand (W4 AC-40); GitHub never deletes a task or changes its title or assignee.

## Design

### GitHub calls without Octokit

`src/lib/github.ts` (server only):

- `appJwt()`: RS256 JWT signed with Node `crypto.createSign("RSA-SHA256")` over `{ iat: now - 60, exp: now + 540, iss: GITHUB_APP_ID }` using `GITHUB_APP_PRIVATE_KEY`.
- `installationToken(installationId)`: `POST /app/installations/{id}/access_tokens` with the JWT; kept in memory for that request only.
- `userToken(code)`: `POST https://github.com/login/oauth/access_token` with client id and secret.
- `installationRepos(installationId)`: `GET /installation/repositories` with an installation token, for the AC-46 check.
- `verifySignature(rawBody, header)`: HMAC SHA-256 hex, `sha256=` prefix, `timingSafeEqual` on equal length buffers.
- Every fetch sets `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and a 10 second `AbortSignal.timeout`.

### Key parsing

`src/lib/github-keys.ts`, pure and unit tested:

- `findKeys(text)` returns unique `{ prefix, number }` from `\b([A-Z]{2,5})-(\d{1,6})\b`.
- `closingKeys(text)` matches `\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b:?\s+([A-Z]{2,5})-(\d{1,6})\b`, case insensitive on the word only. The branch name never closes (a branch like `fix/NM-4` links but does not close).
- `revertTarget(body)` matches `^Reverts ([\w.-]+\/[\w.-]+)#(\d+)` on the first line.

### Webhook flow

1. Check `Content-Length` (413 over 1 MB); read `await request.text()`; verify; 401 on failure.
2. Insert the delivery row; on unique violation return 202, unless the row is `failed` or `received` for over 5 minutes (then process it again).
3. Return 202; inside `after()`: load the repo by `payload.repository.id`; ignore (status `ignored`) when not linked or the installation is deleted or suspended; refresh `default_branch` from the payload; run the rules; set status `processed`, or `failed` with the error text. A failure is logged and never thrown out of `after()`.

Handled `pull_request` actions: `opened`, `edited`, `reopened`, `ready_for_review`, `converted_to_draft`, `synchronize` (link refresh only), `closed`. An edit that removes a key leaves the old link with its last state; it does not unlink.

### Notifications

On merge completion and revert reopen, W8 writes `task_completed_by_merge` and `task_reopened_by_revert` to the assignee, and `kept_suggestion` to the Owner and Admins. Until W8 ships, these are skipped (no table yet); the board and ledger still show the change.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Install proof | caller's installations | `GET /user/installations` with the user token from setup `code` |
| State check | project and caller | `state` = signed `{ projectId, userId, exp }`, HMAC SHA-256 with a key from `crypto.hkdfSync` over `GITHUB_APP_CLIENT_SECRET` (info `install-state`), 10 minute expiry |
| Repo link check | allowed repo ids | `GET /installation/repositories` for the caller's usable installations |
| Event order | PR time | `pull_request.updated_at` against `task_links.pr_updated_at` |
| Webhook | repo, project | `github_repos.repo_id = payload.repository.id` |
| Merge rule | default branch | `payload.repository.default_branch` (refreshed into `github_repos`) |
| Completion | evidence | `pull_request.html_url`, `merge_commit_sha` |
| Code ledger link | item | `ledger_items.action_item_id = tasks.source_action_item_id` |
| Sync | PR state | `GET /repos/{owner}/{repo}/pulls/{n}` with an installation token |
| Sync cooldown | last sync time | latest `audit_log` row `github.synced` for the project |

### Critical test scenarios

- Happy path: a fixture `pull_request.closed` merged into `main` with body "Closes NM-1" completes `NM-1` and adds a suggested code ledger link, verifies **AC-48**, **AC-50**, **AC-51**.
- Failure: merged into `develop` (not completed), merged without a closing word (linked only), two closing PRs with one still open (not completed), verifies **AC-50**.
- Revert: "Reverts owner/repo#7" reopens the task and removes the suggestion; reverting a PR that did not complete the task leaves it completed, verifies **AC-52**.
- Races: two closing PRs merged at once complete the task once; an `edited` event older than the stored one changes nothing; a `closed` event arriving first still links and completes, verifies **AC-48**, **AC-50**.
- Retry: a `failed` delivery redelivered is processed; a 2 MB body gets 413, verifies **AC-45**.
- Security: bad signature 401, replayed delivery id changes nothing, someone else's installation id on the callback 403, a repo id outside your installation 422, key with another project's prefix ignored, verifies **AC-43** to **AC-46**, **AC-48**.

## Build plan

1. W5 SQL block (including `apply_merge_completion`) and the `ledger_links` change, with RLS, grants, and revokes, satisfies **AC-45**, **AC-51**.
2. `src/lib/github.ts` and `src/lib/github-keys.ts` with unit tests (check for a GitHub Apps or webhooks skill first), satisfies **AC-44**, **AC-48**, **AC-52**.
3. The callback route plus the repo link routes and Settings UI, satisfies **AC-43**, **AC-46**, **AC-47**.
4. Webhook route with linking, status moves, merge completion, code ledger link, revert, and installation events, satisfies **AC-44**, **AC-45**, **AC-48** to **AC-53**.
5. Sync route and the PR list on the task view, satisfies **AC-54** to **AC-56**.

## Rationale (short)

A GitHub App gives per repo access, a webhook secret, and short lived tokens, all free. Proving the installation with the user's own token stops someone from claiming another person's installation id. Completion needs four rules because a merge into a feature branch, or a PR that only mentions a key, does not mean the work shipped. The promise only gets a suggestion because code merged is not always the promise kept; a person decides.
