import { describe, it, expect } from "vitest";
import { answerLabel, generateMinutesPdf, toPdfSafe } from "./minutes-pdf";

describe("toPdfSafe", () => {
  it("replaces characters the font can't draw and collapses whitespace", () => {
    const supported = new Set(
      Array.from("Hi there", (c) => c.codePointAt(0) ?? 0),
    );
    expect(toPdfSafe("Hi\n  there", supported)).toEqual({
      text: "Hi there",
      replaced: false,
    });
    expect(toPdfSafe("Hi ہاں", supported)).toEqual({
      text: "Hi ???",
      replaced: true,
    });
  });
});

describe("answerLabel", () => {
  it("names the answer and keeps the note and the late flag", () => {
    expect(
      answerLabel({
        displayName: "Ali",
        action: "confirm",
        note: null,
        late: false,
      }),
    ).toBe("Confirmed by Ali");
    expect(
      answerLabel({
        displayName: "Ali",
        action: "correct",
        note: "Tuesday",
        late: true,
      }),
    ).toBe("Correction by Ali (late): Tuesday");
    expect(
      answerLabel({
        displayName: "Ali",
        action: "view",
        note: "I objected",
        late: false,
      }),
    ).toBe("Recorded view of Ali: I objected");
  });
});

describe("generateMinutesPdf", () => {
  it("builds a PDF even with Urdu text", async () => {
    const bytes = await generateMinutesPdf({
      title: "Weekly",
      date: "2026-11-02",
      coverageText: "These minutes cover transcript lines 1 to 2 of 2",
      fromRecording: true,
      statusText: "Confirmed by 1 of 2. 1 did not respond.",
      hash: "a".repeat(64),
      verifyUrl: "http://localhost/minutes/verify/x",
      sealedAt: "2026-11-04T08:00:00Z",
      lines: [
        {
          section: "decision",
          text: "Use Vercel, فیصلہ ہو گیا",
          evidence: [
            { quote: "We go with Vercel", lineNumber: 1, speaker: "Sara" },
          ],
          supported: true,
          assignee: null,
          answers: [
            {
              displayName: "Ali",
              action: "view",
              note: "I objected",
              late: false,
            },
          ],
        },
      ],
    });
    expect(bytes.length).toBeGreaterThan(500);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
