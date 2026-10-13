import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getAllPending } from "@/lib/guest-store";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const meetingId = searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId query param is required" }, { status: 400 });
  }

  // Owner check — reuse the pattern from meetings/by-call/[callId]/route.ts.
  const supabase = supabaseServer();
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, user_id")
    .eq("stream_call_id", meetingId)
    .maybeSingle();

  if (meetingError || !meeting) {
    // Edge case: the owner entered the meeting but the attendance event hasn't
    // created the meetings row yet (or it failed with a 500 before our 23505
    // fix). Create a minimal row anchored to this authenticated user so the
    // owner check can proceed and pending guests are discovered. This mirrors
    // the lazy-creation in attendance/event.
    const { data: created, error: createError } = await supabase
      .from("meetings")
      .insert({
        user_id: userId,
        stream_call_id: meetingId,
        title: "Meeting",
        status: "active",
        started_at: new Date().toISOString(),
      })
      .select("id, user_id")
      .single();

    if (createError || !created) {
      // Could be a 23505 unique violation if a concurrent request just created it —
      // fall back to looking it up. Any other error is a genuine 404.
      if ((createError as { code?: string })?.code === "23505") {
        const { data: existing } = await supabase
          .from("meetings")
          .select("id, user_id")
          .eq("stream_call_id", meetingId)
          .single();
        if (existing) {
          return NextResponse.json({ pending: await getAllPending(meetingId) });
        }
      }
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    return NextResponse.json({ pending: await getAllPending(meetingId) });
  }

  if (meeting.user_id !== userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Return all pending guests for this meeting so the owner can discover
  // requests even if they weren't on the call when guest.request_join fired.
  const pending = getAllPending(meetingId);

  return NextResponse.json({ pending });
}
