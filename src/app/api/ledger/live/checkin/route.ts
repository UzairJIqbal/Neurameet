import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  rankCheckinItems,
  type CheckinMeeting,
  type CheckinRow,
} from "@/lib/live-ledger-rank";
import type { CheckinResponse } from "@/lib/live-ledger-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ITEM_COLUMNS =
  "id, meeting_id, statement, quote, assignee, due_date, created_at";

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * Owner only check-in list for a live call (spec 0002 AC-1, AC-2): open items
 * from the owner's other meetings, ranked deterministically. No AI call.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const callId = params.get("callId");
  const today = params.get("today");
  if (!callId) {
    return NextResponse.json({ error: "callId is required" }, { status: 400 });
  }
  if (!today || !isIsoDate(today)) {
    return NextResponse.json(
      { error: "today must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  try {
    const supabase = supabaseServer();

    // Ownership comes from the stored meeting, never the client's call state.
    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("id")
      .eq("stream_call_id", callId)
      .eq("user_id", userId)
      .maybeSingle();
    if (meetingErr) throw meetingErr;
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    const liveMeetingId = (meeting as { id: string }).id;

    const { data: meetingData, error: meetingsErr } = await supabase
      .from("meetings")
      .select("id, title, started_at")
      .eq("user_id", userId);
    if (meetingsErr) throw meetingsErr;
    const meetings = ((meetingData ?? []) as CheckinMeeting[]).filter(
      (m) => m.id !== liveMeetingId,
    );
    if (meetings.length === 0) {
      return NextResponse.json({ items: [] } satisfies CheckinResponse);
    }

    const { data: itemData, error: itemsErr } = await supabase
      .from("ledger_items")
      .select(ITEM_COLUMNS)
      .in(
        "meeting_id",
        meetings.map((m) => m.id),
      )
      .eq("status", "open");
    if (itemsErr) throw itemsErr;

    const items = rankCheckinItems(
      (itemData ?? []) as CheckinRow[],
      meetings,
      today,
    );
    return NextResponse.json({ items } satisfies CheckinResponse);
  } catch (err) {
    console.error("[live-ledger] checkin failed", { callId, err });
    return NextResponse.json(
      { error: "Could not load your open promises" },
      { status: 500 },
    );
  }
}
