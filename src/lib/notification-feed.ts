import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationKind,
} from "@/lib/notifications";

// AC-72: every read covers only projects you are an active member of, so leaving
// a project hides its rows. A project invitation is the one exception: you are
// not a member yet when it arrives.

export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_IDS_MAX = 100;

const CATEGORY_NAMES = Object.keys(
  NOTIFICATION_CATEGORIES,
) as NotificationCategory[];

export const isNotificationCategory = (
  value: string,
): value is NotificationCategory =>
  (CATEGORY_NAMES as string[]).includes(value);

export function categoryOfKind(kind: NotificationKind): NotificationCategory {
  const match = CATEGORY_NAMES.find((name) =>
    (NOTIFICATION_CATEGORIES[name] as readonly string[]).includes(kind),
  );
  return match ?? "projects";
}

export async function activeProjectIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId)
    .is("removed_at", null);
  if (error) throw error;
  return (data ?? []).map((r: { project_id: string }) => r.project_id);
}

/** The PostgREST `or` filter for the rows you may see. Ids come from our own table. */
export function notificationScope(projectIds: string[]): string {
  const invitation = "kind.eq.project_invitation";
  return projectIds.length > 0
    ? `project_id.in.(${projectIds.join(",")}),${invitation}`
    : invitation;
}

/** Your unread rows in scope, optionally of certain kinds. */
export async function countUnread(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
  kinds?: readonly string[],
): Promise<number> {
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
    .or(scope);
  if (kinds) query = query.in("kind", [...kinds]);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export type CategoryCounts = Record<"all" | NotificationCategory, number>;

async function countAll(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
  kinds?: readonly string[],
): Promise<number> {
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .or(scope);
  if (kinds) query = query.in("kind", [...kinds]);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function categoryCounts(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
): Promise<CategoryCounts> {
  const [all, tasks, meetings, github, projects] = await Promise.all([
    countAll(supabase, userId, scope),
    countAll(supabase, userId, scope, NOTIFICATION_CATEGORIES.tasks),
    countAll(supabase, userId, scope, NOTIFICATION_CATEGORIES.meetings),
    countAll(supabase, userId, scope, NOTIFICATION_CATEGORIES.github),
    countAll(supabase, userId, scope, NOTIFICATION_CATEGORIES.projects),
  ]);
  return { all, tasks, meetings, github, projects };
}
