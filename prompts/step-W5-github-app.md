# Step W5: GitHub App, PR linking, and merge completion

Spec: `docs/specs/0004-conversations-to-code/0004-github.md` (child of the umbrella `index.md`, tier GA), accepted at `/architect` on 2026-11-05. This prompt covers the W5 Build plan items 1 to 6 and satisfies AC-43 to AC-56, including the lettered ACs (AC-43a, AC-48a to AC-48d, AC-52a, AC-55a). The spec is the contract: where this prompt is shorter, the spec wins.

Rules in force: Next.js 15 App Router, strict TypeScript, no `any`, plain JSON errors `{ error }`, every UI load uses `useLoadingTimeout` plus `LoadError`, tokens only (no hex, no raw color classes), react-hot-toast only. No new dependency: GitHub calls use plain `fetch` and Node `crypto`, no Octokit. No new AI provider. Work on `main`, no branch, no PR. Ask before commit and push.

No Stream code changes in this step. `node_modules/next/dist/docs/` does not exist in this install; `after` comes from `next/server` (confirmed in the type definitions).

## 0. Before code

**You do these first. The build cannot be tested end to end without them.**

1. Create the dev GitHub App with the settings in the umbrella's W5 prerequisite: Metadata read, Pull requests read; events `pull_request`, `installation`, `installation_repositories`; "Request user authorization (OAuth) during installation" on; Callback URL `http://localhost:3000/api/github/callback`; Webhook URL a free smee.io channel forwarded to `/api/github/webhook`.
2. Add to `.env.local` yourself: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `NEXT_PUBLIC_GITHUB_APP_SLUG`. I do not read `.env*` files in this work. Add the same names, without values, to `.env.example`.

**I do these:**

- Mark Step W5 in `context/build-plan.md` as in progress, and fix its line 712 (remove "optional issue creation; members mapped by OAuth linked numeric GitHub id", both dropped at W0).
- Remove "Optional 'also create GitHub issue' on confirm." from scope feature 23.
- AGENTS.md API Contracts already list every W5 route. Add `authorizeUrl` to the `GET /api/projects/[id]/github/repos` line, and add the `GET /api/tasks/[id]` and `GET /api/ledger` changes as `(extended)` lines. No path or method changes. The four GitHub secrets are already under Security.

## 1. Schema, Build plan item 1 (W5a)

Append the umbrella's `-- ===== W5. GitHub =====` block to `supabase/schema.sql`, exactly as written, in this order: the tables (`github_installations`, `github_installation_claims`, `github_repos`, `github_deliveries`, `task_links`), the `ledger_links` change, then `add_code_ledger_links`, `apply_merge_completion`, `apply_github_move`, `apply_merge_revert`. The `project_activity` view stays in W6.

RLS on for all five tables with no policies, `grant select, insert, update, delete ... to service_role`; every new function revoked from `public, anon, authenticated` and granted to `service_role`.

Checked against `supabase/schema.sql` (not the live database) while writing this prompt: `task_events.kind` already allows every kind W5 writes, `actor_id` is nullable, the `tasks` checks hold for all three functions, and `ledger_recompute_item_status(uuid)` exists.

I show you the SQL and apply it to the live NeuraMeet project (`lsjiwxohfpzdvenbxpeu`) only with your OK. The MCP refuses any SQL containing `delete from`, and `apply_merge_revert` contains one, so that function goes through the SQL editor, as at W4. Then I confirm the tables, the new `ledger_links` columns and constraint, the functions, and the grants. Every existing `ledger_links` row must read `evidence_kind = 'meeting'`.

## 2. GitHub client and key parsing, Build plan item 2 (W5a)

- `src/lib/github.ts` (`server-only`): `appJwt`, `installationToken`, `userToken`, `userInstallations`, `installationRepos`, `recentPulls`, `pull`, `verifySignature`, each as the spec's *GitHub calls without Octokit* section says, including the 10 second timeout and the page limits.
- `src/lib/github-keys.ts` (pure): `findKeys`, `closingKeys`, `revertTarget`, `isRevert`. Only the branch ignores case. The branch never closes. One closing word covers one key.
- Signed install `state` helpers (`{ projectId, userId, exp }`, 10 minutes, HMAC SHA-256 with a key from `crypto.hkdfSync` over `GITHUB_APP_CLIENT_SECRET`, info `install-state`), checked with `timingSafeEqual`.
- Types in `src/lib/github-types.ts`, including the PR snapshot.

## 3. Install and repo linking, Build plan item 3 (W5b, AC-43, AC-43a, AC-46, AC-47)

- `GET /api/github/callback`: the flow in AC-43, and every outcome redirects as AC-43a says, never raw JSON. A signed out visitor goes to `/sign-in` with `redirect_url` back to the callback. The user token is used once and never stored or logged.
- `GET /api/projects/[id]/github/repos` (Owner): usable installations under AC-47, repos from `installationRepos` with link state, `installUrl`, `authorizeUrl`.
- `POST /api/projects/[id]/github/repos` (Owner): `{ repoId }`, checked against that list and never trusted from the body. 422 when outside, 409 when linked to another project. Writes `repo.linked` to `audit_log`.
- `DELETE /api/projects/[id]/github/repos/[repoId]` (Owner): unlinks, keeps `task_links`, writes `repo.unlinked`.
- `src/components/projects/GitHubTab.tsx`, new `github` tab in `ProjectDetailView.tsx`, Owner only: the two buttons, repo list, link and unlink, toast from `?github=`, then the param is cleared.

`src/middleware.ts` does not change. Do not add these routes to `isPublicRoute`.

## 4. Shared rules and webhook, Build plan item 4 (W5c, AC-44, AC-45, AC-48 to AC-53)

- `src/lib/github-rules.ts`: `applyPrSnapshot` in the spec's seven step order, plus snapshot builders for the webhook and REST shapes (`merged` comes from `merged_at` in both). The webhook and Sync both call it, so they cannot disagree.
- `POST /api/github/webhook` on the Node runtime, in the spec's order: size check, raw body, signature, delivery insert or atomic reclaim, 202, then `after()`. A missing secret is logged and returns 401. Failures are logged, stored on the delivery row, and never thrown out of `after()`.
- `installation` and `installation_repositories` events under AC-53. `installation` `created` is ignored, because the callback writes that row.
- Skip W8 notifications (no table yet).

## 5. Sync, drawer, and viewer safety, Build plan item 5 (W5d, AC-54, AC-55, AC-56)

- `syncProject(supabase, projectId)` in `github-rules.ts`, written so W8's cron can call it. Limits: 100 PRs, stops starting reads at 45 seconds, `partial: true` when cut short.
- `POST /api/projects/[id]/github/sync` (Owner or Admin): 429 when the latest `github.synced` audit row for this project is under 60 seconds old; returns counts. Writes the audit row.
- "Sync GitHub" button on the Tasks tab header for Owner and Admin, counts shown in a toast, board reloads after.
- `GET /api/tasks/[id]`: replace `prLinks: []` with real rows. A viewer column list in `src/lib/project-select.ts` returns only state, merged, and reverted, with no repo name, PR title, or URL. `src/lib/task-types.ts:64` stops being `never[]`.
- `src/components/projects/TaskDrawer.tsx`, opened by clicking a `TaskCard` (a drag must not open it): title, status, PR list, "Completed by merge" with the PR link, recent events with "GitHub" as the actor when `detail.source = 'github'`. Loading uses `useLoadingTimeout` with `LoadError`.

## 6. Ledger display and guard, Build plan item 6 (W5e, AC-52a, AC-55a)

- `GET /api/ledger`: add `evidence_kind` and `evidence_task_link_id` to `LINK_COLUMNS`, make `evidence_meeting_id` and `line_number` nullable in the row type, batch load `task_links` for code links, and return `evidenceKind` plus `pr`. A code link never reaches the "incoming links" list, because that list filters on `evidence_meeting_id`.
- `src/lib/meeting-types.ts`: `LedgerLink` gets `evidenceKind`, nullable `evidenceMeetingId` and `lineNumber`, optional `pr`.
- `LedgerTab.tsx`: a code link shows "Merged PR · repo #N" with the title and a link, never "line null". Check every use of `link.lineNumber` in the file (line 107 and `quoteMeta`).
- `POST /api/ledger/links/[id]/review`: 409 "This PR was reverted" on `confirm` or `reset` when the code link's task link has `reverted_at`. `reject` still works.
- `src/agent/ledger-match.ts` filters on `evidence_meeting_id` and stays unchanged. A test proves it leaves code links alone.

## 7. Tests

- Unit: `github-keys.ts` (case rules, closing words, one word per key, revert parsing), `verifySignature`, `state` signing (expired, tampered, wrong user), snapshot builders giving the same result for both shapes.
- Rules, in the mock style of `process/route.test.ts`: every scenario under the spec's *Critical test scenarios* that does not need real row locks, using saved payload fixtures.
- Routes: webhook (bad signature, missing secret, 413 both ways, duplicate id, reclaim), callback (each AC-43a outcome), repos (422, 409, Owner only), sync (429, `partial`), tasks GET (Viewer response holds no repo name, title, or URL), ledger GET and review (AC-52a, AC-55a).
- Component: `TaskDrawer` for Viewer and Owner, `LedgerTab` with a code link, `GitHubTab` toast codes.
- The SQL behavior runs live against Supabase, since vitest mocks the database: two closing PRs at once, a person's reopen sticking, a revert reopening only the completing merge, the manual completion suggestion. One `update_task` reopen must write `from_value = 'completed'` for the reopen cutoff to work.
- Then `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`.

## 8. After the build

- Update `context/progress-tracker.md`, `context/ui-registry.md` (`GitHubTab`, `TaskDrawer`, the Ledger code link row, the Sync button), `context/build-plan.md`, the spec Build plan ticks, and scope row 23 milestones W5a to W5e. The feature stays `in-progress` for `/check verify` and `/test` (GA tier).
- A production App is still owed at Deploy.

## Test steps for you (after the build)

Use a test repo you own, a project with prefix `NM`, and at least one task created from a confirmed proposal. Keep the smee client running.

1. As Owner, open the project's GitHub tab and install the App. You land back on the tab with a success toast. Link the repo.
2. Open a draft PR with the branch `nm-1-test`: `NM-1` moves to In progress and the drawer shows the PR, with GitHub as the actor. Mark it ready: the task moves to In review.
3. Add "Closes NM-1" to the body and merge into a non default branch: the task does not complete. Do the same with a second task on the default branch: it completes, shows "Completed by merge", and its promise shows a "kept" suggestion on the Ledger tab as "Merged PR · repo #N".
4. Give one task two closing PRs and merge one: it stays open. Merge the second: it completes.
5. Close a PR without merging: the task moves from In review back to In progress.
6. Revert the merged PR with GitHub's Revert button and merge the revert: the task reopens to In progress and the suggestion is gone. The revert PR itself does not complete anything.
7. Reopen a merge completed task by hand as Owner, then edit its old PR: the task stays open.
8. Send a request to the webhook with a wrong signature: 401 and nothing stored. Redeliver a real delivery from GitHub's App settings: nothing changes twice.
9. Stop the smee client, merge a closing PR, restart it, and press Sync GitHub: the task completes. Press it again at once: you get the 429 message.
10. As a Viewer, open a task: state only, no repo name, PR title, or link, in the page or in the `GET /api/tasks/[id]` response.
11. As a second Owner on the same GitHub account, use "I already installed it": the repos appear. Try a project you do not own: no tab, and the route refuses you.
