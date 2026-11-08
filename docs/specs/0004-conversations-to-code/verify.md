# W9 verify log

Dated 2026-11-08. Code and tests are done. The live runs happen on the Vercel deployment at Step 11.

## Coverage of AC-80 to AC-84

| AC | Covered by | Status |
|---|---|---|
| AC-80 route matrix | `src/app/api/project-route-matrix.test.ts` (249 tests), table in `src/test/project-route-matrix.ts` | pass |
| AC-81 webhook attacks | `src/app/api/security-attacks.test.ts`, plus `github/webhook/route.test.ts`, `github/callback/route.test.ts`, `github-rules.test.ts` | pass |
| AC-82 invites and removed members | `security-attacks.test.ts`, plus `src/lib/invitations.test.ts` | pass |
| AC-83 bilingual end to end run | needs a deployed preview and a real spoken meeting | moved to Step 11 |
| AC-84 injection | `src/agent/injection.test.ts` (mocked obedient model); live probe moved to Step 11 | unit pass, live pending |

## Findings from the gate review

| Finding | Action |
|---|---|
| Cross meeting search ignored project membership | fixed in `supabase/schema.sql`, applied to Supabase, regression test added |
| Malformed task id returned 500 | fixed, now 404 |
| Forged install state is a redirect, not 400 | spec corrected, tests assert the redirect |
| Developer can assign on create but not PATCH | accepted, no data exposure |
| Role change not atomic | accepted, low risk |

## Live checks owed at Deploy

Bilingual run steps 1 to 9 from AC-83, one live injection probe, live GitHub webhook delivery.
