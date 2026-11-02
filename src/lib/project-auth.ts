import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// The shared role check for Phase W (spec 0004, "Authorization contract").
// Every check reads project_members on every request: there is no role cache,
// so a removed member loses access on their very next request.

import type { ProjectRole } from "@/lib/project-types";

export type { ProjectRole };
export type MeetingNeed = "read" | "content" | "manage" | "owner";

export const PROJECT_ROLES: readonly ProjectRole[] = [
  "owner",
  "admin",
  "developer",
  "viewer",
];

export const NEED_ROLES: Record<MeetingNeed, readonly ProjectRole[]> = {
  read: ["owner", "admin", "developer", "viewer"],
  content: ["owner", "admin", "developer"],
  manage: ["owner", "admin"],
  owner: ["owner"],
};

export class ProjectAccessError extends Error {
  constructor(
    public status: 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "ProjectAccessError";
  }
}

export const NOT_FOUND_MESSAGE = "Not found";
export const FORBIDDEN_MESSAGE = "Not authorized";

export function isProjectRole(value: unknown): value is ProjectRole {
  return (
    typeof value === "string" && PROJECT_ROLES.includes(value as ProjectRole)
  );
}

// Returns the caller's active role, or null when they are not an active member
// (or the project does not exist; the two are never told apart).
export async function getProjectRole(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const { data, error } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();
  if (error) {
    console.error("[project-auth] member lookup failed:", error);
    return null;
  }
  const role = (data as { role?: unknown } | null)?.role;
  return isProjectRole(role) ? role : null;
}

// Throws 404 when the caller is not an active member (never reveals the project
// exists), 403 when the caller's role is not in `allowed`.
export async function requireProjectRole(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  allowed: readonly ProjectRole[],
  notFoundMessage: string = NOT_FOUND_MESSAGE,
): Promise<{ role: ProjectRole }> {
  const role = await getProjectRole(supabase, userId, projectId);
  if (!role) throw new ProjectAccessError(404, notFoundMessage);
  if (!allowed.includes(role)) {
    throw new ProjectAccessError(403, FORBIDDEN_MESSAGE);
  }
  return { role };
}

export type MeetingAccessRow = {
  id: string;
  user_id: string | null;
  project_id?: string | null;
};

export type MeetingAccessOptions = {
  // The route's existing participant rule for personal meetings, unchanged.
  personalFallback?: () => Promise<boolean>;
  // What a personal meeting denial returned before W1 (kept so behavior is the same).
  personalDenied?: { status: 403 | 404; message: string };
  // Body for a missing meeting and for a non member of a project meeting.
  notFoundMessage?: string;
};

export type MeetingAccess = {
  meetingId: string;
  projectId: string | null;
  role: ProjectRole | null;
  isCreator: boolean;
};

// Gate for a meeting row the route already loaded. Personal meeting: the
// creator always passes, otherwise the route's own fallback decides. Project
// meeting: the role matrix decides (read any role, content owner/admin/developer,
// manage owner/admin, owner owner).
export async function checkMeetingAccess(
  supabase: SupabaseClient,
  userId: string,
  meeting: MeetingAccessRow,
  need: MeetingNeed,
  options: MeetingAccessOptions = {},
): Promise<MeetingAccess> {
  const notFound = options.notFoundMessage ?? "Meeting not found";
  const projectId = meeting.project_id ?? null;
  const isCreator = meeting.user_id === userId;

  if (!projectId) {
    if (isCreator) {
      return { meetingId: meeting.id, projectId: null, role: null, isCreator };
    }
    if (options.personalFallback && (await options.personalFallback())) {
      return { meetingId: meeting.id, projectId: null, role: null, isCreator };
    }
    const denied = options.personalDenied ?? { status: 404, message: notFound };
    throw new ProjectAccessError(denied.status, denied.message);
  }

  const { role } = await requireProjectRole(
    supabase,
    userId,
    projectId,
    NEED_ROLES[need],
    notFound,
  );
  return { meetingId: meeting.id, projectId, role, isCreator };
}

// Same gate, loading the meeting by id first.
export async function requireMeetingAccess(
  supabase: SupabaseClient,
  userId: string,
  meetingId: string,
  need: MeetingNeed,
  options: MeetingAccessOptions = {},
): Promise<MeetingAccess> {
  const { data, error } = await supabase
    .from("meetings")
    .select("id, user_id, project_id")
    .eq("id", meetingId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[project-auth] meeting lookup failed:", error);
    throw new ProjectAccessError(
      404,
      options.notFoundMessage ?? "Meeting not found",
    );
  }
  return checkMeetingAccess(
    supabase,
    userId,
    data as MeetingAccessRow,
    need,
    options,
  );
}

// Turns a ProjectAccessError into its JSON response; anything else returns null
// so the caller keeps its own error handling.
export function accessErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof ProjectAccessError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}

// Boolean form of the "manage" need, for flags such as canManage or isOwner:
// the creator on a personal meeting, an Owner or Admin on a project meeting.
export async function canManageMeeting(
  supabase: SupabaseClient,
  userId: string,
  meeting: MeetingAccessRow,
): Promise<boolean> {
  if (!meeting.project_id) return meeting.user_id === userId;
  const role = await getProjectRole(supabase, userId, meeting.project_id);
  return role !== null && NEED_ROLES.manage.includes(role);
}
