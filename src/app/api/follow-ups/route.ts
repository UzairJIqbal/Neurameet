/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { FollowUpItem } from "@/lib/meeting-types";

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
  meetings: Embedded<{ title: string | null }>;
  action_items: Embedded<{
    title: string | null;
    assignee: string | null;
    due_date: string | null;
  }>;
}

const VALID_STATUS = new Set(["pending", "needs_attention", "completed"]);
const VALID_PRIORITY = new Set(["low", "medium", "high"]);

function toItem(row: FollowUpRow): FollowUpItem {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    actionItemId: row.action_item_id,
    status: (VALID_STATUS.has(row.status)
      ? row.status
      : "pending") as FollowUpItem["status"],
    priority: (VALID_PRIORITY.has(row.priority)
      ? row.priority
      : "medium") as FollowUpItem["priority"],
    notes: row.notes,
    updatedAt: row.updated_at,
    meetingTitle: first(row.meetings)?.title ?? null,
    actionTitle: first(row.action_items)?.title ?? null,
    assignee: first(row.action_items)?.assignee ?? null,
    dueDate: first(row.action_items)?.due_date ?? null,
  };
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized", followUps: [] },
      { status: 401 },
    );
  }

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
        { error: "Failed to load follow-ups", followUps: [] },
        { status: 500 },
      );
    }

    const meetingIds = (meetings ?? []).map((m) => m.id);
    const { data, error } = await supabase
      .from("follow_ups")
      .select(
        "id, status, priority, notes, updated_at, meeting_id, action_item_id, meetings(title), action_items(title, assignee, due_date)",
      )
      .in("meeting_id", meetingIds)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to load follow-ups:", error);
      return NextResponse.json(
        { error: "Failed to load follow-ups", followUps: [] },
        { status: 500 },
      );
    }

    const followUps = ((data ?? []) as FollowUpRow[]).map(toItem);

    return NextResponse.json({ followUps });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load follow-ups";
    console.error("Follow-ups list error:", err);
    return NextResponse.json(
      { error: message, followUps: [] },
      { status: 500 },
    );
  }
}
