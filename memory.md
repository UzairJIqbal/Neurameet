# Memory — Promise Ledger S1 slice 5 (Evaluation script plus demo seed)

Last updated: 2026-10-30

## What was built

Slice 5 of spec `docs/specs/0001-promise-ledger/index.md` (AC-16, Build plan item 6). Prompt: `prompts/step-S5-promise-ledger-slice5.md`.

- `src/lib/ledger-eval-metrics.ts` (new, pure): `precisionRecall`, `accuracy`, `cohensKappa` (null on empty denominators; single label edge case handled). Test: `src/lib/ledger-eval-metrics.test.ts` (8 tests).
- `scripts/ledger-eval.ts` (new): `npm run eval:ledger -- [--limit N] [--out file] [--delay ms]` (default delay 4000). Loads `.env.local` via dotenv at run time, validates `pairs.json` with zod, runs production `judgeLedgerCandidates` then `filterVerdicts` per pair (one candidate per call), prints precision and recall for kept and reversed per `en`/`ur`/`mixed`/`all`, accuracy, kappa, wrong ids. Judge errors are skipped, not scored as none.
- `scripts/ledger-eval/pairs.json` (new): 40 pairs (20 mixed, 12 en, 8 ur script; 15 kept, 12 reversed, 13 none).
- `scripts/ledger-demo/` (new): `01-launch-planning.txt` (2026-10-01), `02-infra-review.txt` (2026-10-08), `03-launch-check.txt` (2026-10-15), plus `README.md` with upload order and expected results.
- `package.json`: added `eval:ledger` script.
- Bookkeeping: scope.md slice 5 milestone and the `Build it` box ticked (feature stays `in-progress`, GA); progress-tracker updated; slice 5 section appended to `docs/scope/verify.md`.

## Decisions made

- Eval scores what the app would store: judge output passes through `filterVerdicts` (0.7 threshold plus quote check) before comparison.
- `label_a` in pairs.json is an AI DRAFT; every `label_b` is null. Real numbers need a human to review `label_a` and a second person to fill `label_b` blind. Kappa prints "needs label_b" until then.
- Metrics live under `src/lib/` so the existing vitest config covers them.

## Problems solved

- Gemini returned 503 "high demand" during the smoke run; Groq fallback answered. The 3 pair run took about 3 minutes, so a full 40 pair run may take 15+ minutes on free tier.
- `tsx` scripts can import `src/agent/ledger.ts` (no `server-only` there); the ledger module is loaded with a dynamic import after dotenv.
- Carried over: dev server on port 3100 (3000 is storeit); never read `.env.local`; Claude in Chrome cannot load localhost, so UI checks are manual.

## Current state

- tsc clean, vitest 47 files / 311 tests green, `npm run build` ok, eslint clean on new files.
- Smoke run `--limit 3`: 3/3 correct.
- Slices 1 to 5 all built; all uncommitted on `main`.
- Demo seed not yet run in the app; manual verify for slices 2 to 5 not run.

## Next session starts with

1. Commit slices 1 to 5 on a branch (not on `main`).
2. Run `/check verify promise ledger` (includes the demo upload from `scripts/ledger-demo/README.md`, done by hand).
3. Get `label_a` reviewed and `label_b` filled, then a full `npm run eval:ledger -- --out scripts/ledger-eval/results.json`.
4. Then `/test`, `/check review`, `/document` for the Promise Ledger.

## Open questions

- Who is the second labeller for `label_b`?
- Whether the judge actually produces the demo outcomes the README describes (unconfirmed until the manual run).
