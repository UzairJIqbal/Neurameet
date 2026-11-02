import { describe, it, expect } from "vitest";
import { buildMinutesDraft, computeCoverage, labelKey } from "./minutes";
import type { ExtractionResult } from "./types";

const RAW = [
  "Sara Khan: We go with Vercel for hosting.",
  "Ali: I am not sure about Vercel pricing.",
  "Ali: okay agreed",
  "Sara Khan: okay agreed",
  "Bilal: I will send the survey by Friday.",
].join("\n");

const point = (
  text: string,
  quotes: string[] | null,
  speakers: string[] | null = null,
) => ({ text, quotes, speakers });

const extraction = (
  overrides: Partial<ExtractionResult> = {},
): ExtractionResult => ({
  insights: {
    summary: "s",
    category: "Engineering",
    detectedTopics: [],
  },
  minutes: {
    summaryPoints: [point("Hosting discussed", ["We go with Vercel"])],
    keyPoints: [],
    decisions: [point("Use Vercel", ["We go with Vercel for hosting"])],
  },
  actionItems: [
    {
      title: "Send the survey",
      assignee: "Bilal",
      dueDate: null,
      quotes: ["I will send the survey by Friday"],
    },
  ],
  ledgerItems: [],
  dissentSuggestions: null,
  ...overrides,
});

const build = (result: ExtractionResult, maxChars = 16000) =>
  buildMinutesDraft({
    result,
    rawText: RAW,
    actionItemIds: ["ai-1"],
    maxChars,
  });

describe("labelKey", () => {
  it("lowercases, trims, and collapses spaces", () => {
    expect(labelKey("  Sara   KHAN ")).toBe("sara khan");
  });
});

describe("computeCoverage", () => {
  it("covers every line of a short transcript", () => {
    expect(computeCoverage("a\nb\nc", 100)).toEqual({
      lastLine: 3,
      totalLines: 3,
    });
  });

  it("drops the line the cut lands inside", () => {
    expect(computeCoverage("aaa\nbbb\nccc", 6)).toEqual({
      lastLine: 1,
      totalLines: 3,
    });
  });

  it("keeps the line the cut ends exactly", () => {
    expect(computeCoverage("aaa\nbbb\nccc", 7)).toEqual({
      lastLine: 2,
      totalLines: 3,
    });
  });

  it("does not count a line the cut stops right before", () => {
    expect(computeCoverage("aaa\nbbb\nccc", 4)).toEqual({
      lastLine: 1,
      totalLines: 3,
    });
  });
});

describe("buildMinutesDraft", () => {
  it("orders sections and locates evidence with line and speaker", () => {
    const { draft } = build(extraction());
    expect(draft.version).toBe(1);
    expect(draft.lines.map((l) => l.section)).toEqual([
      "summary",
      "decision",
      "action_item",
    ]);
    expect(draft.lines[1].evidence).toEqual([
      {
        quote: "We go with Vercel for hosting",
        lineNumber: 1,
        speaker: "Sara Khan",
      },
    ]);
    expect(draft.lines[1].speakerLabels).toEqual(["Sara Khan"]);
    expect(draft.lines[2]).toMatchObject({
      actionItemId: "ai-1",
      assignee: "Bilal",
      supported: true,
      evidence: [{ lineNumber: 5, speaker: "Bilal" }],
    });
    expect(draft.coverage).toEqual({ lastLine: 5, totalLines: 5 });
  });

  it("stores a line whose quote is not in the transcript as unsupported", () => {
    const { draft } = build(
      extraction({
        minutes: {
          summaryPoints: [],
          keyPoints: [point("Moved to AWS", ["we will move to AWS"])],
          decisions: [],
        },
      }),
    );
    expect(draft.lines[0]).toMatchObject({
      supported: false,
      evidence: [],
      speakerLabels: [],
    });
  });

  it("picks the speaker the model named for a repeated phrase", () => {
    const named = build(
      extraction({
        minutes: {
          summaryPoints: [],
          keyPoints: [point("Agreed", ["okay agreed"], ["sara khan"])],
          decisions: [],
        },
      }),
    );
    expect(named.draft.lines[0].evidence[0]).toMatchObject({
      lineNumber: 4,
      speaker: "Sara Khan",
    });

    const unnamed = build(
      extraction({
        minutes: {
          summaryPoints: [],
          keyPoints: [point("Agreed", ["okay agreed"])],
          decisions: [],
        },
      }),
    );
    expect(unnamed.draft.lines[0].evidence[0].lineNumber).toBe(3);
  });

  it("drops a quote found only past the coverage cut", () => {
    // 60 characters reach line 2 only partly, so the model saw line 1 alone.
    const { draft } = build(
      extraction({
        minutes: {
          summaryPoints: [],
          keyPoints: [point("Survey", ["I will send the survey by Friday"])],
          decisions: [],
        },
        actionItems: [],
      }),
      60,
    );
    expect(draft.coverage).toEqual({ lastLine: 1, totalLines: 5 });
    expect(draft.lines[0].supported).toBe(false);
  });

  it("keeps at most two quotes and skips one on a line already cited", () => {
    const { draft } = build(
      extraction({
        minutes: {
          summaryPoints: [],
          keyPoints: [
            point("Vercel", [
              "We go with Vercel",
              "Vercel for hosting",
              "I am not sure about Vercel pricing",
            ]),
          ],
          decisions: [],
        },
      }),
    );
    expect(draft.lines[0].evidence.map((e) => e.lineNumber)).toEqual([1]);
  });

  it("cuts the lists to the spec caps", () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => point(`p${i}`, null));
    const { draft } = build(
      extraction({
        minutes: {
          summaryPoints: many(7),
          keyPoints: many(9),
          decisions: many(9),
        },
        actionItems: [],
      }),
    );
    const count = (s: string) =>
      draft.lines.filter((l) => l.section === s).length;
    expect(count("summary")).toBe(6);
    expect(count("key_point")).toBe(8);
    expect(count("decision")).toBe(8);
  });

  it("keeps only dissent suggestions quoted from their own speaker", () => {
    const { draft, droppedSuggestions } = build(
      extraction({
        dissentSuggestions: [
          {
            speakerLabel: "ali",
            topic: "Hosting",
            position: "Unsure about the cost",
            quote: "not sure about Vercel pricing",
            relatedDecisionIndex: 0,
          },
          {
            speakerLabel: "Bilal",
            topic: "Hosting",
            position: "Objects",
            quote: "not sure about Vercel pricing",
            relatedDecisionIndex: 0,
          },
          {
            speakerLabel: "Ali",
            topic: "Other",
            position: "x",
            quote: "okay agreed",
            relatedDecisionIndex: 7,
          },
        ],
      }),
    );
    expect(droppedSuggestions).toBe(1);
    expect(draft.dissentSuggestions).toEqual([
      {
        speakerLabel: "ali",
        topic: "Hosting",
        position: "Unsure about the cost",
        quote: "not sure about Vercel pricing",
        lineNumber: 2,
        relatedDecisionIndex: 0,
      },
      {
        speakerLabel: "Ali",
        topic: "Other",
        position: "x",
        quote: "okay agreed",
        lineNumber: 3,
        relatedDecisionIndex: null,
      },
    ]);
  });
});
