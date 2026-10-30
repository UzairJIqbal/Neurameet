import { describe, expect, it } from "vitest";
import {
  accuracy,
  cohensKappa,
  precisionRecall,
  type EvalLabel,
  type EvalOutcome,
} from "./ledger-eval-metrics";

const o = (truth: EvalLabel, predicted: EvalLabel): EvalOutcome => ({
  language: "mixed",
  truth,
  predicted,
});

describe("precisionRecall", () => {
  it("counts true positives, false positives and false negatives", () => {
    const outcomes = [
      o("kept", "kept"),
      o("kept", "kept"),
      o("kept", "none"),
      o("none", "kept"),
      o("reversed", "reversed"),
      o("none", "none"),
    ];
    const kept = precisionRecall(outcomes, "kept");
    expect(kept).toMatchObject({ tp: 2, fp: 1, fn: 1, support: 3 });
    expect(kept.precision).toBeCloseTo(2 / 3);
    expect(kept.recall).toBeCloseTo(2 / 3);
  });

  it("returns null when a denominator is zero", () => {
    const result = precisionRecall([o("none", "none")], "reversed");
    expect(result.precision).toBeNull();
    expect(result.recall).toBeNull();
    expect(result.support).toBe(0);
  });

  it("treats a wrong positive label as both a false positive and a miss", () => {
    const outcomes = [o("kept", "reversed")];
    expect(precisionRecall(outcomes, "reversed").fp).toBe(1);
    expect(precisionRecall(outcomes, "kept").fn).toBe(1);
  });
});

describe("accuracy", () => {
  it("is null for no outcomes and a share otherwise", () => {
    expect(accuracy([])).toBeNull();
    expect(accuracy([o("kept", "kept"), o("none", "kept")])).toBe(0.5);
  });
});

describe("cohensKappa", () => {
  it("is null for an empty list", () => {
    expect(cohensKappa([])).toBeNull();
  });

  it("is 1 for perfect agreement across labels", () => {
    expect(
      cohensKappa([
        ["kept", "kept"],
        ["reversed", "reversed"],
        ["none", "none"],
      ]),
    ).toBe(1);
  });

  it("matches a hand computed case", () => {
    // 10 pairs: 7 agree. Labeller A: kept 4, reversed 3, none 3.
    // Labeller B: kept 4, reversed 2, none 4.
    // pe = 0.16 + 0.06 + 0.12 = 0.34, po = 0.7, kappa = 0.36 / 0.66.
    const pairs: Array<[EvalLabel, EvalLabel]> = [
      ["kept", "kept"],
      ["kept", "kept"],
      ["kept", "kept"],
      ["kept", "none"],
      ["reversed", "reversed"],
      ["reversed", "reversed"],
      ["reversed", "none"],
      ["none", "none"],
      ["none", "none"],
      ["none", "kept"],
    ];
    expect(cohensKappa(pairs)).toBeCloseTo(0.545, 3);
  });

  it("handles both labellers using a single label", () => {
    expect(
      cohensKappa([
        ["none", "none"],
        ["none", "none"],
      ]),
    ).toBe(1);
  });
});
