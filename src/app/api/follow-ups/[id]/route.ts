/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { FollowUpDetail } from "@/lib/meeting-types";

type Embedded<T> = T | T[] | null;

function first<T>(rel: Embedded<T>): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

interface FollowUpRow {
  id: string;
  status: string;
  priority: string;
  notes: string | null;
  updated_at: string;
  meeting_id: string;
  action_item_id: string;
  meetings: Embedded<{
    title: string | null;
    status: string | null;
    started_at: string | null;
  }>;
  action_items: Embedded<{
    title: string | null;
    assignee: string | null;
    due_date: string | null;
  }>;
}

const VALID_STATUS = new Set(["pending", "needs_attention", "completed"]);
const VALID_PRIORITY = new Set(["low", "medium", "high"]);

function toDetail(row: FollowUpRow): FollowUpDetail {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    actionItemId: row.action_item_id,
    status: (VALID_STATUS.has(row.status)
      ? row.status
      : "pending") as FollowUpDetail["status"],
    priority: (VALID_PRIORITY.has(row.priority)
      ? row.priority
      : "medium") as FollowUpDetail["priority"],
    notes: row.notes,
    updatedAt: row.updated_at,
    meetingTitle: first(row.meetings)?.title ?? null,
    actionTitle: first(row.action_items)?.title ?? null,
    assignee: first(row.action_items)?.assignee ?? null,
    dueDate: first(row.action_items)?.due_date ?? null,
    meetingStatus: first(row.meetings)?.status ?? null,
    meetingStartedAt: first(row.meetings)?.started_at ?? null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const supabase = supabaseServer();

    // Scope to the user's own meetings (reliable ownership filter)
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id")
      .eq("user_id", userId);

    if (meetingsError) {
      console.error("Failed to load meetings:", meetingsError);
      return NextResponse.json(
        { error: "Failed to load follow-up" },
        { status: 500 },
      );
    }

    const meetingIds = (meetings ?? []).map((m) => m.id);
    const { data, error } = await supabase
      .from("follow_ups")
      .select(
        "id, status, priority, notes, updated_at, meeting_id, action_item_id, meetings(title, status, started_at), action_items(title, assignee, due_date)",
      )
      .eq("id", id)
      .in("meeting_id", meetingIds)
      .maybeSingle();

    if (error) {
      console.error("Failed to load follow-up:", error);
      return NextResponse.json(
        { error: "Failed to load follow-up" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Follow-up not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ followUp: toDetail(data as FollowUpRow) });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load follow-up";
    console.error("Follow-up detail error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
