import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/invitations";
import {
  activeProjectIds,
  notificationScope,
  NOTIFICATION_IDS_MAX,
} from "@/lib/notification-feed";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReadInput = { all: true } | { ids: string[]; unread: boolean };

function parseInput(body: unknown): ReadInput | null {
  if (!body || typeof body !== "object") return null;
  const { ids, all, unread } = body as Record<string, unknown>;
  if (all === true && ids === undefined && unread === undefined) {
    return { all: true };
  }
  if (all !== undefined) return null;
  if (unread !== undefined && unread !== true) return null;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > NOTIFICATION_IDS_MAX ||
    !ids.every((id) => typeof id === "string" && isUuid(id))
  ) {
    return null;
  }
  return { ids: ids as string[], unread: unread === true };
}

/** Marks your own rows read or unread (AC-72). Never touches anyone else's. */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = parseInput(await req.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  try {
    const supabase = supabaseServer();
    const scope = notificationScope(await activeProjectIds(supabase, userId));
    const markUnread = "ids" in input && input.unread;

    let query = supabase
      .from("notifications")
      .update({ read_at: markUnread ? null : new Date().toISOString() })
      .eq("user_id", userId)
      .or(scope);
    query =
      "ids" in input ? query.in("id", input.ids) : query.is("read_at", null);

    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notifications] read update failed:", err);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 },
    );
  }
}
