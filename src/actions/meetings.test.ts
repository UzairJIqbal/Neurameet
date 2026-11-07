import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAfter, mockAuth, mockNotify } = vi.hoisted(() => ({
  mockAfter: vi.fn((run: () => unknown) => run()),
  mockAuth: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mockAfter,
}));
vi.mock("@/lib/notification-events", () => ({
  notifyMeetingScheduled: mockNotify,
}));
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

  describe("schedule details (W8 AC-70u)", () => {
    const existingRow = {
      id: "m1",
      user_id: "u1",
      stream_call_type: "project",
      project_id: "p1",
      started_at: "2026-11-04T09:00:00+00:00",
      invited_user_ids: ["u2"],
    };

    it("stores the new fields and sends a notice for a new project meeting", async () => {
      queue(
        "project_members",
        ok({ role: "developer" }),
        ok([{ user_id: "u2" }]),
      );
      queue("meetings", ok(null), ok({ id: "m9" }));
      const result = await createScheduledMeetingRow({
        ...base,
        projectId: "p1",
        description: "  Weekly check  ",
        scheduledEndAt: "2026-11-04T09:30:00Z",
        meetingType: "standup",
        invitedUserIds: ["u2", "u2"],
      });
      expect(result).toEqual({ ok: true, callType: "project" });
      expect(callsOf("meetings", "insert")[0].args[0]).toMatchObject({
        description: "Weekly check",
        scheduled_end_at: "2026-11-04T09:30:00Z",
        meeting_type: "standup",
        invited_user_ids: ["u2"],
      });
      expect(mockNotify).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          meetingId: "m9",
          projectId: "p1",
          invitedUserIds: ["u2"],
          schedulerId: "u1",
        }),
      );
    });

    it("rejects an invited id who left the project and saves nothing", async () => {
      queue(
        "project_members",
        ok({ role: "developer" }),
        ok([{ user_id: "u2" }]),
      );
      queue("meetings", ok(null));
      const result = await createScheduledMeetingRow({
        ...base,
        projectId: "p1",
        invitedUserIds: ["u2", "gone"],
      });
      expect(result.ok).toBe(false);
      expect(callsOf("meetings", "insert")).toHaveLength(0);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("never writes meeting_participants", async () => {
      queue(
        "project_members",
        ok({ role: "developer" }),
        ok([{ user_id: "u2" }]),
      );
      queue("meetings", ok(null), ok({ id: "m9" }));
      await createScheduledMeetingRow({
        ...base,
        projectId: "p1",
        invitedUserIds: ["u2"],
      });
      expect(callsOf("meeting_participants", "insert")).toHaveLength(0);
      expect(callsOf("meeting_participants", "upsert")).toHaveLength(0);
    });

    it("a title edit at the same instant sends no notice", async () => {
      queue("project_members", ok({ role: "developer" }));
      queue("meetings", ok(existingRow), ok({ id: "m1" }));
      await createScheduledMeetingRow({ ...base, title: "Renamed" });
      expect(callsOf("meetings", "update")[0].args[0]).toMatchObject({
        title: "Renamed",
      });
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("a new start time sends one, to the stored list", async () => {
      queue("project_members", ok({ role: "developer" }));
      queue("meetings", ok(existingRow), ok({ id: "m1" }));
      await createScheduledMeetingRow({
        ...base,
        startsAt: "2026-11-05T09:00:00Z",
      });
      expect(mockNotify).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ meetingId: "m1", invitedUserIds: ["u2"] }),
      );
    });

    it("refuses a re schedule from someone no longer in the meeting's project", async () => {
      queue("project_members", ok(null));
      queue("meetings", ok(existingRow));
      expect(
        await createScheduledMeetingRow({
          ...base,
          startsAt: "2026-11-05T09:00:00Z",
        }),
      ).toEqual({ ok: false, error: "Not authorized" });
      expect(callsOf("meetings", "update")).toHaveLength(0);
    });

    it("rejects an end time before the start, and an unknown type", async () => {
      expect(
        (
          await createScheduledMeetingRow({
            ...base,
            scheduledEndAt: "2026-11-04T08:00:00Z",
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await createScheduledMeetingRow({
            ...base,
            meetingType: "party" as never,
          })
        ).ok,
      ).toBe(false);
    });

    it("rejects a description over 1000 characters", async () => {
      expect(
        (
          await createScheduledMeetingRow({
            ...base,
            description: "x".repeat(1001),
          })
        ).ok,
      ).toBe(false);
    });

    it("a personal meeting ignores the invited list", async () => {
      queue("meetings", ok(null), ok({ id: "m9" }));
      await createScheduledMeetingRow({ ...base, invitedUserIds: ["u2"] });
      expect(callsOf("meetings", "insert")[0].args[0]).not.toHaveProperty(
        "invited_user_ids",
      );
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });
});
