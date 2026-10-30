import { describe, it, expect } from "vitest";
import { parseMeetingDate } from "./meeting-date";

const NOW = new Date("2026-10-30T20:00:00.000Z");

describe("parseMeetingDate (Promise Ledger AC-5)", () => {
  it("treats a missing or empty date as no date", () => {
    expect(parseMeetingDate(undefined, NOW)).toEqual({
      ok: true,
      startedAt: null,
    });
    expect(parseMeetingDate("", NOW)).toEqual({ ok: true, startedAt: null });
    expect(parseMeetingDate(null, NOW)).toEqual({ ok: true, startedAt: null });
  });

  it("turns a valid past date into noon UTC", () => {
    expect(parseMeetingDate("2026-10-01", NOW)).toEqual({
      ok: true,
      startedAt: "2026-10-01T12:00:00.000Z",
    });
  });

  it("rejects a bad format or a non string", () => {
    expect(parseMeetingDate("01/10/2026", NOW).ok).toBe(false);
    expect(parseMeetingDate("2026-10-1", NOW).ok).toBe(false);
    expect(parseMeetingDate(20261001, NOW).ok).toBe(false);
  });

  it("rejects an impossible calendar date", () => {
    expect(parseMeetingDate("2026-02-30", NOW)).toEqual({
      ok: false,
      error: "Meeting date must be a valid date (YYYY-MM-DD)",
    });
  });

  it("accepts the local today of a user ahead of UTC", () => {
    // 20:00 UTC on Oct 30 is already Oct 31 in Pakistan (UTC+5).
    expect(parseMeetingDate("2026-10-31", NOW)).toEqual({
      ok: true,
      startedAt: "2026-10-31T12:00:00.000Z",
    });
  });

  it("rejects a date in the future", () => {
    expect(parseMeetingDate("2026-11-02", NOW)).toEqual({
      ok: false,
      error: "Meeting date cannot be in the future",
    });
  });
});
