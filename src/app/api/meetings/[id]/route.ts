/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  ActionItem,
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

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, title, status, stream_call_id, started_at, ended_at, created_at")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (meetingError || !meeting) {
      console.error("Meeting not found:", meetingError);
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    const [{ data: insights }, { data: actionItems }] = await Promise.all([
      supabase
        .from("meeting_insights")
        .select("summary, key_points, decisions, category, detected_topics")
        .eq("meeting_id", id)
        .single(),
      supabase
        .from("action_items")
        .select("id, title, assignee, due_date")
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
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load meeting";
    console.error("Meeting detail error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
