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
import {
  CONSENT_REQUIRED_MESSAGE,
  isConsentFresh,
  type ConsentRow,
} from "@/lib/consent";
import { callTypeOfRow } from "@/lib/stream-call-type-server";
import { DEFAULT_CALL_TYPE, type StreamCallType } from "@/lib/stream-call-type";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secretKey = process.env.STREAM_SECRET_KEY;

// Stream call member role for a project role (spec 0004, verified against the
// stream-react skill and @stream-io/node-sdk MemberRequest { user_id, role? }):
// `admin` and `call_member` are built-in call roles on the default and project call types.
function streamCallRole(role: ProjectRole): "admin" | "call_member" {
  return role === "owner" || role === "admin" ? "admin" : "call_member";
}

// The caller's latest consent tick for a project meeting (W3, AC-26).
async function hasFreshConsent(
  supabase: ReturnType<typeof supabaseServer>,
  meetingId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("meeting_participants")
    .select("consented_at, notice_version")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return isConsentFresh(data as ConsentRow | null);
}

// `id` here is the Stream call id (MeetingSetup posts call.id). A project
// meeting needs an active member (any role, non member 404) checked again on
// every call, a fresh consent tick (409 otherwise), and sets the call member
// role from the project role; a personal meeting (or a call with no meetings
// row yet) is unchanged: the caller joins as a plain member.
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
  let callType: StreamCallType = DEFAULT_CALL_TYPE;
  try {
    const supabase = supabaseServer();
    const { data: meeting, error } = await supabase
      .from("meetings")
      .select("id, user_id, project_id, stream_call_type")
      .eq("stream_call_id", id)
      .maybeSingle();
    if (error) {
      console.error("[meetings/members] meeting lookup failed:", error);
      return NextResponse.json(
        { error: "Failed to load meeting" },
        { status: 500 },
      );
    }
    const row = meeting as (MeetingAccessRow & { stream_call_type?: unknown }) | null;
    callType = callTypeOfRow(row);
    if (row?.project_id) {
      const access = await checkMeetingAccess(supabase, userId, row, "read");
      if (!(await hasFreshConsent(supabase, row.id, userId))) {
        return NextResponse.json(
          { error: CONSENT_REQUIRED_MESSAGE },
          { status: 409 },
        );
      }
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
    const call = client.video.call(callType, id);

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
