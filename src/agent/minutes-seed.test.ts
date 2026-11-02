import { describe, it, expect } from "vitest";
import { changeDate, planSeed, type SeedLine } from "./minutes-seed";

const seedLine = (
  id: string,
  position: number,
  over: Partial<SeedLine> = {},
): SeedLine => ({
  id,
  position,
  section: "decision",
  text: "Ship the beta",
  evidence: [{ quote: "ship it", lineNumber: position + 1, speaker: "Sara" }],
  speakerLabels: ["Sara"],
  ...over,
});

describe("changeDate", () => {
  it("moves ISO dates, day month dates, and weekdays", () => {
    expect(changeDate("Due 2026-11-10")).toBe("Due 2026-11-12");
    expect(changeDate("Due 28 November")).toBe("Due 25 November");
    expect(changeDate("Due November 3")).toBe("Due November 5");
    expect(changeDate("By Monday")).toBe("By Wednesday");
    expect(changeDate("By Friday")).toBe("By Tuesday");
    expect(changeDate("No date here")).toBeNull();
  });
});

describe("planSeed", () => {
  const lines = [
    seedLine("c", 2, {
      section: "action_item",
      text: "Ali sends the survey by Friday",
      speakerLabels: ["Ali"],
      evidence: [{ quote: "survey", lineNumber: 3, speaker: "Ali" }],
    }),
    seedLine("a", 0),
    seedLine("b", 1, { text: "Launch on 2026-11-20" }),
  ];

  it("cycles the kinds in position order, one per line, skipping kinds that don't fit", () => {
    const plants = planSeed(lines, 3);
    // c is an action item, so it can't drop an objection; the cycle moves on.
    expect(plants.map((p) => `${p.kind}:${p.lineId}`)).toEqual([
      "misattributed:a",
      "changed_date:b",
      "misattributed:c",
    ]);
    expect(new Set(plants.map((p) => p.lineId)).size).toBe(plants.length);
    expect(plants[0].after.speakerLabels).toEqual(["Ali"]);
    expect(plants[1].after.text).toBe("Launch on 2026-11-22");
  });

  it("never plants more than k and stops when nothing fits", () => {
    expect(planSeed(lines, 1)).toHaveLength(1);
    expect(
      planSeed(
        [
          seedLine("x", 0, {
            section: "summary",
            evidence: [],
            speakerLabels: [],
          }),
        ],
        3,
      ),
    ).toEqual([]);
  });

  it("is repeatable", () => {
    expect(planSeed(lines, 3)).toEqual(planSeed(lines, 3));
  });
});
