# Step S1, slice 5: Promise Ledger evaluation script plus the demo seed

Spec: `docs/specs/0001-promise-ledger/index.md` (Status In Progress, tier GA). This prompt covers Build plan item 6 (the scope milestone "Evaluation script with per language metrics and kappa, plus the demo seed") and satisfies AC-16. No route, no schema, no UI change. No new env var, no new provider, no new dependency (`tsx` and `dotenv` are already installed).

What already exists and is reused, not rebuilt:
- `judgeLedgerCandidates({ rawText, candidates })` in `src/agent/ledger.ts`: the exact production judge (Gemini first, Groq fallback via `generateStructuredWithFallback`).
- `filterVerdicts({ verdicts, candidateIds, rawText })`: the production keep rule (known id, relation not `none`, confidence at least 0.7, quote verified by `findQuoteLine`).
- `src/agent/ledger.ts` and `src/agent/models.ts` do not import `server-only`, so a `tsx` script can import them. `tsx` resolves the `@/*` path alias from `tsconfig.json`.

## 1. Pure metrics module (`src/lib/ledger-eval-metrics.ts`)

Lives under `src/` so the existing vitest config picks up its test. No I/O, no AI.

```ts
export type EvalLabel = "kept" | "reversed" | "none";
export type EvalLanguage = "en" | "ur" | "mixed";
export interface EvalOutcome { language: EvalLanguage; truth: EvalLabel; predicted: EvalLabel }
export interface PrecisionRecall { tp: number; fp: number; fn: number; precision: number | null; recall: number | null; support: number }
export function precisionRecall(outcomes: EvalOutcome[], label: "kept" | "reversed"): PrecisionRecall
export function cohensKappa(pairs: Array<[EvalLabel, EvalLabel]>): number | null
```

- Precision is `tp / (tp + fp)`, recall is `tp / (tp + fn)`. Either is `null` when its denominator is 0 (printed as `n/a`, never as 0 or NaN). `support` is the count of truth rows with that label.
- Kappa over the three labels: `(po - pe) / (1 - pe)`. Returns `null` for an empty list. When `pe` is 1 (both labellers used one label only), return 1 if `po` is 1, else 0.
- Test file `src/lib/ledger-eval-metrics.test.ts`: a hand computed confusion case for precision and recall, the null denominators, perfect agreement (kappa 1), a textbook kappa case checked to 3 decimals, and the single label edge case.

## 2. Labelled pairs (`scripts/ledger-eval/pairs.json`)

Shape:

```json
{
  "note": "label_a is a DRAFT written by the AI. Review and correct every label_a, and have a second person fill label_b without looking at label_a, before reporting numbers.",
  "pairs": [
    {
      "id": "p01",
      "item": { "kind": "promise", "statement": "...", "quote": "...", "language": "mixed", "assignee": "Ali", "dueDate": "2026-10-02" },
      "evidence": "Ali: survey bhej diya tha kal\nSara: great, thanks",
      "label_a": "kept",
      "label_b": null
    }
  ]
}
```

- 40 pairs. About half code mixed: 20 `mixed` (Roman Urdu with English), 12 `en`, 8 `ur` (Urdu script).
- Labels spread across `kept`, `reversed`, `none`, roughly a third each, with hard `none` cases on purpose (only mentioned, still in progress, "will do it next week", a different person or a different task).
- Evidence is 2 to 6 lines in `Speaker: text` form, so `findQuoteLine` can verify the quote and read the speaker.
- Honesty rule: I cannot be a human labeller. I write `label_a` as a clearly marked draft and leave every `label_b` as `null`. You (and a second labeller) fill them in. The script still runs with nulls; it just reports kappa as "needs label_b".

## 3. Eval script (`scripts/ledger-eval.ts`)

Run: `npx tsx scripts/ledger-eval.ts` (also `npm run eval:ledger`). Options: `--limit N` (first N pairs, for a cheap smoke run), `--out <path>` (write per pair results as JSON), `--delay <ms>` (default 4000, spacing between calls for the free tier rate limit).

Steps:
1. Load env from `.env.local` with `dotenv` (the script reads it at run time; it is never printed). Exit with a clear message if `GOOGLE_GENERATIVE_AI_API_KEY` and `GROQ_API_KEY` are both missing.
2. Load and validate `pairs.json` with zod (bad shape → exit 1 naming the pair id). Every `label_a` must be set.
3. For each pair: one call to `judgeLedgerCandidates` with the evidence as `rawText` and the single item as the candidate (id = pair id). Then run `filterVerdicts` on the result, exactly as production does. The predicted label is the kept row's relation, else `none`. So the score measures what the app would actually store, threshold and quote check included.
4. A judge failure on both providers is logged with the pair id, counted as an error, and left out of the metrics (never counted as `none`). The run continues.
5. Print:
   - a header with pair counts per language, scored count, and error count;
   - a table of precision, recall, and support for `kept` and `reversed`, for each of `en`, `ur`, `mixed`, and `all`;
   - overall accuracy over the three labels;
   - Cohen's kappa between `label_a` and `label_b` over pairs that have both, with the pair count, or "needs label_b" when none do;
   - the ids of wrong predictions, so you can inspect them.
6. Exit 0 after a run, even with some judge errors; exit 1 only on bad input or missing keys.

Add `"eval:ledger": "tsx scripts/ledger-eval.ts"` to `package.json` scripts.

## 4. Demo seed (`scripts/ledger-demo/`)

Three bilingual (Roman Urdu plus English) `.txt` transcripts in `Speaker: text` lines, uploaded through the normal Upload Transcript modal with backdated Meeting dates:

| File | Meeting date | Story beats |
|---|---|---|
| `01-launch-planning.txt` | 2026-10-01 (Thursday) | Team decides to deploy on Vercel. Ali: "main Friday tak survey bhej dunga" (due 2026-10-02). One or two plain English promises too. |
| `02-infra-review.txt` | 2026-10-08 | Team moves hosting to AWS (reverses the Vercel decision). Ali admits the survey is still not sent, so it stays open and overdue. |
| `03-launch-check.txt` | 2026-10-15 | Ali: "survey bhej diya hai, responses aa rahe hain" (kept). |

Plus `scripts/ledger-demo/README.md` with the upload order, the dates to pick, and what you should see after each upload (meeting 2: a reversed card plus badge for Vercel, the survey overdue on meeting 1; meeting 3: a kept suggestion for the survey; confirm each match).

## 5. Bookkeeping

- Tick the slice 6 milestone in `docs/scope/scope.md` only after the files exist, tsc is clean, the vitest suite is green, and a `--limit 3` smoke run of the eval completed against the real providers (if the providers are rate limited, I report that instead of ticking).
- Update `context/progress-tracker.md`; append a slice 5 section to `docs/scope/verify.md`. No `ui-registry.md` change (no UI).

## Checks

`npx tsc --noEmit`, `npx eslint scripts/ledger-eval.ts src/lib/ledger-eval-metrics.ts`, `npx vitest run`, `npm run build`, then `npx tsx scripts/ledger-eval.ts --limit 3`.
