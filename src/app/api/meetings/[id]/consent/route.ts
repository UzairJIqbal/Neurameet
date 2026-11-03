import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  accessErrorResponse,
  checkMeetingAccess,
  type MeetingAccessRow,
} from "@/lib/project-auth";
import { CONSENT_NOTICE_VERSION } from "@/lib/consent";

const NOT_FOUND = { error: "Meeting not found" };

// POST /api/meetings/[id]/consent (W3, AC-26). `id` is the Stream call id.
// Stores the member's recording notice tick right before they join a project
// call; /members then checks it is fresh. Personal meetings have no notice (404).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const noticeVersion =
    body && typeof body === "object"
      ? (body as { noticeVersion?: unknown }).noticeVersion
      : undefined;
  if (noticeVersion !== CONSENT_NOTICE_VERSION) {
    return NextResponse.json(
      { error: "This notice is out of date, reload the page" },
      { status: 422 },
    );
  }

  try {
    const supabase = supabaseServer();
    const { data: meeting, error } = await supabase
      .from("meetings")
      .select("id, user_id, project_id")
      .eq("stream_call_id", id)
      .maybeSingle();
    if (error) {
      console.error("[meetings/consent] meeting lookup failed:", error);
      return NextResponse.json(
        { error: "Failed to save your answer" },
        { status: 500 },
      );
    }
    const row = meeting as MeetingAccessRow | null;
    if (!row?.project_id) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    // Any active member may join; a non member gets the same 404.
    await checkMeetingAccess(supabase, userId, row, "read");

    const { error: upsertError } = await supabase
      .from("meeting_participants")
      .upsert(
        {
          meeting_id: row.id,
          user_id: userId,
          consented_at: new Date().toISOString(),
          notice_version: CONSENT_NOTICE_VERSION,
        },
        { onConflict: "meeting_id,user_id" },
      );
    if (upsertError) {
      console.error("[meetings/consent] upsert failed:", upsertError);
      return NextResponse.json(
        { error: "Failed to save your answer" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[meetings/consent] failed:", err);
    return NextResponse.json(
      { error: "Failed to save your answer" },
      { status: 500 },
    );
  }
}
