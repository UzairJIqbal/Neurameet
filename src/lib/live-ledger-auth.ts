import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyStreamUserToken } from "@/lib/stream-token";

export interface LiveMeeting {
  id: string;
  ownerId: string;
}

export interface LiveCaller {
  meeting: LiveMeeting;
  callerId: string;
  isOwner: boolean;
}

/** The stored meeting for a Stream call, or null when there is none. */
export async function findLiveMeeting(
  supabase: SupabaseClient,
  callId: string,
): Promise<LiveMeeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select("id, user_id")
    .eq("stream_call_id", callId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { id: string; user_id: string } | null;
  return row ? { id: row.id, ownerId: row.user_id } : null;
}

/**
 * Who is calling a participant route (spec 0002, participant check): the
 * owner, a signed in user with an attendance row for the meeting, or a guest
 * whose Stream token Stream accepts. Null means 403. Client ids are never
 * trusted.
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
    if (authUserId === meeting.ownerId) {
      return { meeting, callerId: authUserId, isOwner: true };
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
