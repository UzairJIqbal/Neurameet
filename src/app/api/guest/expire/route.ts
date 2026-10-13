// POST /api/guest/expire
// Owner-only endpoint that expires all pending guest requests for a meeting.
// Called when the call ends (owner leaves) so that guests still waiting
// are marked expired and their polling loop transitions to "expired".

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { expireByMeetingId } from "@/lib/guest-store";

export async function POST(req: NextRequest) {
  // 1. Clerk auth required.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body.
  const { meeting_id } = await req.json();
  if (!meeting_id || typeof meeting_id !== "string") {
    return NextResponse.json({ error: "meeting_id is required" }, { status: 400 });
  }

  // 3. Owner check — reuse the exact pattern from meetings/by-call/[callId]/route.ts.
  const supabase = supabaseServer();
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, user_id")
    .eq("stream_call_id", meeting_id)
    .maybeSingle();

  if (meetingError || !meeting) {
    console.error("[guest/expire] meeting lookup failed:", meetingError);
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.user_id !== userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // 4. Bulk-expire all pending guests for this meeting.
  const expiredCount = await expireByMeetingId(meeting_id);

  return NextResponse.json({ status: "expired", expiredCount });
}
