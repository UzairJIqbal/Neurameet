import { describe, expect, it } from "vitest";
import { meetingSummaryText, summaryFileName } from "./meeting-export";

const insights = {
  summary: "We picked Redis.",
  keyPoints: ["Cache first"],
  decisions: [],
  category: null,
  detectedTopics: [],
};

describe("meetingSummaryText", () => {
  it("holds the title, summary, and key points, and skips an empty section", () => {
    const text = meetingSummaryText("Auth review", null, insights);
    expect(text).toContain("Auth review");
    expect(text).toContain("We picked Redis.");
    expect(text).toContain("- Cache first");
    expect(text).not.toContain("Decisions");
  });
});

describe("summaryFileName", () => {
  it("keeps only safe characters", () => {
    expect(summaryFileName("Q3: Auth / Review!")).toBe(
      "q3-auth-review-summary.txt",
    );
  });

  it("falls back when nothing is left, as with an Urdu title", () => {
    expect(summaryFileName("میٹنگ")).toBe("meeting-summary.txt");
  });
});
