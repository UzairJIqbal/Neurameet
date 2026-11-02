// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { queue, ok, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth, mockState } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockState: vi.fn(async () => ({
    state: "ready",
    rawText: "Ali: hi",
    hasInsights: true,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/transcript-state", () => ({ getTranscriptState: mockState }));

import { GET } from "./route";

const MEETING = "11111111-2222-4333-8444-555555555555";
const get = (id = MEETING) =>
  GET(new Request(`http://localhost/api/transcript/status?meetingId=${id}`));

describe("GET /api/transcript/status", () => {
  beforeEach(() => {
    resetQueues();
    mockState.mockClear();
    mockAuth.mockResolvedValue({ userId: "u2" });
  });

  it("keeps a personal meeting open to any signed-in caller", async () => {
    queue("meetings", ok({ id: MEETING, user_id: "u1", project_id: null }));
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).ready).toBe(true);
  });

  it("answers for an unknown meeting as before", async () => {
    expect((await get()).status).toBe(200);
    expect((await get("not-a-uuid")).status).toBe(200);
  });

  it("returns 404 to a non member on a project meeting (spec 0004)", async () => {
    queue("meetings", ok({ id: MEETING, user_id: "u1", project_id: "p1" }));
    queue("project_members", ok(null));
    const res = await get();
    expect(res.status).toBe(404);
    expect(mockState).not.toHaveBeenCalled();
  });

  it("lets a Viewer read the status (spec 0004, read)", async () => {
    queue("meetings", ok({ id: MEETING, user_id: "u1", project_id: "p1" }));
    queue("project_members", ok({ role: "viewer" }));
    expect((await get()).status).toBe(200);
  });
});
