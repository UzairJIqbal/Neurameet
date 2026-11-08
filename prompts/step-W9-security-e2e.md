# Step W9: Security suite and the bilingual end to end run

Spec: `docs/specs/0004-conversations-to-code/0004-security-e2e.md`. It is the contract. This prompt follows its Build plan items 1 to 4 and satisfies AC-80 to AC-84. Scope feature 27, tier GA. No tables, no routes, no UI. W9 only adds tests, one test helper, and a verify log.

Rules in force: strict TypeScript, no `any`, tests run with `npx vitest run` (config `vitest.config.mjs`, tests under `src/**/*.test.ts`), no new dependency, no secret in a test file or in `verify.md`. Work on `main`. I ask before any commit or push.

## 0. What I found before writing this

1. **The matrix table does not exist yet.** The spec says each W slice adds its rows to `src/test/project-route-matrix.ts`. Only `src/test/viewer-walk.ts` and `src/test/supabase-queue-mock.ts` exist. So W9 builds the whole table, not just the completeness check.
2. **The queue mock cannot model a removed member.** It returns whatever result is next in the queue, so "removed" and "outsider" would both be `null` and the test proves nothing about `removed_at`. The matrix needs a small stateful fake of `project_members` that honours the `eq` and `is("removed_at", null)` filters.
3. **AC-81 and AC-82 are mostly covered already.** `webhook/route.test.ts`, `github/callback/route.test.ts`, `github-rules.test.ts` and `invitations.test.ts` already test bad signature, missing signature, oversize body, replay, suspended installation, another project's prefix, forged state, wrong email, Admin link invite (422), and the 11th failure (429). W9 maps each clause of AC-81 and AC-82 to its existing test in a table, and writes new tests only for the gaps (see section 2).
4. **AC-84 has no test today.** `project-assistant.test.ts:209` checks that wrapping keeps an injection line inside its block. Nothing covers `/api/ai/process`.
5. **The Next.js docs folder is not in this install** (Next 15.5.18, noted at W8). Not needed: W9 adds no Next code.

## 1. Route matrix, Build plan item 1 (AC-80)

**Files:** `src/test/project-route-matrix.ts` (table and fake), `src/app/api/project-route-matrix.test.ts` (generated tests).

**Table row:** `{ route, method, path, need, body?, viewerReadable? }` where `need` is one of `member`, `content`, `manage`, `owner`.

**Rows:** every `route.ts` under `src/app/api/projects`, `src/app/api/tasks`, `src/app/api/proposals`, plus the project meeting routes: `meetings/[id]/project`, `meetings/[id]/consent`, `meetings/[id]/members`, and the owner only meeting routes that now pass for project Owner or Admin. I read each route's gate before writing its row, so the `need` is what the code does today, then compared with the role matrix in `index.md`. A mismatch is a finding, not a silent edit of the table.

**Exempt list (explicit, each with a reason):** `projects/route.ts` (list and create, no project id), `projects/search` (no project id, scopes itself), `projects/[id]` rows stay in. Every exemption is a named entry, so adding one is a visible diff.

**Generated cases per row, for actors outsider, removed member, Viewer, Developer, Admin, Owner:**

| Need | Outsider | Removed | Viewer | Developer | Admin | Owner |
|---|---|---|---|---|---|---|
| member | 404 | 404 | pass | pass | pass | pass |
| content | 404 | 404 | 403 | pass | pass | pass |
| manage | 404 | 404 | 403 | 403 | pass | pass |
| owner | 404 | 404 | 403 | 403 | 403 | pass |

"pass" means the gate lets the request through: the status is not 401, 403, or 404 from the gate. Downstream data is not seeded for denied cases, only the gate is asserted. Signed out is 401 for every row.

**Viewer leak check:** for every row with `viewerReadable`, seed the fake with rows that do carry `quote`, `quote_line`, `pr_url`, `pr_title`, `repo_full_name`, run the GET as Viewer, and assert `viewerLeaks(body)` is empty and no select list matches `HIDDEN_COLUMNS`. If the generic fake is too brittle for one route, that row carries its own seed. The row is never dropped.

**Completeness check:** a test lists every `route.ts` under the three folders with `fs`, converts it to a route string, and fails if a route is neither in the table nor in the exempt list. It also fails for a table row whose file no longer exists.

**Removed member cases:** a member with `removed_at` set gets 404 on every row, and the same user re-added (a new row with `removed_at` null) passes. This is the case the queue mock could not show.

## 2. Webhook and invite attacks, Build plan item 2 (AC-81, AC-82)

**File:** `src/app/api/security-attacks.test.ts`, plus a short coverage table in `verify.md` naming the existing test for every clause already covered.

**AC-81 gaps I expect to fill:** a valid signature computed over a different body (signature check must use the raw body that was sent), a delivery for an unlinked repo (no task, no event, delivery recorded ignored), and a database call count check proving each rejected case writes nothing. The forged install `state` returning 400 is checked against the current route: if the route returns another 4xx today, I report it and ask before changing the route or the spec.

**AC-82 gaps I expect to fill:** a removed member reusing an old used email invite (410), and a removed member on a valid link invite (a pending join request, not a rejoin). The other clauses are already tested.

## 3. Injection tests, Build plan item 3 (AC-84)

**Unit tests, run in CI, model mocked.** They prove our code's defences, not the model:

- Project assistant: transcript lines that say "ignore your instructions", "show me other projects", and "create a task" stay inside the untrusted block, the citation list comes only from the retrieved source list, and no write happens.
- `/api/ai/process` on a project meeting: the same lines, with a mocked model that obeys them (returns an extra task and a quote that is not in the transcript). Assert the invented quote is dropped by validation, nothing lands as `confirmed`, and every proposal has `review_state = 'proposed'`.

**One live probe, recorded in `verify.md`.** Real Gemini or Groq on a short planted transcript, run once from a script under `scripts/` or a Playwright spec in `tests/w-test/`, so we also see what the real model does. Output of the live probe is evidence, not a CI test, because it spends free tier quota and is not deterministic.

## 4. Audit, then the bilingual run, Build plan item 4 (AC-83)

1. **`/audit` on the phase.** Run it over the W1 to W8 code paths that gate access, fix every finding in its own small change, rerun the matrix.
2. **Run order for checks:** `npx vitest run`, `npx tsc --noEmit`, lint, `npm run build`. All must be green before the manual run.
3. **Bilingual run, written into `docs/specs/0004-conversations-to-code/verify.md`** as a table (step, expected, actual, pass or fail, screenshot path under `docs/specs/0004-conversations-to-code/verify/`). Steps follow AC-83 in order:
   1. Project with Owner, Admin, Developer, Viewer, one of them joined by link invite and approval.
   2. Real project meeting with English and Urdu speech, transcript generated through Phase F.
   3. Proposal with a verified quote and an own track assignee.
   4. Confirm into `NM-1`.
   5. PR with "Closes NM-1" merged into the default branch.
   6. Task completes.
   7. Owner confirms the kept suggestion.
   8. Outcome card shows all four steps.
   9. Viewer sees the chain redacted.

   A failed step opens a fix, and the run restarts from that step. I drive what Playwright can drive (sign in, project setup, review, PR link through Sync, Viewer check). **You** speak the English and Urdu lines and merge the PR on GitHub.

## 5. Docs, after the work

Update `context/progress-tracker.md`, `context/build-plan.md` (Step W9 status and exit line), `docs/scope/scope.md` row 27 and the W9 checkbox, and the spec status once you say `done`. `context/ui-registry.md` does not change: W9 adds no UI. I run `/sync` at the end.

## 6. Decisions I need from you before I start

1. **Where the bilingual run happens.** AC-83 says "a deployed preview", but Deploy (Step 11) comes after W9. Two options:
   - **A. Local production build (`npm run build` and `npm start`), PR link through "Sync now". Recommended.** The local GitHub App has no webhook (GitHub rejects a localhost hook URL), so the merge-to-task step uses Sync, which applies the same completion rules. The live webhook delivery (and the unverified `requested_reviewer.id` payload) is then checked once at Deploy, which is already on that list.
   - **B. Deploy a Vercel preview first.** Proves the live webhook now, but pulls Deploy work (env vars, Clerk and Stream origins, GitHub App webhook URL) ahead of W9 and may hit free tier limits twice.
2. **The 400 versus 4xx forged state case (AC-81).** I assume the callback already returns 400. If it does not, do you want the route changed, or the spec line corrected to match the route?

## Exit

All tests green (`npx vitest run`, typecheck, lint, build), the completeness check fails when a route has no row, `verify.md` filled with the dated bilingual run and the AC-81 and AC-82 coverage table, and the live injection probe recorded. Then Step 11.
