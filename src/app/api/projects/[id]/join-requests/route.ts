import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import type { InviteRole, JoinRequestSummary } from "@/lib/project-types";

type RequestRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: InviteRole;
  created_at: string;
};

// Owner or Admin: pending join requests (AC-21).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.manage);

    const { data, error } = await supabase
      .from("project_join_requests")
      .select("id, display_name, email, role, created_at")
      .eq("project_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const requests: JoinRequestSummary[] = ((data ?? []) as RequestRow[]).map(
      (r) => ({
        id: r.id,
        displayName: r.display_name,
        email: r.email,
        role: r.role,
        createdAt: r.created_at,
      }),
    );
    return NextResponse.json({ requests });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[join-requests] list failed:", err);
    return NextResponse.json(
      { error: "Failed to load join requests" },
      { status: 500 },
    );
  }
}
