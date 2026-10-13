import { StreamClient } from "@stream-io/node-sdk";
import { supabaseServer } from "@/lib/supabase-server";
import {
  mergeAttendanceParticipants,
  type RecapParticipant,
} from "@/lib/attendance-merge";

export type { RecapParticipant } from "@/lib/attendance-merge";

export interface MeetingRecap {
  id: string;
  title: string;
  description: string;
  status: string;
  streamCallId: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  user_id: string;
  participants: RecapParticipant[];
}

// Includes stream_user_id so guests (who have NULL user_id) can be
// uniquely identified alongside the composite key used in mergeAttendanceParticipants.
type AttendanceRowSelect = {
  user_id: string | null;
  stream_user_id: string | null;
  participant_name: string | null;
  participant_email: string | null;
  session_started_at: string | null;
  session_ended_at: string | null;
  talk_time_seconds: number | null;
};

type StreamCallWithCustom = { custom?: { description?: string } };

/**
 * Public, server-only loader for the post-call recap page. Unlike
 * `GET /api/meetings/[id]` this does NOT require Clerk auth and does NOT
 * restrict to the owner, because the recap page must be viewable by anyone
 * with the link (only the Generate Transcript action is gated). Reads the
 * meeting row + distinct participants from `attendance_events`, and best-effort
 * pulls the description from the Stream call `custom.description` (the meetings
 * table has no description column).
 */
export async function getMeetingRecap(id: string): Promise<MeetingRecap | null> {
  const supabase = supabaseServer();

  // The recap URL carries the Stream call id (call.id), which is stored in the
  // meetings.stream_call_id column. The Supabase meetings.id is a separate
  // auto generated uuid and does NOT match it, so look up by stream_call_id.
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select(
      "id, title, status, stream_call_id, started_at, ended_at, created_at, user_id",
    )
    .eq("stream_call_id", id)
    .single();

  if (meetingError || !meeting) return null;

  const { data: attendance } = await supabase
    .from("attendance_events")
    .select(
      "user_id, stream_user_id, participant_name, participant_email, session_started_at, session_ended_at, talk_time_seconds",
    )
    .eq("meeting_id", meeting.id)
    .order("session_started_at", { ascending: true });

  // A participant can span MULTIPLE attendance rows: a transient socket blip
  // (common on mobile) emits session_participant_left then
  // session_participant_joined, which closes the first row and opens a second.
  // The first row then has session_started_at ≈ session_ended_at (a ~0s span)
  // while the second, still-open row holds the real talk_time. A naive
  // MIN(start)/MAX(end) collapse would pick that ~0s row as the MAX end and
  // report "0s present" even though the person spoke. So we keep the earliest
  // join, and for the leave we extend any OPEN row (null session_ended_at) to the
  // meeting's ended_at — a participant who never fired a clean leave is present
  // until the meeting ended. Talk time is summed across rows.
  const participants = mergeAttendanceParticipants(
    attendance ?? [],
    meeting.ended_at,
  );

  let description = "";
  try {
    const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
    const secret = process.env.STREAM_SECRET_KEY;
    if (apiKey && secret) {
      const client = new StreamClient(apiKey, secret);
      const call = client.video.call("default", meeting.stream_call_id);
      const callData = (await call.get()) as StreamCallWithCustom;
      description = callData.custom?.description ?? "";
    }
  } catch {
    description = "";
  }

  return {
    id: meeting.id,
    title: meeting.title,
    description,
    status: meeting.status,
    streamCallId: meeting.stream_call_id,
    startedAt: meeting.started_at,
    endedAt: meeting.ended_at,
    createdAt: meeting.created_at,
    user_id: meeting.user_id,
    // The recap page is public (anyone with the link), so attendee emails never
    // leave the server here; names and times are enough for the recap.
    participants: participants.map((p) => ({ ...p, email: null })),
  };
}
