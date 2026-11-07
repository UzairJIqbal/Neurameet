import { after, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { rpcErrorCode } from "@/lib/projects";
import { notifyMemberJoined } from "@/lib/notification-events";
import {
  GONE_MESSAGE,
  emailMatchesInvite,
  getCallerProfile,
  isUuid,
  loadInviteById,
  type InviteRow,
} from "@/lib/invitations";
import type {
  MyInvitationDecision,
  MyInvitationDecisionResponse,
} from "@/lib/project-types";

type Params = { params: Promise<{ id: string }> };
type Supabase = ReturnType<typeof supabaseServer>;

const notFound = () =>
  NextResponse.json({ error: "Invitation not found" }, { status: 404 });
const gone = () => NextResponse.json({ error: GONE_MESSAGE }, { status: 410 });
const done = (
  status: MyInvitationDecisionResponse["status"],
  projectId: string,
) =>
  NextResponse.json({
    status,
    projectId,
  } satisfies MyInvitationDecisionResponse);

const isDecision = (value: unknown): value is MyInvitationDecision =>
  value === "accept" || value === "decline";

async function decline(supabase: Supabase, invite: InviteRow, userId: string) {
  const { data, error } = await supabase
    .from("project_invitations")
    .update({ declined_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("kind", "email")
    .is("revoked_at", null)
    .is("used_at", null)
    .is("declined_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return gone();

  const { error: auditError } = await supabase.from("audit_log").insert({
    project_id: invite.project_id,
    actor_id: userId,
    action: "invite.declined",
    target_type: "invitation",
    target_id: invite.id,
    detail: {},
  });
  if (auditError) {
    console.error("[invitations] decline audit failed:", auditError);
  }
  return done("declined", invite.project_id);
}

// Signed in, matching email: accept or decline without the token (AC-70t).
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(id)) return notFound();

  try {
    const body = (await request.json().catch(() => null)) as {
      decision?: unknown;
    } | null;
    const decision = body?.decision;
    if (!isDecision(decision)) {
      return NextResponse.json(
        { error: "Decision must be accept or decline" },
        { status: 422 },
      );
    }

    const supabase = supabaseServer();
    const { state, invite } = await loadInviteById(supabase, id, userId);
    if (state === "gone" || !invite?.email || invite.kind !== "email") {
      return notFound();
    }
    const caller = await getCallerProfile(userId);
    if (!emailMatchesInvite(caller, invite.email)) return notFound();

    if (decision === "decline") return decline(supabase, invite, userId);
    if (state === "member") return done("joined", invite.project_id);

    const { error } = await supabase.rpc("accept_email_invitation", {
      p_invitation: invite.id,
      p_user: userId,
    });
    if (error) {
      if (rpcErrorCode(error) === "gone") return gone();
      throw error;
    }
    after(() =>
      notifyMemberJoined(supabase, {
        projectId: invite.project_id,
        userId,
        name: caller.displayName,
        role: invite.role,
        actorId: userId,
      }),
    );
    return done("joined", invite.project_id);
  } catch (err) {
    console.error("[invitations] mine decision failed:", err);
    return NextResponse.json(
      { error: "Failed to update the invitation" },
      { status: 500 },
    );
  }
}
