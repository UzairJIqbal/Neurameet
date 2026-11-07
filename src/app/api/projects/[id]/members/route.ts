import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
type OpenTaskRow = { assignee_id: string };
type GithubRow = { user_id: string; github_login: string | null };

const ROLE_ORDER: Record<ProjectRole, number> = {
  owner: 0,
  admin: 1,
  developer: 2,
  viewer: 3,
};

// One query of the project's not completed tasks, counted here (AC-70j).
async function openTaskCounts(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("tasks")
    .select("assignee_id")
    .eq("project_id", projectId)
    .neq("status", "completed")
    .not("assignee_id", "is", null);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const { assignee_id } of (data ?? []) as OpenTaskRow[]) {
    counts.set(assignee_id, (counts.get(assignee_id) ?? 0) + 1);
  }
  return counts;
}

async function githubLoginsOf(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("user_settings")
    .select("user_id, github_login")
    .in("user_id", userIds);
  if (error) throw error;
  const logins = new Map<string, string>();
  for (const row of (data ?? []) as GithubRow[]) {
    if (row.github_login) logins.set(row.user_id, row.github_login);
  }
  return logins;
}

// Any member: active members with names, emails, and pictures from Clerk (one batch).
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
    const ids = rows.map((r) => r.user_id);
    const [profiles, openTasks, githubLogins] = await Promise.all([
      lookupProfiles(ids),
      openTaskCounts(supabase, id),
      githubLoginsOf(supabase, ids),
    ]);
    const members: ProjectMember[] = rows
      .map((r) => {
        const profile = profiles.get(r.user_id);
        return {
          userId: r.user_id,
          role: r.role as ProjectRole,
          joinedAt: r.joined_at,
          name: profile?.name ?? "Unknown member",
          email: profile?.email ?? null,
          imageUrl: profile?.imageUrl ?? null,
          githubLogin: githubLogins.get(r.user_id) ?? null,
          openTaskCount: openTasks.get(r.user_id) ?? 0,
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
