import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import {
  GONE_MESSAGE,
  hashInviteToken,
  inviteExpiry,
  inviteLink,
  isUuid,
  newInviteToken,
} from "@/lib/invitations";
import type {
  InviteKind,
  InviteRole,
  ResendInvitationResponse,
} from "@/lib/project-types";

type Params = { params: Promise<{ id: string; invitationId: string }> };

type ResendRow = {
  id: string;
  kind: InviteKind;
  email: string | null;
  role: InviteRole;
  expires_at: string;
  revoked_at: string | null;
  used_at: string | null;
  declined_at: string | null;
};

const NOT_FOUND = { error: "Invite not found" };
const gone = () => NextResponse.json({ error: GONE_MESSAGE }, { status: 410 });

const isActive = (row: ResendRow, now: Date): boolean =>
  !row.revoked_at &&
  !row.used_at &&
  !row.declined_at &&
  new Date(row.expires_at) > now;

// Owner or Admin: a fresh token and expiry on an email invite, so only the
// newest link works (AC-70k). The token is never logged or written to the audit.
export async function POST(_request: Request, { params }: Params) {
  const { id, invitationId } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const { role: myRole } = await requireProjectRole(
      supabase,
      userId,
      id,
      NEED_ROLES.manage,
    );
    if (!isUuid(invitationId))
      return NextResponse.json(NOT_FOUND, { status: 404 });

    const { data, error } = await supabase
      .from("project_invitations")
      .select(
        "id, kind, email, role, expires_at, revoked_at, used_at, declined_at",
      )
      .eq("id", invitationId)
      .eq("project_id", id)
      .maybeSingle();
    if (error) throw error;
    const row = data as ResendRow | null;
    if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });
    if (row.kind !== "email" || !row.email) {
      return NextResponse.json(
        { error: "Only an email invite can be resent" },
        { status: 422 },
      );
    }
    const now = new Date();
    if (!isActive(row, now)) return gone();
    if (row.role === "admin" && myRole !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can invite an Admin" },
        { status: 403 },
      );
    }

    const token = newInviteToken();
    const { data: updated, error: updateError } = await supabase
      .from("project_invitations")
      .update({
        token_hash: hashInviteToken(token),
        expires_at: inviteExpiry().toISOString(),
      })
      .eq("id", row.id)
      .eq("project_id", id)
      .eq("kind", "email")
      .is("revoked_at", null)
      .is("used_at", null)
      .is("declined_at", null)
      .gt("expires_at", now.toISOString())
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return gone(); // Revoked, used, or declined a moment ago.

    const { error: auditError } = await supabase.from("audit_log").insert({
      project_id: id,
      actor_id: userId,
      action: "invite.resent",
      target_type: "invitation",
      target_id: row.id,
      detail: {},
    });
    if (auditError) console.error("[invitations] audit failed:", auditError);

    const link = inviteLink(token);
    const response: ResendInvitationResponse = { link };
    return NextResponse.json(response);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[invitations] resend failed:", err);
    return NextResponse.json(
      { error: "Failed to resend invite" },
      { status: 500 },
    );
  }
}
