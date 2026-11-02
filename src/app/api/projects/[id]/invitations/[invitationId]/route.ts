import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { rpcErrorCode } from "@/lib/projects";
import { isUuid } from "@/lib/invitations";

type Params = { params: Promise<{ id: string; invitationId: string }> };

const NOT_FOUND = { error: "Invite not found" };

// Owner or Admin: revoke. A link revoke also denies its waiting requests (AC-21a).
export async function DELETE(_request: Request, { params }: Params) {
  const { id, invitationId } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.manage);
    if (!isUuid(invitationId))
      return NextResponse.json(NOT_FOUND, { status: 404 });

    const { error } = await supabase.rpc("revoke_project_invitation", {
      p_invitation: invitationId,
      p_project: id,
      p_actor: userId,
    });
    if (error) {
      if (rpcErrorCode(error) === "not_found")
        return NextResponse.json(NOT_FOUND, { status: 404 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[invitations] revoke failed:", err);
    return NextResponse.json(
      { error: "Failed to revoke invite" },
      { status: 500 },
    );
  }
}
