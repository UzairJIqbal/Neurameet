import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  activeProjectIds,
  countUnread,
  notificationScope,
} from "@/lib/notification-feed";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = ReturnType<typeof supabaseServer>;

async function countOpenTasks(
  supabase: Db,
  userId: string,
  projectIds: string[],
): Promise<number> {
  if (projectIds.length === 0) return 0;
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assignee_id", userId)
    .in("project_id", projectIds)
    .neq("status", "completed");
  if (error) throw error;
  return count ?? 0;
}

// Scheduled meetings from now on, in your active projects or your own personal ones.
async function countUpcomingMeetings(
  supabase: Db,
  userId: string,
  projectIds: string[],
): Promise<number> {
  const personal = `and(user_id.eq.${userId},project_id.is.null)`;
  const scope =
    projectIds.length > 0
      ? `project_id.in.(${projectIds.join(",")}),${personal}`
      : personal;
  const { count, error } = await supabase
    .from("meetings")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled")
    .gte("started_at", new Date().toISOString())
    .or(scope);
  if (error) throw error;
  return count ?? 0;
}

/** The sidebar counts (AC-77a). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = supabaseServer();
    const projectIds = await activeProjectIds(supabase, userId);
    const scope = notificationScope(projectIds);
    const [openTasks, upcomingMeetings, unread, prReviews] = await Promise.all([
      countOpenTasks(supabase, userId, projectIds),
      countUpcomingMeetings(supabase, userId, projectIds),
      countUnread(supabase, userId, scope),
      countUnread(supabase, userId, scope, ["pr_review_requested"]),
    ]);
    return NextResponse.json({
      openTasks,
      upcomingMeetings,
      unread,
      prReviews,
    });
  } catch (err) {
    console.error("[my-counts] read failed:", err);
    return NextResponse.json(
      { error: "Failed to load counts" },
      { status: 500 },
    );
  }
}
