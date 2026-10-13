/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  ActionItem,
  GuestAdmissionMode,
  MeetingDetailData,
  MeetingDetailResponse,
  MeetingInsights,
} from "@/lib/meeting-types";

interface InsightsRow {
  summary: string | null;
  key_points: string[] | null;
  decisions: string[] | null;
  category: string | null;
  detected_topics: string[] | null;
}

interface ActionItemRow {
  id: string;
  title: string;
  assignee: string | null;
  due_date: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = supabaseServer();

    // Scope check: the meeting must exist and the caller must be the owner OR
    // a recorded participant. This mirrors the lenient ownership rule in
    // /api/transcript/upload and /api/ai/embed — a participant may view a
    // meeting they attended under a different Clerk account than the creator,
    // so a strict owner-only check would wrongly 404 the detail fetch (and
    // surface "Meeting not found" on the page) even though upload/embed
    // already authorized the same caller.
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, title, status, stream_call_id, started_at, ended_at, created_at, user_id, guest_admission_mode")
      .eq("id", id)
      .single();

    if (meetingError || !meeting) {
      console.error("Meeting not found:", meetingError);
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    if (meeting.user_id !== userId) {
      const { data: part } = await supabase
        .from("attendance_events")
        .select("user_id")
        .eq("meeting_id", meeting.id)
        .eq("user_id", userId)
        .limit(1);
      if (!part || part.length === 0) {
        // Guests may have a NULL user_id in attendance_events;
        // match on stream_user_id (the guest's Stream identity).
        const { data: guestPart } = await supabase
          .from("attendance_events")
          .select("user_id")
          .eq("meeting_id", meeting.id)
          .eq("stream_user_id", userId)
          .limit(1);
        if (!guestPart || guestPart.length === 0) {
          // Finally, fallback to participant_email (for guests identified by email).
          const { data: emailPart } = await supabase
            .from("attendance_events")
            .select("user_id")
            .eq("meeting_id", meeting.id)
            .eq("participant_email", userId)
            .limit(1);
          if (!emailPart || emailPart.length === 0) {
            console.error("Meeting not authorized for user:", userId);
            return NextResponse.json(
              { error: "Meeting not found" },
              { status: 404 },
            );
          }
        }
      }
    }

    const [
      { data: insights },
      { data: actionItems },
      { count: attendanceCount },
    ] = await Promise.all([
      supabase
        .from("meeting_insights")
        .select("summary, key_points, decisions, category, detected_topics")
        .eq("meeting_id", id)
        .single(),
      supabase
        .from("action_items")
        .select("id, title, assignee, due_date")
        .eq("meeting_id", id),
      supabase
        .from("attendance_events")
        .select("*", { count: "exact", head: true })
        .eq("meeting_id", id),
    ]);

    const meetingData: MeetingDetailData = {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      streamCallId: meeting.stream_call_id,
      startedAt: meeting.started_at,
      endedAt: meeting.ended_at,
      createdAt: meeting.created_at,
      user_id: meeting.user_id,
      guestAdmissionMode: (meeting.guest_admission_mode ?? "approval") as GuestAdmissionMode,
    };

    const insightsData: MeetingInsights | null = insights
      ? (() => {
        const row = insights as InsightsRow;
        return {
          summary: row.summary ?? null,
          keyPoints: row.key_points ?? [],
          decisions: row.decisions ?? [],
          category: row.category ?? null,
          detectedTopics: row.detected_topics ?? [],
        };
      })()
      : null;

    const actionItemsData: ActionItem[] = ((actionItems ?? []) as ActionItemRow[]).map(
      (row) => ({
        id: row.id,
        title: row.title,
        assignee: row.assignee ?? null,
        dueDate: row.due_date ?? null,
      }),
    );

    const response: MeetingDetailResponse = {
      meeting: meetingData,
      insights: insightsData,
      actionItems: actionItemsData,
      attendanceCount: attendanceCount ?? 0,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load meeting";
    console.error("Meeting detail error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Owner-only delete. FK constraints on every child table use
// `on delete cascade`, so removing the meetings row removes the transcript,
// chunks, action items, follow-ups, categories, insights, and attendance in one
// operation. Only the row owner (meetings.user_id) may delete.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = supabaseServer();

    const { data: meeting, error: findError } = await supabase
      .from("meetings")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (findError || !meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    if (meeting.user_id !== userId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from("meetings")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Failed to delete meeting:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete meeting" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete meeting";
    console.error("Meeting delete error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
