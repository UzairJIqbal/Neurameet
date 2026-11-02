import { describe, it, expect, vi, beforeEach } from "vitest";
import { queue, ok, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth, mockPdf } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/attendance-pdf", () => ({ generateAttendancePdf: mockPdf }));

import { GET } from "./route";

const call = (userId: string | null, meetingId = "m1") => {
  mockAuth.mockResolvedValue({ userId });
  return GET(
    new Request(
      `http://localhost/api/attendance/report?meetingId=${meetingId}`,
    ),
  );
};

const meeting = (user_id: string, project_id: string | null) => ({
  id: "m1",
  title: "Standup",
  status: "ended",
  started_at: null,
  ended_at: null,
  created_at: "2026-11-01T10:00:00.000Z",
  user_id,
  project_id,
});

const attendanceRow = {
  id: "a1",
  user_id: "u1",
  participant_email: null,
  participant_name: "Sara",
  session_started_at: "2026-11-01T10:00:00.000Z",
  session_ended_at: null,
  mic_toggles: 0,
  camera_toggles: 0,
  talk_time_seconds: 0,
};

describe("GET /api/attendance/report authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueues();
  });

  it("returns 401 when signed out", async () => {
    expect((await call(null)).status).toBe(401);
  });

  it("returns the PDF for the creator of a personal meeting", async () => {
    queue("meetings", ok(meeting("u1", null)));
    queue("attendance_events", ok([attendanceRow]));

    const res = await call("u1");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("returns 404 for a non creator on a personal meeting", async () => {
    queue("meetings", ok(meeting("owner", null)));

    const res = await call("stranger");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Meeting not found" });
    expect(mockPdf).not.toHaveBeenCalled();
  });

  it("returns 404 for a non member on a project meeting", async () => {
    queue("meetings", ok(meeting("owner", "p1")));
    queue("project_members", ok(null));

    const res = await call("stranger");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Meeting not found" });
    expect(mockPdf).not.toHaveBeenCalled();
  });

  it.each(["viewer", "developer"])(
    "returns 403 for a %s on a project meeting",
    async (role) => {
      queue("meetings", ok(meeting("owner", "p1")));
      queue("project_members", ok({ role }));

      expect((await call("member")).status).toBe(403);
      expect(mockPdf).not.toHaveBeenCalled();
    },
  );

  it("returns the PDF for an admin on a project meeting", async () => {
    queue("meetings", ok(meeting("owner", "p1")));
    queue("project_members", ok({ role: "admin" }));
    queue("attendance_events", ok([attendanceRow]));

    expect((await call("admin")).status).toBe(200);
  });
});
