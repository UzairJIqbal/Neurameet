// POST /api/guest/admit
// Owner-only endpoint that admits a pending guest into a meeting call.
// Mirrors the event-emit pattern from ../request-join/route.ts and the
// owner-check pattern from ../../meetings/by-call/[callId]/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk"; // only for call-event emit
import { getGuest, admit } from "@/lib/guest-store";
import { supabaseServer } from "@/lib/supabase-server";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY!;
const secret = process.env.STREAM_SECRET_KEY!;

export async function POST(req: NextRequest) {
  // 1. Clerk auth required — deny anonymous access entirely.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body; meeting_id is the Stream call id (matches request-join emit).
  const { guest_token, meeting_id } = await req.json();
  if (!guest_token || typeof guest_token !== "string") {
    return NextResponse.json({ error: "guest_token is required" }, { status: 400 });
  }
  if (!meeting_id || typeof meeting_id !== "string") {
    return NextResponse.json({ error: "meeting_id is required" }, { status: 400 });
  }

  // 3. Cross-check: the guest_token must belong to the claimed meeting_id.
  //    Prevents a host from admitting a guest tied to a different meeting.
  //    Now async (DB-backed) — works across serverless instances (the 403 fix).
  const guest = await getGuest(guest_token);
  if (!guest || guest.meeting_id !== meeting_id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // 4. Owner check — reuse the exact pattern from meetings/by-call/[callId]/route.ts.
  //    meetings.user_id is the Clerk user_id of the meeting owner.
  const supabase = supabaseServer();
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, user_id")
    .eq("stream_call_id", meeting_id)
    .maybeSingle();

  if (meetingError || !meeting) {
    console.error("[guest/admit] meeting lookup failed:", meetingError);
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.user_id !== userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // 5. Call admit() directly — it is the single source of truth for the
  //    check-and-set. Returns false if the guest was already admitted/denied/
  //    expired, which covers the race between concurrent admit requests.
  //    No separate getStatus() precheck — that was redundant and created an
  //    await gap that allowed both requests to pass the precheck before either
  //    called admit().
  const admitted = await admit(guest_token);
  if (!admitted) {
    return NextResponse.json(
      { error: "Guest request already resolved or expired" },
      { status: 409 },
    );
  }

  // 6. Best-effort emit to the guest's WebSocket (poll fallback is primary per G0 §4.2).
  //    No-op if the guest isn't in-call — they'll pick up the change on their 5s poll.
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
        event: "guest.admitted",
        guest_token,
      },
    });
  } catch (e) {
    console.error("[guest/admit] emit failed (poll-only fallback):", e);
  }

  // 7. Done. The guest's polling loop (guest page GuestWaitingScreen) will see "admitted" and
  //    call call.join({ create: false }) to enter the call.
  return NextResponse.json({ status: "admitted" });
}
