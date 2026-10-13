// POST /api/guest/deny
// Owner-only endpoint that denies a pending guest's join request.
// Mirrors ../admit/route.ts — same auth/owner/status/cross-check pattern,
// calls deny() from guest-store, emits guest.denied event.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk"; // only for call-event emit
import { getGuest, deny } from "@/lib/guest-store";
import { supabaseServer } from "@/lib/supabase-server";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY!;
const secret = process.env.STREAM_SECRET_KEY!;

export async function POST(req: NextRequest) {
  // 1. Clerk auth required.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body.
  const { guest_token, meeting_id } = await req.json();
  if (!guest_token || typeof guest_token !== "string") {
    return NextResponse.json({ error: "guest_token is required" }, { status: 400 });
  }
  if (!meeting_id || typeof meeting_id !== "string") {
    return NextResponse.json({ error: "meeting_id is required" }, { status: 400 });
  }

  // 3. Cross-check: the guest_token must belong to the claimed meeting_id.
  //    Now async (DB-backed) — works across serverless instances (the 403 fix).
  const guest = await getGuest(guest_token);
  if (!guest || guest.meeting_id !== meeting_id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // 4. Owner check — reuse the exact pattern from meetings/by-call/[callId]/route.ts.
  const supabase = supabaseServer();
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, user_id")
    .eq("stream_call_id", meeting_id)
    .maybeSingle();

  if (meetingError || !meeting) {
    console.error("[guest/deny] meeting lookup failed:", meetingError);
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.user_id !== userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // 5. Call deny() directly — single source of truth for check-and-set.
  //    Returns false if the guest was already admitted/denied/expired,
  //    covering the race between concurrent deny requests.
  const denied = await deny(guest_token);
  if (!denied) {
    return NextResponse.json(
      { error: "Guest request already resolved or expired" },
      { status: 409 },
    );
  }

  // 6. Best-effort emit to the guest's WebSocket (poll fallback is primary per G0 §4.2).
  //    `user_id` is REQUIRED for server-side auth (mirrors G2's request-join fix:
  //    omitting it makes Stream reject the emit with "either user or user_id must be
  //    provided when using server side auth", so the event never reaches the guest
  //    even though the store update below is correct).
  try {
    const nodeClient = new StreamClient(apiKey, secret);
    await nodeClient.video.sendCallEvent({
      type: "default",
      id: meeting_id,
      user_id: userId,
      custom: {
        event: "guest.denied",
        guest_token,
      },
    });
  } catch (e) {
    console.error("[guest/deny] emit failed (poll-only fallback):", e);
  }

  // 7. Done. The guest's polling loop will see "denied" and render the Declined UI.
  return NextResponse.json({ status: "denied" });
}
