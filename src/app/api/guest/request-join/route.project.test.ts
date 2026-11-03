// @vitest-environment node
//
// W3: the recording notice gate and the call type on POST /api/guest/request-join.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { queue, ok, resetQueues } from "@/test/supabase-queue-mock";

const {
  mockCreatePending,
  mockResolveMint,
  mockAdmit,
  mockExpire,
  mockCreateGuest,
  mockUpdate,
  mockCall,
  mockSend,
} = vi.hoisted(() => ({
  mockCreatePending: vi.fn(),
  mockResolveMint: vi.fn(async () => {}),
  mockAdmit: vi.fn(async () => true),
  mockExpire: vi.fn(async () => true),
  mockCreateGuest: vi.fn(),
  mockUpdate: vi.fn(),
  mockCall: vi.fn(),
  mockSend: vi.fn(async () => ({})),
}));

vi.mock("server-only", () => ({}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/guest-store", () => ({
  createPending: mockCreatePending,
  resolveMint: mockResolveMint,
  rejectMint: vi.fn(async () => {}),
  admit: mockAdmit,
  expireGuest: mockExpire,
}));
vi.mock("@stream-io/video-client", () => ({
  StreamVideoClient: class {
    createGuestUser = mockCreateGuest;
  },
}));
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: class {
    video = { sendCallEvent: mockSend, call: mockCall };
  },
}));

import { POST } from "./route";

const post = (extra: Record<string, unknown> = {}) =>
  POST(
    new Request("http://localhost/api/guest/request-join", {
      method: "POST",
      body: JSON.stringify({
        meetingId: "call-1",
        name: "Guest Person",
        request_nonce: "n1",
        ...extra,
      }),
    }) as never,
  );

const projectRow = (mode: "approval" | "open") =>
  ok({
    guest_admission_mode: mode,
    project_id: "p1",
    stream_call_type: "project",
  });

describe("POST /api/guest/request-join (W3)", () => {
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreatePending.mockResolvedValue({
      guest: { guest_token: "gt", name: "Guest Person" },
      isNew: true,
      mintPromise: Promise.resolve(null),
    });
    mockCreateGuest.mockResolvedValue({
      user: { id: "guest-abc", name: "Guest Person" },
      access_token: "tok",
    });
    mockUpdate.mockResolvedValue({});
    mockCall.mockReturnValue({ updateCallMembers: mockUpdate });
  });

  it("returns 400 consent_required on a project meeting without the tick, before any mint", async () => {
    queue("meetings", projectRow("approval"));
    const res = await post();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Please accept the recording notice",
      code: "consent_required",
    });
    expect(mockCreatePending).not.toHaveBeenCalled();
    expect(mockCreateGuest).not.toHaveBeenCalled();
  });

  it("stores the consent time and returns the project call type", async () => {
    queue("meetings", projectRow("approval"));
    const res = await post({ consented: true });
    expect(res.status).toBe(200);
    expect((await res.json()).callType).toBe("project");
    expect(mockCreatePending.mock.calls[0][0].consented_at).toEqual(
      expect.any(String),
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "project" }),
    );
  });

  it("keeps a personal meeting on default with no consent needed", async () => {
    queue(
      "meetings",
      ok({ guest_admission_mode: "approval", project_id: null }),
    );
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).callType).toBe("default");
    expect(mockCreatePending.mock.calls[0][0].consented_at).toBeNull();
  });

  it("open mode adds the guest as a call member, then admits", async () => {
    queue("meetings", projectRow("open"));
    const res = await post({ consented: true });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      update_members: [{ user_id: "guest-abc", role: "call_member" }],
    });
    expect(mockAdmit).toHaveBeenCalledWith("gt");
  });

  it("open mode returns 502 and expires the guest when Stream fails", async () => {
    queue("meetings", projectRow("open"));
    mockUpdate.mockRejectedValue(new Error("stream down"));
    const res = await post({ consented: true });
    expect(res.status).toBe(502);
    expect(mockExpire).toHaveBeenCalledWith("gt");
    expect(mockAdmit).not.toHaveBeenCalled();
  });

  it("fails closed when the meeting lookup errors", async () => {
    queue("meetings", { data: null, error: { message: "db down" } });
    expect((await post({ consented: true })).status).toBe(500);
    expect(mockCreatePending).not.toHaveBeenCalled();
  });
});
