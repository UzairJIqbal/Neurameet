import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  isProjectRole,
  requireProjectRole,
} from "@/lib/project-auth";
import { lookupProfiles } from "@/lib/projects";
import type { ProjectMember, ProjectRole } from "@/lib/project-types";

type MemberRow = { user_id: string; role: string; joined_at: string };

const ROLE_ORDER: Record<ProjectRole, number> = {
  owner: 0,
  admin: 1,
  developer: 2,
  viewer: 3,
};

// Any member: active members with names and emails from Clerk (one batch).
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
    const { role: myRole } = await requireProjectRole(
      supabase,
      userId,
      id,
      NEED_ROLES.read,
    );

    const { data, error } = await supabase
      .from("project_members")
      .select("user_id, role, joined_at")
      .eq("project_id", id)
      .is("removed_at", null);
    if (error) throw error;

    const rows = ((data ?? []) as MemberRow[]).filter((r) =>
      isProjectRole(r.role),
    );
    const profiles = await lookupProfiles(rows.map((r) => r.user_id));
    const members: ProjectMember[] = rows
      .map((r) => {
        const profile = profiles.get(r.user_id);
        return {
          userId: r.user_id,
          role: r.role as ProjectRole,
          joinedAt: r.joined_at,
          name: profile?.name ?? "Unknown member",
          email: profile?.email ?? null,
        };
      })
      .sort(
        (a, b) =>
          ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
          a.joinedAt.localeCompare(b.joinedAt),
      );

    return NextResponse.json({ members, myRole, me: userId });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[projects] members failed:", err);
    return NextResponse.json(
      { error: "Failed to load members" },
      { status: 500 },
    );
  }
}
