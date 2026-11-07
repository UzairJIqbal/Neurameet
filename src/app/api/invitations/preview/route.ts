import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  GONE_MESSAGE,
  RATE_LIMIT_MESSAGE,
  isAcceptRateLimited,
  isTokenShape,
  loadInviteByToken,
  recordAcceptFailure,
} from "@/lib/invitations";
import { loadInvitePreview } from "@/lib/invite-preview";

// Signed in: what the invite page shows (AC-16a, AC-70s). Consumes nothing, and
// never returns the invited email. Team names and the invitation id go only to
// the person an email invite names.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    if (await isAcceptRateLimited(supabase, userId)) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }

    const token = new URL(request.url).searchParams.get("token");
    const loaded = isTokenShape(token)
      ? await loadInviteByToken(supabase, token, userId)
      : null;
    if (!loaded || loaded.state === "gone" || !loaded.invite) {
      await recordAcceptFailure(
        supabase,
        userId,
        loaded?.invite ?? null,
        "gone",
      );
      return NextResponse.json({ error: GONE_MESSAGE }, { status: 410 });
    }

    return NextResponse.json(
      await loadInvitePreview(supabase, {
        invite: loaded.invite,
        projectName: loaded.projectName,
        status: loaded.state,
        userId,
      }),
    );
  } catch (err) {
    console.error("[invitations] preview failed:", err);
    return NextResponse.json(
      { error: "Failed to load invite" },
      { status: 500 },
    );
  }
}
