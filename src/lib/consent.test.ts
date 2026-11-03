import { describe, it, expect } from "vitest";
import {
  CONSENT_NOTICE_VERSION,
  consentNoticeText,
  isConsentFresh,
} from "@/lib/consent";

const now = new Date("2026-11-03T10:00:00Z");
const at = (minutesAgo: number) =>
  new Date(now.getTime() - minutesAgo * 60_000).toISOString();

describe("consent notice (W3)", () => {
  it("names the project for members and says this project for guests", () => {
    expect(consentNoticeText("Core")).toContain('kept in "Core" until');
    expect(consentNoticeText()).toContain("kept in this project until");
    expect(consentNoticeText("  ")).toContain("this project");
  });

  it("is fresh for the current version within 15 minutes", () => {
    const row = {
      consented_at: at(14),
      notice_version: CONSENT_NOTICE_VERSION,
    };
    expect(isConsentFresh(row, now)).toBe(true);
  });

  it("is stale after 15 minutes", () => {
    const row = {
      consented_at: at(16),
      notice_version: CONSENT_NOTICE_VERSION,
    };
    expect(isConsentFresh(row, now)).toBe(false);
  });

  it("is not fresh for an old notice version, a missing row, or a bad date", () => {
    expect(
      isConsentFresh({ consented_at: at(1), notice_version: "w2-v0" }, now),
    ).toBe(false);
    expect(isConsentFresh(null, now)).toBe(false);
    expect(
      isConsentFresh(
        { consented_at: "nope", notice_version: CONSENT_NOTICE_VERSION },
        now,
      ),
    ).toBe(false);
  });
});
