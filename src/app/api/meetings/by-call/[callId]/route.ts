/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";
import { supabaseServer } from "@/lib/supabase-server";
import { accessErrorResponse, checkMeetingAccess } from "@/lib/project-auth";
import { callTypeOfRow } from "@/lib/stream-call-type-server";

// Lookup a meeting by its Stream call id (MeetingRoom uses it to reach
// GET /api/meetings/[id] for canManage). Returns only the meeting id and its
// Stream call type (W3), never any project details; access to the meeting
// itself is checked by that route.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const { callId } = await params;
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseServer()
    .from("meetings")
    .select("id, stream_call_type")
    .eq("stream_call_id", callId)
    .maybeSingle();

  if (error) {
    console.error("by-call lookup failed:", error);
    return NextResponse.json({ error: "Failed to load meeting" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  const row = data as { id: string; stream_call_type?: unknown };
  return NextResponse.json({ meetingId: row.id, callType: callTypeOfRow(row) });
}

// Delete a meeting keyed by its Stream call id. Used by the Upcoming and Previous
// pages, which render Stream calls (not Supabase meeting rows). The Stream call
// is deleted (creator-only, enforced by Stream), and any linked Supabase meeting
// row is cascade-removed. Non-owners are rejected: a Supabase meeting row is
// checked by user_id, and a call-only (never-processed) entry is checked against
// the Stream call's created_by (the server client bypasses Stream's own
// client-side permission checks, so we must enforce ownership ourselves).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const { callId } = await params;
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secretKey = process.env.STREAM_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return NextResponse.json({ error: "Stream not configured" }, { status: 500 });
  }

  try {
    const supabase = supabaseServer();

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, user_id, project_id, stream_call_type")
      .eq("stream_call_id", callId)
      .maybeSingle();

    // The meeting row exists: only its owner may delete (don't touch the Stream
    // call for a non-owner, so we fail closed before any destructive action).
    // Personal meeting: the creator (403 otherwise). Project meeting: the
    // project Owner only (spec 0004, need "owner"); a non member gets 404.
    if (meeting) {
      try {
        await checkMeetingAccess(supabase, userId, meeting, "owner", {
          personalDenied: { status: 403, message: "Not authorized" },
        });
      } catch (err) {
        const denied = accessErrorResponse(err);
        if (denied) return denied;
        throw err;
      }
    }

    const client = new StreamClient(apiKey, secretKey);
    const callType = callTypeOfRow(meeting);

    // No meeting row: the caller must be the Stream call's creator.
    if (!meeting) {
      try {
        const { call } = await client.video.call(callType, callId).get();
        if (call.created_by.id !== userId) {
          return NextResponse.json({ error: "Not authorized" }, { status: 403 });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("by-call delete: failed to load Stream call:", msg);
        return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
      }
    }

    // Delete the Stream call (ownership verified above).
    try {
      await client.video.deleteCall({ type: callType, id: callId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // A call that's already gone is still a successful deletion.
      if (!/not found|does not exist|404/i.test(msg)) {
        console.error("Failed to delete Stream call:", msg);
        return NextResponse.json({ error: "Failed to delete call" }, { status: 500 });
      }
    }

    // Cascade-remove the Supabase meeting row (and all child data) if present.
    if (meeting) {
      const { error: deleteError } = await supabase
        .from("meetings")
        .delete()
        .eq("id", meeting.id);

      if (deleteError) {
        console.error("Failed to delete meeting row:", deleteError);
        return NextResponse.json(
          { error: "Failed to delete meeting" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete";
    console.error("by-call delete error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
