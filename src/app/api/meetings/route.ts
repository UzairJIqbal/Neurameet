/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { MeetingListItem } from "@/lib/meeting-types";

interface MeetingRow {
  id: string;
  title: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  stream_call_id: string;
  meeting_insights: { category: string | null; summary: string | null }[] | null;
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized", meetings: [] },
      { status: 401 },
    );
  }

  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("meetings")
      .select(
        "id, title, status, started_at, ended_at, created_at, stream_call_id, meeting_insights(category, summary)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load meetings:", error);
      return NextResponse.json(
        { error: "Failed to load meetings", meetings: [] },
        { status: 500 },
      );
    }

    const meetings = ((data ?? []) as MeetingRow[]).map<MeetingListItem>(
      (row) => {
        const insights = Array.isArray(row.meeting_insights)
          ? row.meeting_insights
          : [];
        return {
          id: row.id,
          title: row.title,
          status: row.status,
          startedAt: row.started_at,
          endedAt: row.ended_at,
          createdAt: row.created_at,
          category: insights[0]?.category ?? null,
          hasInsights: insights.length > 0,
          streamCallId: row.stream_call_id,
        };
      },
    );

    return NextResponse.json({ meetings });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load meetings";
    console.error("Meetings list error:", err);
    return NextResponse.json(
      { error: message, meetings: [] },
      { status: 500 },
    );
  }
}
