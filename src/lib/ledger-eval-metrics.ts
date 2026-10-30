// Pure scoring helpers for the Promise Ledger evaluation (AC-16).
// Used by scripts/ledger-eval.ts; no I/O and no AI calls, so they are unit tested.

export type EvalLabel = "kept" | "reversed" | "none";
export type EvalLanguage = "en" | "ur" | "mixed";

export const EVAL_LABELS: EvalLabel[] = ["kept", "reversed", "none"];
export const EVAL_LANGUAGES: EvalLanguage[] = ["en", "ur", "mixed"];

export interface EvalOutcome {
  language: EvalLanguage;
  truth: EvalLabel;
  predicted: EvalLabel;
}

export interface PrecisionRecall {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  support: number;
}

/** Precision and recall for one positive label. Null when a denominator is 0. */
export function precisionRecall(
  outcomes: EvalOutcome[],
  label: "kept" | "reversed",
): PrecisionRecall {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const o of outcomes) {
    if (o.predicted === label && o.truth === label) tp += 1;
    else if (o.predicted === label) fp += 1;
    else if (o.truth === label) fn += 1;
  }
  return {
    tp,
    fp,
    fn,
    precision: tp + fp === 0 ? null : tp / (tp + fp),
    recall: tp + fn === 0 ? null : tp / (tp + fn),
    support: tp + fn,
  };
}

/** Share of outcomes where the prediction equals the truth. Null when empty. */
export function accuracy(outcomes: EvalOutcome[]): number | null {
  if (outcomes.length === 0) return null;
  const correct = outcomes.filter((o) => o.predicted === o.truth).length;
  return correct / outcomes.length;
}

/** Cohen's kappa between two labellers over the three labels. Null when empty. */
export function cohensKappa(
  pairs: Array<[EvalLabel, EvalLabel]>,
): number | null {
  const n = pairs.length;
  if (n === 0) return null;

  const agree = pairs.filter(([a, b]) => a === b).length;
  const po = agree / n;
  let pe = 0;
  for (const label of EVAL_LABELS) {
    const a = pairs.filter(([x]) => x === label).length / n;
    const b = pairs.filter(([, y]) => y === label).length / n;
    pe += a * b;
  }
  // Both labellers used a single label: chance agreement is total.
  if (pe === 1) return po === 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}
