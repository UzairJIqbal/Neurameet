import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LEDGER_MATCH_TIMEOUT_MS,
  requestLedgerMatch,
} from "./ledger-match-client";

let fetchMock: ReturnType<typeof vi.fn>;

// A match request that only ends when its signal aborts, like a stalled judge.
// Like real fetch, it rejects at once when handed an already aborted signal.
const hangUntilAborted = (_url: string, init?: RequestInit) =>
  new Promise((_, reject) => {
    const abort = () =>
      reject(new DOMException("The operation was aborted.", "AbortError"));
    if (init?.signal?.aborted) abort();
    init?.signal?.addEventListener("abort", abort);
  });

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

describe("requestLedgerMatch (AC-6, AC-14)", () => {
  it("posts the meeting id and returns true when matching finished", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ matched: 2 }),
    });

    await expect(requestLedgerMatch("m1")).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ledger/match");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ meetingId: "m1" });
  });

  it("returns false when the route answers 502 (judge failed)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: "Promise matching failed" }),
    });
    await expect(requestLedgerMatch("m1")).resolves.toBe(false);
  });

  it("returns false instead of throwing on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(requestLedgerMatch("m1")).resolves.toBe(false);
  });

  it("gives up after its own 2 minute budget", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangUntilAborted);

    const pending = requestLedgerMatch("m1");
    await vi.advanceTimersByTimeAsync(LEDGER_MATCH_TIMEOUT_MS - 1);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe(false);
    expect(signal?.aborted).toBe(true);
  });

  it("ends early when the parent signal aborts (upload Cancel)", async () => {
    fetchMock.mockImplementation(hangUntilAborted);
    const parent = new AbortController();

    const pending = requestLedgerMatch("m1", parent.signal);
    parent.abort();

    await expect(pending).resolves.toBe(false);
  });

  it("returns false at once when the parent is already aborted", async () => {
    fetchMock.mockImplementation(hangUntilAborted);
    const parent = new AbortController();
    parent.abort();

    await expect(requestLedgerMatch("m1", parent.signal)).resolves.toBe(false);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    expect(signal?.aborted).toBe(true);
  });
});
