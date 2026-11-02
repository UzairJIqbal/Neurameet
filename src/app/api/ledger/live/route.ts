import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveLiveCaller } from "@/lib/live-ledger-auth";
import { loadOpenAgreement, loadOpenCard } from "@/lib/live-ledger-state";
import { isIsoDate, type LiveStateResponse } from "@/lib/live-ledger-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Late join catch up (spec 0002 AC-12): the open card and the open agreement
 * for any participant of the call. Owner, attendee, or verified guest only.
 */
export async function GET(request: Request) {
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

  const { userId } = await auth();
  try {
    const supabase = supabaseServer();
    const caller = await resolveLiveCaller(supabase, {
      callId,
      authUserId: userId,
      guestStreamToken: params.get("guestStreamToken"),
    });
    if (!caller) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const [card, agreement] = await Promise.all([
      loadOpenCard(supabase, caller.meeting.id, today),
      loadOpenAgreement(supabase, caller.meeting.id, caller.callerId),
    ]);
    const body: LiveStateResponse = {
      isOwner: caller.isOwner,
      card,
      agreement,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[live-ledger] state read failed", { callId, err });
    return NextResponse.json(
      { error: "Could not load the live ledger" },
      { status: 500 },
    );
  }
}
