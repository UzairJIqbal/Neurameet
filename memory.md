# Memory — NeuraMeet: GitHub connect fixed on production, tester check pending

Last updated: 2026-11-08

## What was built (whole project state)

Everything through Phase W is built and pushed to main (Core, Advanced, Meeting Experience, Transcript Generation, Promise Ledger, Live Ledger, Tasdeeq T1 to T5, Phase W W-pre to W9) and deployed at https://neurameet.vercel.app. UI polish pass is done (token only, see `docs/ui-audit/`). No repo files were changed this session; all fixes were GitHub and Vercel settings.

Also done this session: the FYP briefing PDFs for the user's friend, in `~/Desktop/neurameet-fyp-pack/` (`NeuraMeet-FYP-Briefing-Part1.pdf`, `Part2.pdf`), and an explanation of adding the friend as a GitHub collaborator.

## Decisions made

- Projects, roles and invites live in our own Supabase tables, not Clerk Organizations. Locked Stitch tokens stay.
- Zero cost rule everywhere (Gemini, Groq, pgvector, Stream free, Clerk free, Supabase, Vercel Hobby, Resend free, GitHub App).
- Production uses ONE GitHub App: "NeuraMeet local x072s" (slug `neurameet-local-x072s`, app id 5665093, now public). Its client id, client secret, app id, private key and webhook secret must all belong to this same app. The other app "NeuraMeet Dev UzairJIqbal" (slug `neurameet-dev-uzairjiqbal`, app id 5629534) is also public but unused in production.
- Commit and push straight to main, no branches or PRs (ask first). Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Problems solved

- Tester saw a GitHub 404 on `github.com/login/oauth/authorize?client_id=...`. Cause: the client id in the link belongs to the x072s app, which was private, and GitHub shows a 404 to non owners of a private app. The slug env vars pointed at the other app, so making that one public changed nothing. Fix: made x072s public, set Vercel `NEXT_PUBLIC_GITHUB_APP_SLUG` and `GITHUB_APP_SLUG` to `neurameet-local-x072s`, redeployed. Anonymous check: `curl https://api.github.com/apps/<slug>` returns 200 when public, 404 when private.
- Webhook returned 401 "Bad signature" on pings. Cause: `GITHUB_WEBHOOK_SECRET` was missing from `.env.local` and the Vercel and GitHub values did not match. Fix: generated a new random secret, set the same value in the app's webhook settings and in Vercel production, redeployed. A signed test ping returned 202.
- After the secret fix the app still sent no `pull_request` events until "Pull request" was ticked under Permissions and events and the new permissions were accepted. Then `pull_request.synchronize` delivered green.
- Redelivering an old failed delivery replays the old signature, so it keeps failing. Test with a fresh event instead.
- Vercel sensitive env vars cannot be read back (`vercel env pull` shows "[SENSITIVE]"). NEXT_PUBLIC vars and any env change need a redeploy. The auto mode classifier blocked my own `vercel env rm/add` and `vercel --prod`, so the user ran them.
- Never paste secrets in chat or memory; the webhook secret was passed through the clipboard and a scratchpad file that was deleted.

## Current state

GitHub connect on production works: "Reconnect GitHub" gave a success popup, the repo `UzairJIqbal/neurameet-w8-test` is linked to the project `NM_Test_3`, and the webhook shows green 202 deliveries. The user is waiting for the tester to retry "Connect GitHub" (no logout needed). The x072s webhook URL is `https://neurameet.vercel.app/api/github/webhook` and correct. Three old red `ping` deliveries remain in the app's history and can be ignored.

Test leftovers in `UzairJIqbal/neurameet-w8-test`: PR #2 "Test webhook" and branch `test-webhook` (I pushed two commits). A local clone sits in the session scratchpad `w8t/`. The user asked to clean up only after the tester checks.

Typecheck clean and 1883 vitest tests passed at the last full run. `npx next lint` has one old prettier error in `src/lib/transcript-state.ts`. Untracked: `reports/tasdeeq-seed-*.json`.

## Next session starts with

1. Ask how the tester's "Connect GitHub" went. If it still fails, get the exact URL or screenshot.
2. When the user says go, close PR #2 and delete the `test-webhook` branch in `neurameet-w8-test` (`gh pr close 2 --delete-branch`).
3. Then the owed live checks on the deployment: W2 to W6 manual tests, LL5, Tasdeeq live run, W9 live injection probe, AC-83 bilingual run, and the unverified `requested_reviewer.id` webhook payload. Optional: set `RESEND_FROM` and `RESEND_WORKSPACE_FROM` in Vercel.

## Open questions

- The Google Drive and SurveyMonkey connectors need authorizing in claude.ai connector settings (unavailable until then).
- D3.4 recording access control stays parked (Stream plan limitation).
- Not audited: `projects/search`, `github/sync`, `github/summary`, the `ai/chat` project path, invitation list, resend and mine routes.
