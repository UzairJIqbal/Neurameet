/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { AttendanceRow, MeetingDetailData } from "@/lib/meeting-types";
import { generateAttendancePdf } from "@/lib/attendance-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MeetingRow {
  id: string;
  title: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  user_id: string;
}

interface AttendanceDbRow {
  id: string;
  user_id: string;
  participant_email: string | null;
  participant_name: string | null;
  session_started_at: string;
  session_ended_at: string | null;
  mic_toggles: number;
  camera_toggles: number;
  talk_time_seconds: number;
}

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meetingId = new URL(request.url).searchParams.get("meetingId");

  if (!meetingId) {
    return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
  }

  try {
    const supabase = supabaseServer();

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, title, status, started_at, ended_at, created_at, user_id")
      .eq("id", meetingId)
      .eq("user_id", userId)
      .single();

    if (meetingError || !meeting) {
      console.error("Attendance report: meeting not found:", meetingError);
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const { data: rows, error: rowsError } = await supabase
      .from("attendance_events")
      .select(
        "id, user_id, participant_email, participant_name, session_started_at, session_ended_at, mic_toggles, camera_toggles, talk_time_seconds",
      )
      .eq("meeting_id", meetingId)
      .order("participant_name", { ascending: true })
      .order("session_started_at", { ascending: true });

    if (rowsError) {
      console.error("Attendance report: failed to load rows:", rowsError);
      return NextResponse.json(
        { error: "Failed to load attendance" },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "No attendance data" },
        { status: 404 },
      );
    }

    const m = meeting as MeetingRow;
    const meetingData: MeetingDetailData = {
      id: m.id,
      title: m.title,
      status: m.status,
      streamCallId: "",
      startedAt: m.started_at,
      endedAt: m.ended_at,
      createdAt: m.created_at,
      user_id: m.user_id,
      guestAdmissionMode: "approval",
    };

    const attendance: AttendanceRow[] = (rows as AttendanceDbRow[]).map((r) => ({
      id: r.id,
      userId: r.user_id,
      participantEmail: r.participant_email,
      participantName: r.participant_name,
      sessionStartedAt: r.session_started_at,
      sessionEndedAt: r.session_ended_at,
      micToggles: r.mic_toggles,
      cameraToggles: r.camera_toggles,
      talkTimeSeconds: r.talk_time_seconds,
    }));

    const pdf = await generateAttendancePdf(meetingData, attendance);
    const buffer = Buffer.from(pdf);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="attendance-report-${meetingId}.pdf"`,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate attendance report";
    console.error("Attendance report error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
