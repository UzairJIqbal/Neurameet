import "server-only";
import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyStreamUserToken } from "@/lib/stream-token";
import {
  accessErrorResponse,
  canManageMeeting,
  checkMeetingAccess,
  getProjectRole,
  type MeetingAccessRow,
} from "@/lib/project-auth";

export interface LiveMeeting {
  id: string;
  ownerId: string;
  projectId: string | null;
}

export interface LiveCaller {
  meeting: LiveMeeting;
  callerId: string;
  /** Can manage the call: the creator of a personal meeting, an Owner or Admin of a project meeting. */
  isOwner: boolean;
}

// What every owner only live route returned to a non owner before W1.
const LIVE_NOT_FOUND = { status: 404, message: "Meeting not found" } as const;

/** The stored meeting for a Stream call, or null when there is none. */
export async function findLiveMeeting(
  supabase: SupabaseClient,
  callId: string,
): Promise<LiveMeeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select("id, user_id, project_id")
    .eq("stream_call_id", callId)
    .maybeSingle();
  if (error) throw error;
  const row = data as {
    id: string;
    user_id: string;
    project_id?: string | null;
  } | null;
  return row
    ? { id: row.id, ownerId: row.user_id, projectId: row.project_id ?? null }
    : null;
}

const toAccessRow = (meeting: LiveMeeting): MeetingAccessRow => ({
  id: meeting.id,
  user_id: meeting.ownerId,
  project_id: meeting.projectId ?? null,
});

/**
 * Boolean "manage" check for a live meeting: the creator of a personal
 * meeting, or an Owner or Admin of a project meeting.
 */
export function isLiveManager(
  supabase: SupabaseClient,
  userId: string,
  meeting: LiveMeeting,
): Promise<boolean> {
  return canManageMeeting(supabase, userId, toAccessRow(meeting));
}

/**
 * The gate for every owner only live route, for a meeting the route already
 * found. Returns the denial response, or null when the caller may manage.
 * Personal meeting: anyone but the creator gets 404 "Meeting not found",
 * exactly as before. Project meeting: a non member gets 404, a Developer or
 * Viewer 403, an Owner or Admin passes. Rights always come from the stored
 * meeting, never the client's call state.
 */
export async function liveManagerDenial(
  supabase: SupabaseClient,
  userId: string,
  meeting: LiveMeeting,
): Promise<NextResponse | null> {
  try {
    await checkMeetingAccess(supabase, userId, toAccessRow(meeting), "manage", {
      personalDenied: LIVE_NOT_FOUND,
    });
    return null;
  } catch (err) {
    const response = accessErrorResponse(err);
    if (response) return response;
    throw err;
  }
}

/**
 * Who is calling a participant route (spec 0002, participant check): a
 * manager, an active member of the meeting's project, a signed in user with an
 * attendance row for the meeting, or a guest whose Stream token Stream
 * accepts. Null means 403. Client ids are never trusted.
 */
export async function resolveLiveCaller(
  supabase: SupabaseClient,
  {
    callId,
    authUserId,
    guestStreamToken,
  }: {
    callId: string;
    authUserId: string | null;
    guestStreamToken: string | null;
  },
): Promise<LiveCaller | null> {
  const meeting = await findLiveMeeting(supabase, callId);
  if (!meeting) return null;

  if (authUserId) {
    if (await isLiveManager(supabase, authUserId, meeting)) {
      return { meeting, callerId: authUserId, isOwner: true };
    }
    if (
      meeting.projectId &&
      (await getProjectRole(supabase, authUserId, meeting.projectId))
    ) {
      return { meeting, callerId: authUserId, isOwner: false };
    }
    const { data, error } = await supabase
      .from("attendance_events")
      .select("id")
      .eq("meeting_id", meeting.id)
      .eq("user_id", authUserId)
      .limit(1);
    if (error) throw error;
    return (data ?? []).length > 0
      ? { meeting, callerId: authUserId, isOwner: false }
      : null;
  }

  if (!guestStreamToken) return null;
  const guestId = await verifyStreamUserToken(guestStreamToken, callId);
  return guestId ? { meeting, callerId: guestId, isOwner: false } : null;
}
