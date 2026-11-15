import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const { pending, mockRun, meetingRow } = vi.hoisted(() => ({
  pending: [] as Array<() => Promise<void>>,
  mockRun: vi.fn(),
  meetingRow: { value: null as { id: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => {
    pending.push(fn);
  },
}));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: meetingRow.value, error: null }),
      };
      return builder;
    },
  }),
}));
vi.mock("@/agent/meeting-pipeline", () => ({ runServerPipeline: mockRun }));

import { POST } from "./route";

const SECRET = "test-secret";

function request(body: unknown, signature?: string): Request {
  const raw = JSON.stringify(body);
  const sig =
    signature ?? createHmac("sha256", SECRET).update(raw).digest("hex");
  return new Request("http://localhost/api/stream/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig },
    body: raw,
  });
}

const ready = {
  type: "call.recording_ready",
  call_cid: "default:call-1",
  call_recording: { filename: "rec.mp4" },
};

describe("POST /api/stream/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_STREAM_API_KEY", "key");
    vi.stubEnv("STREAM_SECRET_KEY", SECRET);
    pending.length = 0;
    meetingRow.value = { id: "m1" };
    mockRun.mockReset().mockResolvedValue("done");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a bad signature with 401 and starts nothing", async () => {
    const res = await POST(request(ready, "bad"));
    expect(res.status).toBe(401);
    expect(pending).toHaveLength(0);
  });

  it("answers 200 with no work for other event types", async () => {
    const res = await POST(
      request({ type: "call.ended", call_cid: "default:call-1" }),
    );
    expect(res.status).toBe(200);
    expect(pending).toHaveLength(0);
  });

  it("answers 200 with no work for an unknown call", async () => {
    meetingRow.value = null;
    const res = await POST(request(ready));
    expect(res.status).toBe(200);
    expect(pending).toHaveLength(0);
  });

  it("answers 200 first, then runs the server pipeline", async () => {
    const res = await POST(request(ready));
    expect(res.status).toBe(200);
    expect(mockRun).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);
    await pending[0]();
    expect(mockRun).toHaveBeenCalledWith(
      expect.anything(),
      "m1",
      expect.objectContaining({ source: "webhook" }),
    );
  });
});
