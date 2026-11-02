import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getAllPending } from "@/lib/guest-store";
import { accessErrorResponse, checkMeetingAccess } from "@/lib/project-auth";

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

  // Manage check (spec 0004): the meeting row by its Stream call id.
  const supabase = supabaseServer();
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, user_id, project_id")
    .eq("stream_call_id", meetingId)
    .maybeSingle();

  if (meetingError || !meeting) {
    // The meetings row is created by the owner's first attendance event. Until
    // it exists there is nothing to own-check, so report no pending guests and
    // let the next poll pick them up. Never create the row here: that would let
    // any signed-in caller claim an uninitialized call.
    return NextResponse.json({ pending: [] });
  }

  // Personal meeting: the creator only. Project meeting: Owner or Admin.
  try {
    await checkMeetingAccess(supabase, userId, meeting, "manage", {
      personalDenied: { status: 403, message: "Not authorized" },
    });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    throw err;
  }

  // Return all pending guests for this meeting so the owner can discover
  // requests even if they weren't on the call when guest.request_join fired.
  const pending = await getAllPending(meetingId);

  return NextResponse.json({ pending });
}
