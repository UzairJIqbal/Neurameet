// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateAttendancePdf, type ReportMeeting } from "./attendance-pdf";
import type { AttendanceRow } from "./meeting-types";

const meeting: ReportMeeting = {
  title: "ملاقات — Weekly sync",
  status: "ended",
  startedAt: "2026-01-01T10:00:00Z",
  createdAt: "2026-01-01T10:00:00Z",
};

const row = (participantName: string): AttendanceRow => ({
  id: participantName,
  userId: "u1",
  participantEmail: null,
  participantName,
  sessionStartedAt: "2026-01-01T10:00:00Z",
  sessionEndedAt: "2026-01-01T10:30:00Z",
  micToggles: 1,
  cameraToggles: 0,
  talkTimeSeconds: 60,
});

describe("generateAttendancePdf", () => {
  it("renders names Helvetica cannot encode instead of throwing", async () => {
    const pdf = await generateAttendancePdf(meeting, [
      row("عزیر اقبال"),
      row("Łukasz 🎉"),
      row("Plain Name"),
    ]);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
