import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLedger, localToday, reviewLedgerLink } from "./ledger-client";

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("localToday (AC-10)", () => {
  it("returns the viewer's local calendar date as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 30));
    expect(localToday()).toBe("2026-01-05");
  });
});

describe("fetchLedger", () => {
  it("sends the meeting id and the local today, and returns the body", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 9, 0));
    const body = { items: [], incoming: [], reversalCount: 0 };
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    const result = await fetchLedger("m 1");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/ledger?meetingId=m+1&today=2026-10-30",
    );
    expect(result).toEqual(body);
  });

  it("throws the route's error message when the load fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { error: "Meeting not found" }),
    );
    await expect(fetchLedger("m1")).rejects.toThrow("Meeting not found");
  });

  it("throws a status message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });
    await expect(fetchLedger("m1")).rejects.toThrow("Ledger failed: 500");
  });
});

describe("reviewLedgerLink (AC-9)", () => {
  it("posts the decision to the encoded link route and returns true", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { id: "a/b", state: "confirmed" }),
    );

    const ok = await reviewLedgerLink("a/b", "confirm");

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ledger/links/a%2Fb/review");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ decision: "confirm" });
  });

  it("returns false and logs when the route refuses", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "Link not found" }));
    await expect(reviewLedgerLink("x", "reject")).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "[ledger] review failed:",
      "Link not found",
    );
  });

  it("returns false instead of throwing on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(reviewLedgerLink("x", "reset")).resolves.toBe(false);
  });
});
