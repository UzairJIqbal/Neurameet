/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";
import { supabaseServer } from "@/lib/supabase-server";

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
      .select("id, user_id")
      .eq("stream_call_id", callId)
      .maybeSingle();

    // The meeting row exists: only its owner may delete (don't touch the Stream
    // call for a non-owner, so we fail closed before any destructive action).
    if (meeting && meeting.user_id !== userId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const client = new StreamClient(apiKey, secretKey);

    // No meeting row: the caller must be the Stream call's creator.
    if (!meeting) {
      try {
        const { call } = await client.video.call("default", callId).get();
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
      await client.video.deleteCall({ type: "default", id: callId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // A call that's already gone is still a successful deletion.
      if (!/not found|does not exist|404/i.test(msg)) {
        console.error("Failed to delete Stream call:", msg);
        return NextResponse.json({ error: "Failed to delete call" }, { status: 500 });
      }
    }

    // Cascade-remove the Supabase meeting row (and all child data) if present.
    if (meeting && meeting.user_id === userId) {
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
