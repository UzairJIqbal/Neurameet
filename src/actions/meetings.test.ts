import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";
import { createScheduledMeetingRow } from "./meetings";

const base = {
  streamCallId: "call_1",
  title: "Standup",
  startsAt: "2026-11-04T09:00:00Z",
};

describe("createScheduledMeetingRow (W3)", () => {
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockAuth.mockResolvedValue({ userId: "u1" });
  });

  it("refuses a Viewer and saves nothing", async () => {
    queue("project_members", ok({ role: "viewer" }));
    expect(
      await createScheduledMeetingRow({ ...base, projectId: "p1" }),
    ).toEqual({
      ok: false,
      error: "Not authorized",
    });
    expect(callsOf("meetings", "insert")).toHaveLength(0);
  });

  it("saves a Developer's meeting with the project call type", async () => {
    queue("project_members", ok({ role: "developer" }));
    queue("meetings", ok(null));
    expect(
      await createScheduledMeetingRow({ ...base, projectId: "p1" }),
    ).toEqual({
      ok: true,
      callType: "project",
    });
    expect(callsOf("meetings", "insert")[0].args[0]).toMatchObject({
      project_id: "p1",
      stream_call_type: "project",
      user_id: "u1",
    });
  });

  it("keeps a personal meeting on default", async () => {
    queue("meetings", ok(null));
    expect(await createScheduledMeetingRow(base)).toEqual({
      ok: true,
      callType: "default",
    });
    expect(callsOf("meetings", "insert")[0].args[0]).toMatchObject({
      project_id: null,
      stream_call_type: "default",
    });
  });

  it("a re schedule keeps the stored project call type and never changes it", async () => {
    queue(
      "meetings",
      ok({ id: "m1", user_id: "u1", stream_call_type: "project" }),
    );
    expect(await createScheduledMeetingRow(base)).toEqual({
      ok: true,
      callType: "project",
    });
    const [update] = callsOf("meetings", "update");
    expect(update.args[0]).not.toHaveProperty("project_id");
    expect(update.args[0]).not.toHaveProperty("stream_call_type");
  });
});
