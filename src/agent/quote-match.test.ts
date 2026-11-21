import { describe, it, expect } from "vitest";
import {
  findQuoteLine,
  findQuoteLines,
  stripSpeakerPrefix,
} from "./quote-match";

const transcript = [
  "Sara: Let's start with the hosting question.",
  "Ali: main   Friday tak survey bhej dunga",
  "Sara: ہم Vercel استعمال کریں گے",
  "Bilal: We decided to go with Vercel for hosting.",
].join("\n");

describe("findQuoteLine", () => {
  it("finds Roman Urdu despite extra spaces and case", () => {
    expect(findQuoteLine(transcript, "MAIN friday TAK  survey")).toEqual({
      lineNumber: 2,
      speaker: "Ali",
    });
  });

  it("finds Urdu script", () => {
    expect(
      findQuoteLine(transcript, "Vercel استعمال کریں گے")?.lineNumber,
    ).toBe(3);
  });

  it("ignores a speaker label the model left in the quote", () => {
    expect(
      findQuoteLine(transcript, "Bilal: We decided to go with Vercel")
        ?.lineNumber,
    ).toBe(4);
  });

  it("returns null when the quote is not in the transcript", () => {
    expect(findQuoteLine(transcript, "we will move to AWS")).toBeNull();
  });

  it("rejects a near empty quote", () => {
    expect(findQuoteLine(transcript, "a")).toBeNull();
  });
});

describe("findQuoteLines", () => {
  const repeated =
    "Ali: we agree on Vercel\nSara: ok then\nSara: we agree on Vercel";

  it("returns every matching line in order with its speaker", () => {
    expect(findQuoteLines(repeated, "We agree on   VERCEL")).toEqual([
      { lineNumber: 1, speaker: "Ali" },
      { lineNumber: 3, speaker: "Sara" },
    ]);
  });

  it("strips a speaker prefix from the quote", () => {
    expect(findQuoteLines(repeated, "Sara: ok then")).toEqual([
      { lineNumber: 2, speaker: "Sara" },
    ]);
  });

  it("returns an empty list for a too short or missing quote", () => {
    expect(findQuoteLines(repeated, "a")).toEqual([]);
    expect(findQuoteLines(repeated, "we pick AWS")).toEqual([]);
  });
});

describe("stripSpeakerPrefix", () => {
  it("does not treat a time as a speaker", () => {
    expect(stripSpeakerPrefix("10:30 works for me")).toBe("10:30 works for me");
  });
});
