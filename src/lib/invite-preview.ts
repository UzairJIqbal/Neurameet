import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emailMatchesInvite,
  getCallerProfile,
  type InviteRow,
} from "@/lib/invitations";
import { lookupProfiles } from "@/lib/projects";
import type {
  InvitePreview,
  InviteStatus,
  ProjectAvatar,
  ProjectColor,
  ProjectIcon,
} from "@/lib/project-types";

// AC-70s: a link can spread, so counts are all a link invite shows of the team.

const TEAM_LIMIT = 8;

type ProjectFacts = {
  description: string | null;
  icon: ProjectIcon;
  color: ProjectColor;
  created_at: string;
};

const headCount = async (
  supabase: SupabaseClient,
  table: "tasks" | "meetings",
  projectId: string,
): Promise<number> => {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) throw error;
  return count ?? 0;
};

async function loadMembers(supabase: SupabaseClient, projectId: string) {
  const { data, error, count } = await supabase
    .from("project_members")
    .select("user_id", { count: "exact" })
    .eq("project_id", projectId)
    .is("removed_at", null)
    .order("joined_at", { ascending: true })
    .limit(TEAM_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as { user_id: string }[];
  return { ids: rows.map((r) => r.user_id), total: count ?? rows.length };
}

async function loadRepoLine(supabase: SupabaseClient, projectId: string) {
  const { data, error } = await supabase
    .from("github_repos")
    .select("full_name, private")
    .eq("project_id", projectId);
  if (error) throw error;
  const repos = (data ?? []) as { full_name: string; private: boolean }[];
  return {
    repoConnected: repos.length > 0,
    repoName: repos.find((r) => !r.private)?.full_name,
  };
}

const isNamedInInvite = async (
  invite: InviteRow,
  userId: string,
): Promise<boolean> => {
  if (invite.kind !== "email" || !invite.email) return false;
  return emailMatchesInvite(await getCallerProfile(userId), invite.email);
};

export async function loadInvitePreview(
  supabase: SupabaseClient,
  input: {
    invite: InviteRow;
    projectName: string | null;
    status: InviteStatus;
    userId: string;
  },
): Promise<InvitePreview> {
  const { invite, status, userId } = input;
  const projectId = invite.project_id;

  const [project, members, taskCount, meetingCount, repo, named] =
    await Promise.all([
      supabase
        .from("projects")
        .select("description, icon, color, created_at")
        .eq("id", projectId)
        .maybeSingle(),
      loadMembers(supabase, projectId),
      headCount(supabase, "tasks", projectId),
      headCount(supabase, "meetings", projectId),
      loadRepoLine(supabase, projectId),
      isNamedInInvite(invite, userId),
    ]);
  if (project.error) throw project.error;
  const facts = project.data as ProjectFacts | null;

  const profiles = await lookupProfiles([
    invite.created_by,
    ...(named ? members.ids : []),
  ]);
  const team: ProjectAvatar[] = members.ids.map((id) => ({
    name: profiles.get(id)?.name ?? "Unknown member",
    imageUrl: profiles.get(id)?.imageUrl ?? null,
  }));

  return {
    projectName: input.projectName ?? "Project",
    role: invite.role,
    kind: invite.kind,
    status,
    ...(status === "member" ? { projectId } : {}),
    inviterName: profiles.get(invite.created_by)?.name ?? "A project member",
    description: facts?.description ?? null,
    icon: facts?.icon ?? "folder",
    color: facts?.color ?? "primary",
    memberCount: members.total,
    taskCount,
    meetingCount,
    createdAt: facts?.created_at ?? invite.created_at,
    invitedAt: invite.created_at,
    repoConnected: repo.repoConnected,
    ...(repo.repoName ? { repoName: repo.repoName } : {}),
    ...(named ? { team, invitationId: invite.id } : {}),
  };
}
