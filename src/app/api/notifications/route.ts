import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationKind,
} from "@/lib/notifications";
import {
  activeProjectIds,
  categoryCounts,
  categoryOfKind,
  countUnread,
  isNotificationCategory,
  notificationScope,
  NOTIFICATION_PAGE_SIZE,
} from "@/lib/notification-feed";
import { cursorFilter, pageOf, parseCursor } from "@/lib/project-select";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationRow = {
  id: string;
  project_id: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
};

async function projectNames(
  supabase: ReturnType<typeof supabaseServer>,
  rows: NotificationRow[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(rows.flatMap((r) => (r.project_id ? [r.project_id] : []))),
  ];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  return new Map(
    (data ?? []).map((p: { id: string; name: string }) => [p.id, p.name]),
  );
}

/** Your latest notifications, one page at a time (AC-72, AC-72a). */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? parseCursor(rawCursor, "notifications") : null;
  if (rawCursor && !cursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 422 });
  }
  const category = params.get("category");
  if (category && !isNotificationCategory(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 422 });
  }

  try {
    const supabase = supabaseServer();
    const scope = notificationScope(await activeProjectIds(supabase, userId));

    let query = supabase
      .from("notifications")
      .select("id, project_id, kind, title, body, link, read_at, created_at")
      .eq("user_id", userId)
      .or(scope);
    if (params.get("unread") === "1") query = query.is("read_at", null);
    if (category && isNotificationCategory(category)) {
      query = query.in("kind", [...NOTIFICATION_CATEGORIES[category]]);
    }
    if (cursor) query = query.or(cursorFilter("created_at", "id", cursor));

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(NOTIFICATION_PAGE_SIZE + 1);
    if (error) throw error;

    const { page, next } = pageOf(
      (data ?? []) as NotificationRow[],
      (r) => `${r.created_at}|${r.id}`,
      NOTIFICATION_PAGE_SIZE,
    );
    const [names, unreadCount, counts] = await Promise.all([
      projectNames(supabase, page),
      countUnread(supabase, userId, scope),
      categoryCounts(supabase, userId, scope),
    ]);

    return NextResponse.json({
      items: page.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project_id ? (names.get(r.project_id) ?? null) : null,
        kind: r.kind,
        category: categoryOfKind(r.kind),
        title: r.title,
        body: r.body,
        link: r.link,
        readAt: r.read_at,
        createdAt: r.created_at,
      })),
      unreadCount,
      categoryCounts: counts,
      nextCursor: next,
    });
  } catch (err) {
    console.error("[notifications] list failed:", err);
    return NextResponse.json(
      { error: "Failed to load notifications" },
      { status: 500 },
    );
  }
}
