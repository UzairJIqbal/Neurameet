import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { rpcErrorCode } from "@/lib/projects";
import {
  GONE_MESSAGE,
  RATE_LIMIT_MESSAGE,
  WRONG_EMAIL_MESSAGE,
  emailMatchesInvite,
  getCallerProfile,
  isAcceptRateLimited,
  isTokenShape,
  loadInviteByToken,
  recordAcceptFailure,
  type InviteRow,
} from "@/lib/invitations";
import type { AcceptInviteResponse } from "@/lib/project-types";

type Supabase = ReturnType<typeof supabaseServer>;

const done = (status: AcceptInviteResponse["status"], projectId: string) =>
  NextResponse.json({ status, projectId } satisfies AcceptInviteResponse);

async function gone(
  supabase: Supabase,
  userId: string,
  invite: InviteRow | null,
) {
  await recordAcceptFailure(supabase, userId, invite, "gone");
  return NextResponse.json({ error: GONE_MESSAGE }, { status: 410 });
}

// Signed in: accept an invite (AC-17 to AC-20). Email kind joins straight away;
// link kind creates one pending join request.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    if (await isAcceptRateLimited(supabase, userId)) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }

    const body = (await request.json().catch(() => null)) as {
      token?: unknown;
    } | null;
    const token = body?.token;
    if (!isTokenShape(token)) return gone(supabase, userId, null);

    const { state, invite } = await loadInviteByToken(supabase, token, userId);
    if (state === "gone" || !invite) return gone(supabase, userId, invite);
    if (state === "member") return done("joined", invite.project_id);
    if (state === "pending") return done("pending", invite.project_id);

    const caller = await getCallerProfile(userId);

    if (invite.kind === "email") {
      if (!invite.email || !emailMatchesInvite(caller, invite.email)) {
        await recordAcceptFailure(supabase, userId, invite, "wrong_email");
        return NextResponse.json(
          { error: WRONG_EMAIL_MESSAGE },
          { status: 403 },
        );
      }
      const { error } = await supabase.rpc("accept_email_invitation", {
        p_invitation: invite.id,
        p_user: userId,
      });
      if (error) {
        if (rpcErrorCode(error) === "gone")
          return gone(supabase, userId, invite);
        throw error;
      }
      return done("joined", invite.project_id);
    }

    const { error } = await supabase.rpc("request_project_join", {
      p_invitation: invite.id,
      p_user: userId,
      p_name: caller.displayName,
      p_email: caller.email,
    });
    if (error) {
      if (rpcErrorCode(error) === "gone") return gone(supabase, userId, invite);
      throw error;
    }
    return done("pending", invite.project_id);
  } catch (err) {
    console.error("[invitations] accept failed:", err);
    return NextResponse.json(
      { error: "Failed to accept invite" },
      { status: 500 },
    );
  }
}
