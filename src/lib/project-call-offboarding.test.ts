import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ok,
  queue,
  resetQueues,
  client,
  calls,
} from "@/test/supabase-queue-mock";

const { mockCall, mockRemove, mockKick } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_STREAM_API_KEY = "key";
  process.env.STREAM_SECRET_KEY = "secret";
  return { mockCall: vi.fn(), mockRemove: vi.fn(), mockKick: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: vi.fn(function () {
    return { video: { call: mockCall } };
  }),
}));

import {
  LIVE_CALL_SCAN_LIMIT,
  removeFromLiveProjectCalls,
} from "@/lib/project-call-offboarding";

const run = () => removeFromLiveProjectCalls(client as never, "p1", "u2");

describe("removeFromLiveProjectCalls (W3, AC-30)", () => {
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockRemove.mockResolvedValue({});
    mockKick.mockResolvedValue({});
    mockCall.mockReturnValue({
      updateCallMembers: mockRemove,
      kickUser: mockKick,
    });
  });

  it("filters to the project's live project calls, newest first, capped", async () => {
    queue("meetings", ok([]));
    await run();
    const args = calls
      .filter((c) => c.table === "meetings")
      .map((c) => [c.method, ...c.args]);
    expect(args).toEqual(
      expect.arrayContaining([
        ["eq", "project_id", "p1"],
        ["eq", "stream_call_type", "project"],
        ["neq", "status", "ended"],
        ["order", "started_at", { ascending: false }],
        ["limit", LIVE_CALL_SCAN_LIMIT],
      ]),
    );
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("removes and kicks the user on every live call", async () => {
    queue("meetings", ok([{ stream_call_id: "c1" }, { stream_call_id: "c2" }]));
    await run();
    expect(mockCall).toHaveBeenCalledWith("project", "c1");
    expect(mockCall).toHaveBeenCalledWith("project", "c2");
    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(mockRemove).toHaveBeenCalledWith({ remove_members: ["u2"] });
    expect(mockKick).toHaveBeenCalledWith({ user_id: "u2" });
  });

  it("keeps going and never throws when Stream fails", async () => {
    queue("meetings", ok([{ stream_call_id: "c1" }, { stream_call_id: "c2" }]));
    mockRemove.mockRejectedValueOnce(new Error("stream down"));
    mockKick.mockRejectedValue(new Error("not in call"));
    await expect(run()).resolves.toBeUndefined();
    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
  });

  it("logs when the cap is reached", async () => {
    const rows = Array.from({ length: LIVE_CALL_SCAN_LIMIT }, (_, i) => ({
      stream_call_id: `c${i}`,
    }));
    queue("meetings", ok(rows));
    await run();
    expect(console.warn).toHaveBeenCalled();
  });

  it("never throws when the lookup fails", async () => {
    queue("meetings", { data: null, error: { message: "db down" } });
    await expect(run()).resolves.toBeUndefined();
    expect(mockCall).not.toHaveBeenCalled();
  });
});
