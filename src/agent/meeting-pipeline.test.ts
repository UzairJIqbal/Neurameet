import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const {
  mockClaim,
  mockMark,
  mockMatch,
  mockGenerate,
  mockClaimGen,
  mockGetState,
  mockSetState,
} = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockMark: vi.fn(),
  mockMatch: vi.fn(),
  mockGenerate: vi.fn(),
  mockClaimGen: vi.fn(),
  mockGetState: vi.fn(),
  mockSetState: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendMeetingReadyEmail: vi.fn() }));
vi.mock("@/agent/embed", () => ({ embedAndStore: vi.fn() }));
vi.mock("@/agent/ledger-match", () => ({ runLedgerMatch: mockMatch }));
vi.mock("@stream-io/node-sdk", () => ({ StreamClient: vi.fn() }));
vi.mock("@/agent/transcript-generation", () => ({
  generateTranscriptForMeeting: mockGenerate,
}));
vi.mock("@/lib/transcript-state", () => ({
  claimTranscriptGeneration: mockClaimGen,
  getTranscriptState: mockGetState,
  setTranscriptState: mockSetState,
  isPendingStale: (u: string | null, now = Date.now()) =>
    !u || now - Date.parse(u) > 6 * 60 * 1000,
  isMissingColumn: () => false,
}));
vi.mock("@/lib/pipeline-steps", async (importOriginal) => ({
  isStepStale: (await importOriginal<typeof import("@/lib/pipeline-steps")>())
    .isStepStale,
  claimPipelineStep: mockClaim,
  markPipelineStep: mockMark,
  stepStart: () => new Date().toISOString(),
}));

import {
  maybeRunLedgerMatch,
  runServerPipeline,
  settleRecordings,
  SETTLE_CAP_MS,
  SETTLE_QUIET_MS,
  sweepActionFor,
  type ServerRunDeps,
} from "./meeting-pipeline";

// Each table answers with the rows given; a builder resolves on limit or
// maybeSingle.
function client(rows: Record<string, unknown>): SupabaseClient {
  return {
    from: (table: string) => {
      const value = rows[table];
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: async () => ({ data: value ?? [], error: null }),
        maybeSingle: async () => ({ data: value ?? null, error: null }),
        upsert: async () => ({ error: null }),
        then: (resolve: (r: { data: unknown; error: null }) => void) =>
          resolve({ data: value ?? [], error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const ready = {
  meeting_insights: [{ meeting_id: "m1" }],
  meeting_chunks: [{ meeting_id: "m1" }],
  meetings: { user_id: "u1", project_id: null },
  transcripts: { raw_text: "Ali: main Friday tak bhej dunga" },
};

describe("maybeRunLedgerMatch", () => {
  beforeEach(() => {
    mockClaim.mockReset().mockResolvedValue(true);
    mockMark.mockReset();
    mockMatch.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("waits until both the summary and the chunks exist", async () => {
    await maybeRunLedgerMatch(
      client({ ...ready, meeting_chunks: [] }),
      "m1",
      "page",
    );
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockMatch).not.toHaveBeenCalled();
  });

  it("claims without allowing a rerun, matches, and marks done", async () => {
    await maybeRunLedgerMatch(client(ready), "m1", "webhook");
    expect(mockClaim).toHaveBeenCalledWith(
      expect.anything(),
      "m1",
      "ledger",
      false,
    );
    expect(mockMatch).toHaveBeenCalledWith(expect.anything(), {
      meetingId: "m1",
      userId: "u1",
      projectId: null,
      rawText: ready.transcripts.raw_text,
    });
    expect(mockMark.mock.calls[0][3]).toMatchObject({ status: "done" });
    expect(mockMark.mock.calls[0][4]).toBe("webhook");
  });

  it("skips when another run already holds the step", async () => {
    mockClaim.mockResolvedValue(false);
    await maybeRunLedgerMatch(client(ready), "m1");
    expect(mockMatch).not.toHaveBeenCalled();
  });

  it("marks failed and never throws when matching fails", async () => {
    mockMatch.mockRejectedValue(new Error("judge down"));
    await expect(
      maybeRunLedgerMatch(client(ready), "m1"),
    ).resolves.toBeUndefined();
    expect(mockMark.mock.calls[0][3]).toMatchObject({
      status: "failed",
      reason: "error",
    });
  });
});

// A fake clock: sleep moves time forward instead of waiting.
function fakeDeps(
  counts: number[],
): Required<ServerRunDeps> & { t: { now: number } } {
  const t = { now: 0 };
  let i = 0;
  return {
    t,
    now: () => t.now,
    sleep: async (ms: number) => {
      t.now += ms;
    },
    countRecordings: async () => counts[Math.min(i++, counts.length - 1)],
  };
}

const callRow = {
  id: "m1",
  stream_call_id: "call-1",
  stream_call_type: "default",
};
const twoPeople = {
  attendance_events: [
    { user_id: "u1", stream_user_id: "u1" },
    { user_id: "u2", stream_user_id: null },
    { user_id: "u1", stream_user_id: "u1" },
  ],
};

describe("settleRecordings", () => {
  it("stops as soon as every expected track is listed", async () => {
    const deps = fakeDeps([1, 2]);
    const count = await settleRecordings(client(twoPeople), callRow, deps);
    expect(count).toBe(2);
    expect(deps.t.now).toBe(5_000);
  });

  it("stops after the quiet window when a track never arrives", async () => {
    const deps = fakeDeps([1]);
    await settleRecordings(client(twoPeople), callRow, deps);
    expect(deps.t.now).toBe(SETTLE_QUIET_MS);
  });

  it("stops at the cap when nothing is listed", async () => {
    const deps = fakeDeps([0]);
    expect(await settleRecordings(client(twoPeople), callRow, deps)).toBe(0);
    expect(deps.t.now).toBe(SETTLE_CAP_MS);
  });
});

describe("runServerPipeline", () => {
  const meeting = {
    id: "m1",
    user_id: "u1",
    project_id: null,
    title: "Standup",
    started_at: null,
    created_at: null,
    stream_call_id: "call-1",
    stream_call_type: "default",
  };
  const rows = { meetings: meeting, ...twoPeople };

  beforeEach(() => {
    mockMark.mockReset();
    mockGenerate.mockReset();
    mockClaimGen.mockReset().mockResolvedValue(true);
    mockSetState.mockReset();
    mockGetState.mockReset().mockResolvedValue({
      state: "not_started",
      rawText: "",
      hasInsights: false,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("skips a meeting that already has a summary", async () => {
    mockGetState.mockResolvedValue({
      state: "ready",
      rawText: "x",
      hasInsights: true,
    });
    const out = await runServerPipeline(client(rows), "m1", {
      deps: fakeDeps([2]),
    });
    expect(out).toBe("skipped");
    expect(mockClaimGen).not.toHaveBeenCalled();
  });

  it("leaves the run to whoever holds the claim", async () => {
    mockClaimGen.mockResolvedValue(false);
    const out = await runServerPipeline(client(rows), "m1", {
      deps: fakeDeps([2]),
    });
    expect(out).toBe("busy");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("stores no_recording and never marks the recording done", async () => {
    mockGenerate.mockResolvedValue({
      status: "no_recording",
      message: "later",
    });
    const out = await runServerPipeline(client(rows), "m1", {
      deps: fakeDeps([2]),
    });
    expect(out).toBe("no_recording");
    expect(mockSetState).toHaveBeenCalledWith(
      expect.anything(),
      "m1",
      "no_recording",
    );
    expect(mockMark.mock.calls.map((c) => c[3].status)).toEqual(["running"]);
  });

  it("generates as the owner with the webhook deadline", async () => {
    mockGenerate.mockResolvedValue({ status: "too_short" });
    await runServerPipeline(client(rows), "m1", {
      startedAt: 0,
      deps: fakeDeps([2]),
    });
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        enforceOwner: false,
        deadline: 280_000,
        source: "webhook",
      }),
    );
  });

  it("saves the transcript and stops when too little time is left for AI", async () => {
    const deps = fakeDeps([2]);
    mockGenerate.mockImplementation(async () => {
      deps.t.now = 200_000;
      return { status: "ok", transcript: "Ali: hello" };
    });
    const out = await runServerPipeline(client(rows), "m1", {
      startedAt: 0,
      deps,
    });
    expect(out).toBe("transcript_only");
    expect(mockSetState).not.toHaveBeenCalled();
  });

  it("marks the transcript failed and never throws when generation throws", async () => {
    mockGenerate.mockRejectedValue(new Error("stream down"));
    const out = await runServerPipeline(client(rows), "m1", {
      deps: fakeDeps([2]),
    });
    expect(out).toBe("failed");
    expect(mockSetState).toHaveBeenCalledWith(
      expect.anything(),
      "m1",
      "failed",
    );
  });
});

describe("sweepActionFor", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const old = "2026-11-15T10:00:00Z";
  const base = {
    meeting_id: "m1",
    processing_state: "ready",
    raw_text: "Ali: hi",
    updated_at: old,
    pipeline: null,
  };
  const all = { insights: true, chunks: true };

  it("regenerates a stale pending transcript", () => {
    expect(
      sweepActionFor(
        { ...base, processing_state: "pending", raw_text: null },
        all,
        now,
      ),
    ).toBe("regenerate");
  });

  it("processes a ready transcript with no summary", () => {
    expect(sweepActionFor(base, { insights: false, chunks: false }, now)).toBe(
      "process",
    );
  });

  it("embeds when the summary exists but the chat index does not", () => {
    expect(sweepActionFor(base, { insights: true, chunks: false }, now)).toBe(
      "embed",
    );
  });

  it("reruns a failed or stale ledger match", () => {
    const failed = {
      steps: { ledger: { status: "failed" as const, startedAt: old } },
    };
    const stale = {
      steps: { ledger: { status: "running" as const, startedAt: old } },
    };
    expect(sweepActionFor({ ...base, pipeline: failed }, all, now)).toBe(
      "ledger",
    );
    expect(sweepActionFor({ ...base, pipeline: stale }, all, now)).toBe(
      "ledger",
    );
  });

  it("leaves finished, empty, and failed transcripts alone", () => {
    expect(sweepActionFor(base, all, now)).toBeNull();
    expect(
      sweepActionFor(
        { ...base, processing_state: "no_recording", raw_text: "" },
        all,
        now,
      ),
    ).toBeNull();
  });
});
