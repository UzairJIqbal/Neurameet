# Memory — NeuraMeet: all build steps closed, UI polish done, Deploy next

Last updated: 2026-11-08

## What was built (whole project state)

Everything through Phase W is built and pushed to main: Core pipeline (Steps 0 to 9), Advanced (A, B, C), Meeting Experience (D), Transcript Generation (F), Promise Ledger (S), Live Ledger (LL), Tasdeeq verified minutes (T1 to T5, live run pending), and Phase W project workspace (W-pre, W0 to W9: projects, roles, invitations, project meetings, review gate and Kanban, GitHub App Proof Chain, assistant, workspace shell, security suite).

W9 closed: 249 route matrix tests, 13 attack tests, 8 injection tests (`src/test/project-route-matrix.ts`, `src/app/api/project-route-matrix.test.ts`, `security-attacks.test.ts`, `src/agent/injection.test.ts`). Gaps fixed: `match_meeting_chunks_user` hides project meetings from non members (also applied to the live Supabase project), malformed task id is 404 not 500.

UI polish pass (this session, token only, no redesign): `src/lib/utils.ts` `cn()` now extends tailwind-merge with the custom type scale (it was silently dropping `text-body-md` and `text-label-caps` before a `text-<color>`, which oversized sidebar labels). New `src/components/ui/skeleton.tsx` (`Skeleton`, `SkeletonCard`) replaced bare "Loading..." text in 8 files. `src/app/globals.css`: global focus-visible ring, balanced headings, styled native selects, reduced motion. Before and after screenshots in `docs/ui-audit/`. Registry and tracker updated.

## Decisions made

- Projects, roles and invites live in our own Supabase tables, not Clerk Organizations. Locked Stitch tokens stay; the PDF was layout only.
- Zero cost rule everywhere: Gemini, Groq, pgvector, Stream free, Clerk free, Supabase, Vercel Hobby, Resend free, GitHub App.
- Live runs (bilingual AC-83, live injection probe, live GitHub webhook) happen at Step 11 on the Vercel deployment, by the user's decision.
- Commit and push straight to main, no branches or PRs. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Problems solved

- twMerge dropping custom font size classes (fixed in `cn()`).
- Supabase MCP: NeuraMeet is project `lsjiwxohfpzdvenbxpeu`; "Kunji" is unrelated.
- The black "N" circle over the sidebar avatar is the Next.js dev indicator, dev only.

## Current state

Typecheck clean, 1883 vitest tests pass. `npx next lint` reports one old prettier error in `src/lib/transcript-state.ts` (untouched file, trivial to fix). `.env.example` still lacks `RESEND_WORKSPACE_FROM=` and `CRON_SECRET=` (an edit was denied; add them). Untracked leftovers: `reports/tasdeeq-seed-*.json`. Optional: `npx impeccable update` (v4.8.1).

## Next session starts with

Step 11 Deploy to Vercel free tier: re-enable Clerk email verification, set all env vars, set Clerk, Stream and GitHub App webhook URLs, run `npm run build`, confirm no secret leaks and free tier limits. Then the owed live checks: W2 to W6 manual tests, LL5, Tasdeeq live run, W9 live injection probe, AC-83 bilingual run, live GitHub webhook (including the unverified `requested_reviewer.id` payload). Resilience item: `/api/ai/process` returns 500 when Gemini times out and Groq fallback also fails (no `maxOutputTokens`; probe an ordered list of Groq fallback models).

## Open questions

- D3.4 recording access control stays parked (Stream plan limitation).
- Known accepted: Developer assignment on create versus PATCH, non atomic role change. Not audited: `projects/search`, `github/sync`, `github/summary`, the `ai/chat` project path, invitation list, resend and mine routes.
