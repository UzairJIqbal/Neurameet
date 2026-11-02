import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";
import { supabaseServer } from "@/lib/supabase-server";
import {
  accessErrorResponse,
  checkMeetingAccess,
  type MeetingAccessRow,
  type ProjectRole,
} from "@/lib/project-auth";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secretKey = process.env.STREAM_SECRET_KEY;

// Stream call member role for a project role (spec 0004, verified against the
// stream-react skill and @stream-io/node-sdk MemberRequest { user_id, role? }):
// `admin` and `call_member` are built-in call roles on the default call type.
function streamCallRole(role: ProjectRole): "admin" | "call_member" {
  return role === "owner" || role === "admin" ? "admin" : "call_member";
}

// `id` here is the Stream call id (MeetingSetup posts call.id). A project
// meeting needs an active member (any role, non member 404) and sets the call
// member role from the project role; a personal meeting (or a call with no
// meetings row yet) is unchanged: the caller joins as a plain member.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  const { id } = await params;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!id) {
    return NextResponse.json({ error: "Missing meeting id" }, { status: 400 });
  }

  if (!apiKey || !secretKey) {
    return NextResponse.json(
      { error: "Missing API configuration" },
      { status: 500 },
    );
  }

  let callRole: "admin" | "call_member" | undefined;
  try {
    const supabase = supabaseServer();
    const { data: meeting, error } = await supabase
      .from("meetings")
      .select("id, user_id, project_id")
      .eq("stream_call_id", id)
      .maybeSingle();
    if (error) {
      console.error("[meetings/members] meeting lookup failed:", error);
      return NextResponse.json(
        { error: "Failed to load meeting" },
        { status: 500 },
      );
    }
    const row = meeting as MeetingAccessRow | null;
    if (row?.project_id) {
      const access = await checkMeetingAccess(supabase, userId, row, "read");
      if (access.role) callRole = streamCallRole(access.role);
    }
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[meetings/members] access check failed:", err);
    return NextResponse.json(
      { error: "Failed to load meeting" },
      { status: 500 },
    );
  }

  try {
    const client = new StreamClient(apiKey, secretKey);
    const call = client.video.call("default", id);

    await call.get();
    await call.updateCallMembers({
      update_members: [
        callRole ? { user_id: userId, role: callRole } : { user_id: userId },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meeting not found";

    return NextResponse.json({ error: message }, { status: 404 });
  }
}
