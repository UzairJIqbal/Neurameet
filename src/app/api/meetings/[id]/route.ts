/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import {
  accessErrorResponse,
  checkMeetingAccess,
  NEED_ROLES,
  type MeetingAccess,
} from "@/lib/project-auth";
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

// Personal meeting fallback: a recorded participant (by Clerk user id, by the
// guest's Stream identity, or by participant email) may read the meeting.
async function isRecordedParticipant(
  supabase: SupabaseClient,
  meetingId: string,
  userId: string,
): Promise<boolean> {
  for (const column of ["user_id", "stream_user_id", "participant_email"]) {
    const { data } = await supabase
      .from("attendance_events")
      .select("user_id")
      .eq("meeting_id", meetingId)
      .eq(column, userId)
      .limit(1);
    if (data && data.length > 0) return true;
  }
  return false;
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

    // Scope check: the meeting must exist and the caller must be allowed to
    // read it. Personal meeting: the owner OR a recorded participant. This
    // mirrors the lenient ownership rule in /api/transcript/upload and
    // /api/ai/embed — a participant may view a meeting they attended under a
    // different Clerk account than the creator, so a strict owner-only check
    // would wrongly 404 the detail fetch (and surface "Meeting not found" on the
    // page) even though upload/embed already authorized the same caller.
    // Project meeting: any active member (spec 0004, need "read").
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, title, status, stream_call_id, started_at, ended_at, created_at, user_id, guest_admission_mode, project_id")
      .eq("id", id)
      .single();

    if (meetingError || !meeting) {
      console.error("Meeting not found:", meetingError);
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    let access: MeetingAccess;
    try {
      access = await checkMeetingAccess(supabase, userId, meeting, "read", {
        personalFallback: () => isRecordedParticipant(supabase, meeting.id, userId),
        personalDenied: { status: 404, message: "Meeting not found" },
      });
    } catch (err) {
      const denied = accessErrorResponse(err);
      if (!denied) throw err;
      console.error("Meeting not authorized for user:", userId);
      return denied;
    }

    const canManage = access.projectId
      ? access.role !== null && NEED_ROLES.manage.includes(access.role)
      : access.isCreator;
    // A Viewer on a project meeting sees only confirmed action items. The
    // review_state column arrives in W4, which switches this on; until then a
    // Viewer gets an empty list (review_state is not selected here).
    const hideActionItems = access.role === "viewer";

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
      hideActionItems
        ? Promise.resolve({ data: [] as ActionItemRow[] })
        : supabase
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
      projectId: access.projectId,
      role: access.role,
      canManage,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load meeting";
    console.error("Meeting detail error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const SEALED = { error: "Sealed minutes can't be deleted" };

// Owner-only delete. FK constraints on every child table use
// `on delete cascade`, so removing the meetings row removes the transcript,
// chunks, action items, follow-ups, categories, insights, and attendance in one
// operation. Only the row owner (meetings.user_id) may delete a personal
// meeting; only the project Owner may delete a project meeting.
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
      .select("id, user_id, project_id")
      .eq("id", id)
      .single();

    if (findError || !meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    // Personal meeting: the creator only. Project meeting: the project Owner
    // only (spec 0004, need "owner"); a non member gets 404.
    try {
      await checkMeetingAccess(supabase, userId, meeting, "owner", {
        personalDenied: { status: 403, message: "Not authorized" },
      });
    } catch (err) {
      const denied = accessErrorResponse(err);
      if (denied) return denied;
      throw err;
    }

    // Tasdeeq AC-7: sealed minutes are permanent. An open review is removed
    // with the meeting (cascade); minutes_seals is `on delete restrict`.
    const { data: seal, error: sealError } = await supabase
      .from("minutes_seals")
      .select("id")
      .eq("meeting_id", id)
      .limit(1);
    if (sealError) throw sealError;
    if (seal && seal.length > 0) {
      return NextResponse.json(SEALED, { status: 409 });
    }

    const { error: deleteError } = await supabase
      .from("meetings")
      .delete()
      .eq("id", id);

    // A seal that landed after the pre check trips the foreign key restrict.
    if (deleteError?.code === "23503") {
      return NextResponse.json(SEALED, { status: 409 });
    }
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
