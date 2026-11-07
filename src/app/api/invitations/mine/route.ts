import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { emailMatchesInvite, getCallerProfile } from "@/lib/invitations";
import { lookupProfiles } from "@/lib/projects";
import type {
  InviteRole,
  MyInvitation,
  MyInvitationsResponse,
  ProjectColor,
  ProjectIcon,
} from "@/lib/project-types";

const LIST_LIMIT = 20;

type Row = {
  id: string;
  project_id: string;
  role: InviteRole;
  created_by: string;
  created_at: string;
  expires_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  icon: ProjectIcon;
  color: ProjectColor;
};

const respond = (invitations: MyInvitation[]) =>
  NextResponse.json({ invitations } satisfies MyInvitationsResponse);

// Signed in: active email invites for your verified primary email (AC-70t).
// Never a token, and empty when your email is unverified.
export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const caller = await getCallerProfile(userId);
    if (!caller.email || !emailMatchesInvite(caller, caller.email)) {
      return respond([]);
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("project_invitations")
      .select("id, project_id, role, created_by, created_at, expires_at")
      .eq("kind", "email")
      .eq("email", caller.email)
      .is("revoked_at", null)
      .is("used_at", null)
      .is("declined_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return respond([]);

    const projectIds = [...new Set(rows.map((r) => r.project_id))];
    const [members, projects, profiles] = await Promise.all([
      supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", userId)
        .in("project_id", projectIds)
        .is("removed_at", null),
      supabase
        .from("projects")
        .select("id, name, description, icon, color")
        .in("id", projectIds),
      lookupProfiles(rows.map((r) => r.created_by)),
    ]);
    if (members.error) throw members.error;
    if (projects.error) throw projects.error;

    const joined = new Set(
      ((members.data ?? []) as { project_id: string }[]).map(
        (m) => m.project_id,
      ),
    );
    const byId = new Map(
      ((projects.data ?? []) as ProjectRow[]).map((p) => [p.id, p]),
    );

    const invitations: MyInvitation[] = [];
    for (const row of rows) {
      const project = byId.get(row.project_id);
      if (!project || joined.has(row.project_id)) continue;
      invitations.push({
        id: row.id,
        projectId: row.project_id,
        projectName: project.name,
        description: project.description,
        icon: project.icon,
        color: project.color,
        role: row.role,
        inviterName: profiles.get(row.created_by)?.name ?? "A project member",
        invitedAt: row.created_at,
        expiresAt: row.expires_at,
      });
    }
    return respond(invitations);
  } catch (err) {
    console.error("[invitations] mine failed:", err);
    return NextResponse.json(
      { error: "Failed to load your invitations" },
      { status: 500 },
    );
  }
}
