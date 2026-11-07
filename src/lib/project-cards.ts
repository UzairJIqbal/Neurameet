import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pktToday } from "@/lib/project-select";
import { lookupProfiles, type ClerkProfile } from "@/lib/projects";
import {
  PROJECT_COLORS,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_ICONS,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type ProjectAvatar,
  type ProjectCard,
  type ProjectDetails,
  type ProjectFull,
  type ProjectPatch,
  type ProjectRepoLine,
  type ProjectRole,
  type ProjectTaskStatusKey,
} from "@/lib/project-types";

// My Projects and the project page read one query per concern, never one per
// project (AC-77d).

const AVATAR_CAP = 5;
const NEXT_MEETING_ROWS = 500;
export const SYNC_AUDIT_ACTION = "github.synced";

export const PROJECT_COLUMNS =
  "id, name, task_prefix, created_at, updated_at, description, status, project_type, icon, color";

export type ProjectRow = {
  id: string;
  name: string;
  task_prefix: string;
  created_at: string;
  updated_at: string | null;
  description: string | null;
  status: ProjectDetails["status"] | null;
  project_type: ProjectDetails["projectType"] | null;
  icon: ProjectDetails["icon"] | null;
  color: ProjectDetails["color"] | null;
};

type MemberRow = {
  project_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};
type RepoRow = {
  project_id: string;
  full_name: string;
  private: boolean;
  linked_at: string | null;
};
type CountRow = {
  project_id: string;
  status: ProjectTaskStatusKey;
  total: number | string;
  overdue: number | string;
};

const detailsOf = (row: ProjectRow): ProjectDetails => ({
  description: row.description ?? null,
  status: row.status ?? "active",
  projectType: row.project_type ?? "other",
  icon: row.icon ?? "folder",
  color: row.color ?? "primary",
});

const avatarOf = (profile: ClerkProfile | undefined): ProjectAvatar => ({
  name: profile?.name ?? "Former member",
  imageUrl: profile?.imageUrl ?? null,
});

/** A Viewer sees public repo names only; a private one reads as connected. */
export function repoLineFor(
  repos: Array<Pick<RepoRow, "full_name" | "private">>,
  role: ProjectRole,
): ProjectRepoLine {
  if (repos.length === 0) return { connected: false, name: null };
  const visible = role === "viewer" ? repos.filter((r) => !r.private) : repos;
  return { connected: true, name: visible[0]?.full_name ?? null };
}

async function activeMembers(
  supabase: SupabaseClient,
  ids: string[],
): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id, user_id, role, joined_at")
    .in("project_id", ids)
    .is("removed_at", null)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MemberRow[];
}

async function taskCounts(
  supabase: SupabaseClient,
  ids: string[],
): Promise<CountRow[]> {
  const { data, error } = await supabase.rpc("project_task_counts", {
    p_projects: ids,
    p_today: pktToday(),
  });
  if (error) throw error;
  return (data ?? []) as CountRow[];
}

async function linkedRepos(
  supabase: SupabaseClient,
  ids: string[],
): Promise<RepoRow[]> {
  const { data, error } = await supabase
    .from("github_repos")
    .select("project_id, full_name, private, linked_at")
    .in("project_id", ids)
    .order("linked_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RepoRow[];
}

// A missed meeting stays under Upcoming but is never the next one.
async function nextMeetings(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, { title: string; startedAt: string }>> {
  const { data, error } = await supabase
    .from("meetings")
    .select("project_id, title, started_at")
    .in("project_id", ids)
    .eq("status", "scheduled")
    .gte("started_at", new Date().toISOString())
    .order("started_at", { ascending: true })
    .limit(NEXT_MEETING_ROWS);
  if (error) throw error;
  const next = new Map<string, { title: string; startedAt: string }>();
  const rows = (data ?? []) as Array<{
    project_id: string;
    title: string | null;
    started_at: string;
  }>;
  for (const row of rows) {
    if (next.has(row.project_id)) continue;
    next.set(row.project_id, {
      title: row.title ?? "Untitled meeting",
      startedAt: row.started_at,
    });
  }
  return next;
}

/** The cards for My Projects: four queries and one Clerk batch for any count. */
export async function loadProjectCards(
  supabase: SupabaseClient,
  rows: Array<{ project: ProjectRow; role: ProjectRole }>,
): Promise<ProjectCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.project.id);
  const [members, counts, repos, meetings] = await Promise.all([
    activeMembers(supabase, ids),
    taskCounts(supabase, ids),
    linkedRepos(supabase, ids),
    nextMeetings(supabase, ids),
  ]);

  const owners = new Map<string, string>();
  const shown = new Map<string, string[]>();
  const memberCounts = new Map<string, number>();
  for (const m of members) {
    memberCounts.set(m.project_id, (memberCounts.get(m.project_id) ?? 0) + 1);
    if (m.role === "owner") owners.set(m.project_id, m.user_id);
    const list = shown.get(m.project_id) ?? [];
    if (list.length < AVATAR_CAP) list.push(m.user_id);
    shown.set(m.project_id, list);
  }
  const profiles = await lookupProfiles([
    ...owners.values(),
    ...[...shown.values()].flat(),
  ]);

  return rows.map(({ project, role }) => {
    const mine = counts.filter((c) => c.project_id === project.id);
    const ownerId = owners.get(project.id);
    return {
      id: project.id,
      name: project.name,
      taskPrefix: project.task_prefix,
      role,
      memberCount: memberCounts.get(project.id) ?? 1,
      createdAt: project.created_at,
      ...detailsOf(project),
      ownerName: ownerId
        ? avatarOf(profiles.get(ownerId)).name
        : "Former member",
      repo: repoLineFor(
        repos.filter((r) => r.project_id === project.id),
        role,
      ),
      taskTotal: mine.reduce((sum, c) => sum + Number(c.total), 0),
      taskCompleted: Number(
        mine.find((c) => c.status === "completed")?.total ?? 0,
      ),
      nextMeeting: meetings.get(project.id) ?? null,
      updatedAt: project.updated_at ?? project.created_at,
      avatars: (shown.get(project.id) ?? []).map((id) =>
        avatarOf(profiles.get(id)),
      ),
    };
  });
}

/** The card for a project just made, with nothing to count yet. */
export async function newProjectCard(
  project: ProjectRow,
  userId: string,
): Promise<ProjectCard> {
  const profile = (await lookupProfiles([userId])).get(userId);
  return {
    id: project.id,
    name: project.name,
    taskPrefix: project.task_prefix,
    role: "owner",
    memberCount: 1,
    createdAt: project.created_at,
    ...detailsOf(project),
    ownerName: avatarOf(profile).name,
    repo: { connected: false, name: null },
    taskTotal: 0,
    taskCompleted: 0,
    nextMeeting: null,
    updatedAt: project.updated_at ?? project.created_at,
    avatars: [avatarOf(profile)],
  };
}

type HeadCount = PromiseLike<{ count: number | null; error: unknown }>;

// AC-70g: one failed count blanks only itself.
async function countOrNull(query: HeadCount): Promise<number | null> {
  try {
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.error("[projects] count failed:", err);
    return null;
  }
}

async function taskTotalsOrNull(
  supabase: SupabaseClient,
  projectId: string,
): Promise<
  Pick<ProjectFull, "taskTotals" | "overdueTaskCount" | "openTaskCount">
> {
  try {
    const rows = await taskCounts(supabase, [projectId]);
    const totals: Record<ProjectTaskStatusKey, number> = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      completed: 0,
      blocked: 0,
    };
    let overdue = 0;
    for (const row of rows) {
      totals[row.status] = Number(row.total);
      overdue += Number(row.overdue);
    }
    const all = Object.values(totals).reduce((sum, n) => sum + n, 0);
    return {
      taskTotals: totals,
      overdueTaskCount: overdue,
      openTaskCount: all - totals.completed,
    };
  } catch (err) {
    console.error("[projects] task counts failed:", err);
    return { taskTotals: null, overdueTaskCount: null, openTaskCount: null };
  }
}

// The later of the latest Sync audit row and any link's last sync.
export async function lastSyncedAt(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  try {
    const [audit, links] = await Promise.all([
      supabase
        .from("audit_log")
        .select("created_at")
        .eq("project_id", projectId)
        .eq("action", SYNC_AUDIT_ACTION)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("task_links")
        .select("last_synced_at, tasks!inner(project_id)")
        .eq("tasks.project_id", projectId)
        .not("last_synced_at", "is", null)
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (audit.error) throw audit.error;
    if (links.error) throw links.error;
    const times = [
      (audit.data as { created_at: string } | null)?.created_at,
      (links.data as { last_synced_at: string } | null)?.last_synced_at,
    ].filter((t): t is string => Boolean(t));
    if (times.length === 0) return null;
    return times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
  } catch (err) {
    console.error("[projects] last sync read failed:", err);
    return null;
  }
}

/** The project page's data for one member. */
export async function loadProjectFull(
  supabase: SupabaseClient,
  project: ProjectRow,
  role: ProjectRole,
): Promise<ProjectFull> {
  const id = project.id;
  const [members, repos] = await Promise.all([
    activeMembers(supabase, [id]),
    linkedRepos(supabase, [id]),
  ]);
  const owner = members.find((m) => m.role === "owner");
  const shown = members.slice(0, AVATAR_CAP).map((m) => m.user_id);
  const profiles = await lookupProfiles(
    owner ? [owner.user_id, ...shown] : shown,
  );

  const [
    meetingCount,
    upcomingMeetingCount,
    processedMeetingCount,
    decisionCount,
    linkedPrCount,
    tasks,
    synced,
  ] = await Promise.all([
    countOrNull(
      supabase
        .from("meetings")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id),
    ),
    countOrNull(
      supabase
        .from("meetings")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id)
        .eq("status", "scheduled"),
    ),
    countOrNull(
      supabase
        .from("meeting_insights")
        .select("meeting_id, meetings!inner(project_id)", {
          count: "exact",
          head: true,
        })
        .eq("meetings.project_id", id),
    ),
    countOrNull(
      supabase
        .from("ledger_items")
        .select("id, meetings!inner(project_id)", {
          count: "exact",
          head: true,
        })
        .eq("kind", "decision")
        .eq("meetings.project_id", id),
    ),
    role === "viewer"
      ? Promise.resolve(null)
      : countOrNull(
          supabase
            .from("task_links")
            .select("id, tasks!inner(project_id)", {
              count: "exact",
              head: true,
            })
            .eq("tasks.project_id", id),
        ),
    taskTotalsOrNull(supabase, id),
    repos.length > 0 ? lastSyncedAt(supabase, id) : Promise.resolve(null),
  ]);

  const visibleRepos =
    role === "viewer" ? repos.filter((r) => !r.private) : repos;
  return {
    id,
    name: project.name,
    taskPrefix: project.task_prefix,
    role,
    memberCount: members.length,
    meetingCount: meetingCount ?? 0,
    createdAt: project.created_at,
    ...detailsOf(project),
    ownerName: owner
      ? avatarOf(profiles.get(owner.user_id)).name
      : "Former member",
    avatars: shown.map((userId) => avatarOf(profiles.get(userId))),
    ...tasks,
    upcomingMeetingCount,
    processedMeetingCount,
    decisionCount,
    linkedPrCount,
    github: {
      connected: repos.length > 0,
      repos: visibleRepos.map((r) => ({
        fullName: r.full_name,
        private: r.private,
      })),
      lastSyncedAt: synced,
    },
  };
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const oneOf = <T extends string>(
  allowed: readonly T[],
  value: unknown,
): value is T => typeof value === "string" && allowed.includes(value as T);

/**
 * The optional details on create and on PATCH. Only keys that are present are
 * checked, and no route takes a raw color or a free icon name (AC-70h).
 */
export function parseProjectDetails(
  body: Record<string, unknown>,
): Parsed<Omit<ProjectPatch, "name">> {
  const value: Omit<ProjectPatch, "name"> = {};
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      return { ok: false, error: "Description must be text" };
    }
    const description = body.description.trim();
    if (description.length > PROJECT_DESCRIPTION_MAX) {
      return {
        ok: false,
        error: `Description must be ${PROJECT_DESCRIPTION_MAX} characters or fewer`,
      };
    }
    value.description = description || null;
  } else if (body.description === null) {
    value.description = null;
  }
  if (body.status !== undefined) {
    if (!oneOf(PROJECT_STATUSES, body.status))
      return { ok: false, error: "Unknown status" };
    value.status = body.status;
  }
  if (body.projectType !== undefined) {
    if (!oneOf(PROJECT_TYPES, body.projectType))
      return { ok: false, error: "Unknown project type" };
    value.projectType = body.projectType;
  }
  if (body.icon !== undefined) {
    if (!oneOf(PROJECT_ICONS, body.icon))
      return { ok: false, error: "Unknown icon" };
    value.icon = body.icon;
  }
  if (body.color !== undefined) {
    if (!oneOf(PROJECT_COLORS, body.color))
      return { ok: false, error: "Unknown color" };
    value.color = body.color;
  }
  return { ok: true, value };
}

/** The database columns for a parsed details object. */
export function detailColumns(
  value: Omit<ProjectPatch, "name">,
): Record<string, string | null> {
  const columns: Record<string, string | null> = {};
  if (value.description !== undefined) columns.description = value.description;
  if (value.status) columns.status = value.status;
  if (value.projectType) columns.project_type = value.projectType;
  if (value.icon) columns.icon = value.icon;
  if (value.color) columns.color = value.color;
  return columns;
}
