import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth, mockDeleteCall } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_STREAM_API_KEY = "key";
  process.env.STREAM_SECRET_KEY = "secret";
  return { mockAuth: vi.fn(), mockDeleteCall: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: vi.fn(function () {
    return { video: { deleteCall: mockDeleteCall, call: vi.fn() } };
  }),
}));

import { DELETE, GET } from "./route";

const ctx = { params: Promise.resolve({ callId: "call_1" }) };
const as = (userId: string | null) => mockAuth.mockResolvedValue({ userId });

describe("/api/meetings/by-call/[callId]", () => {
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockDeleteCall.mockResolvedValue({});
  });

  it("GET returns the meeting id and call type, no project details", async () => {
    as("u1");
    queue("meetings", ok({ id: "m1", stream_call_type: "default" }));
    const res = await GET(new Request("http://localhost"), ctx);
    expect(await res.json()).toEqual({ meetingId: "m1", callType: "default" });
  });

  it("GET returns the project call type for a project meeting", async () => {
    as("u1");
    queue("meetings", ok({ id: "m1", stream_call_type: "project" }));
    const res = await GET(new Request("http://localhost"), ctx);
    expect(await res.json()).toEqual({ meetingId: "m1", callType: "project" });
  });

  it("GET returns 404 when the call has no meeting row", async () => {
    as("u1");
    queue("meetings", ok(null));
    expect((await GET(new Request("http://localhost"), ctx)).status).toBe(404);
  });

  it("DELETE keeps the personal 403 for a non creator", async () => {
    as("u2");
    queue("meetings", ok({ id: "m1", user_id: "owner", project_id: null }));
    const res = await DELETE(new Request("http://localhost"), ctx);
    expect(res.status).toBe(403);
    expect(mockDeleteCall).not.toHaveBeenCalled();
  });

  it("DELETE refuses a project Admin who created the call", async () => {
    as("owner");
    queue("meetings", ok({ id: "m1", user_id: "owner", project_id: "p1" }));
    queue("project_members", ok({ role: "admin" }));
    expect((await DELETE(new Request("http://localhost"), ctx)).status).toBe(
      403,
    );
    expect(mockDeleteCall).not.toHaveBeenCalled();
  });

  it("DELETE lets the project Owner delete", async () => {
    as("u9");
    queue(
      "meetings",
      ok({ id: "m1", user_id: "owner", project_id: "p1" }),
      ok(null),
    );
    queue("project_members", ok({ role: "owner" }));
    expect((await DELETE(new Request("http://localhost"), ctx)).status).toBe(
      200,
    );
    expect(mockDeleteCall).toHaveBeenCalled();
  });
});
