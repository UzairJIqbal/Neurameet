import { after, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { isAssignableRole, lookupProfiles, rpcErrorCode } from "@/lib/projects";
import {
  MAX_ACTIVE_INVITES,
  hashInviteToken,
  inviteExpiry,
  inviteLink,
  newInviteToken,
  parseInviteEmail,
} from "@/lib/invitations";
import { notifyProjectInvitation } from "@/lib/notification-events";
import {
  type CreateInvitationResponse,
  type InvitationSummary,
  type InviteKind,
  type InviteRole,
} from "@/lib/project-types";

type Params = { params: Promise<{ id: string }> };

type InvitationRow = {
  id: string;
  kind: InviteKind;
  email: string | null;
  role: InviteRole;
  expires_at: string;
  created_at: string;
  created_by: string;
};

const unprocessable = (error: string) =>
  NextResponse.json({ error }, { status: 422 });

// Owner or Admin: create an email or link invite (AC-13, AC-13a, AC-14, AC-15).
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
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

    const body = (await request.json().catch(() => null)) as {
      kind?: unknown;
      email?: unknown;
      role?: unknown;
    } | null;
    const kind = body?.kind;
    if (kind !== "email" && kind !== "link") {
      return unprocessable("Kind must be email or link");
    }
    const role = body?.role;
    if (!isAssignableRole(role)) {
      return unprocessable("Role must be admin, developer, or viewer");
    }
    if (role === "admin" && kind === "link") {
      return unprocessable("A link invite can't grant Admin");
    }
    if (role === "admin" && myRole !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can invite an Admin" },
        { status: 403 },
      );
    }
    const email = kind === "email" ? parseInviteEmail(body?.email) : null;
    if (kind === "email" && !email) {
      return unprocessable("Enter a valid email");
    }

    const token = newInviteToken();
    const { data, error } = await supabase.rpc("create_project_invitation", {
      p_project: id,
      p_kind: kind,
      p_email: email,
      p_role: role,
      p_token_hash: hashInviteToken(token),
      p_created_by: userId,
      p_expires_at: inviteExpiry().toISOString(),
      p_max_active: MAX_ACTIVE_INVITES,
    });
    if (error) {
      if (rpcErrorCode(error) === "cap_reached") {
        return unprocessable(
          `This project has ${MAX_ACTIVE_INVITES} open invites. Revoke some first.`,
        );
      }
      if ((error as { code?: unknown }).code === "23505") {
        return NextResponse.json(
          { error: "Another invite was just made, try again" },
          { status: 409 },
        );
      }
      throw error;
    }

    const row = data as InvitationRow;
    const link = inviteLink(token);
    if (kind === "email" && email) {
      after(() =>
        notifyProjectInvitation(supabase, {
          projectId: id,
          invitationId: row.id,
          email,
          role,
        }),
      );
    }

    const response: CreateInvitationResponse = {
      invitation: {
        id: row.id,
        kind: row.kind,
        email: row.email,
        role: row.role,
        expiresAt: row.expires_at,
      },
      link,
    };
    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[invitations] create failed:", err);
    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 },
    );
  }
}

// Owner or Admin: active invites, never a token or hash.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.manage);

    const { data, error } = await supabase
      .from("project_invitations")
      .select("id, kind, email, role, expires_at, created_at, created_by")
      .eq("project_id", id)
      .is("revoked_at", null)
      .is("used_at", null)
      .is("declined_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as InvitationRow[];
    const profiles = await lookupProfiles(rows.map((r) => r.created_by));
    const invitations: InvitationSummary[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      email: r.email,
      role: r.role,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      createdByName: profiles.get(r.created_by)?.name ?? "Unknown member",
    }));
    return NextResponse.json({ invitations });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[invitations] list failed:", err);
    return NextResponse.json(
      { error: "Failed to load invites" },
      { status: 500 },
    );
  }
}
