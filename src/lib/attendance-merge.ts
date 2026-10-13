// Pure, server-free aggregation of attendance rows into recap participants.
// Kept separate from meeting-recap.ts so it can be unit-tested without pulling
// in the server-only Supabase client.
import { normalizeSpeakerName } from "@/lib/speaker-name";

export interface RecapParticipant {
  userId: string | null;
  name: string;
  email: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  talkTimeSeconds: number;
}

export type RawAttendanceRow = {
  user_id: string | null;
  stream_user_id: string | null;
  participant_name: string | null;
  participant_email: string | null;
  session_started_at: string | null;
  session_ended_at: string | null;
  talk_time_seconds: number | null;
};

/**
 * Collapse possibly-many attendance rows per user into one RecapParticipant.
 *
 * A participant can span MULTIPLE rows: a transient socket blip (common on
 * mobile) emits session_participant_left then session_participant_joined, which
 * closes the first row and opens a second. The first row then has
 * session_started_at ~= session_ended_at (a ~0s span) while the second,
 * still-open row holds the real talk_time. A naive MIN(start)/MAX(end) merge
 * would pick that ~0s row as the MAX end and report "0s present" even though
 * the person spoke. So we keep the earliest join, extend any OPEN row (null
 * session_ended_at) to the meeting's ended_at, and sum talk time across rows.
 */
export function mergeAttendanceParticipants(
  attendance: RawAttendanceRow[],
  meetingEndedAt: string | null,
): RecapParticipant[] {
  type Acc = RecapParticipant & { anyOpen: boolean };

  const byUser = new Map<string, Acc>();
  for (const row of attendance ?? []) {
    const rowStart = row.session_started_at ?? null;
    const rowEnd = row.session_ended_at ?? null;
    const rowKey =
      row.user_id ?? row.stream_user_id ?? row.participant_email ?? row.participant_name ?? "";
    const existing = byUser.get(rowKey);

    if (!existing) {
      byUser.set(rowKey, {
        userId: row.user_id ?? row.stream_user_id,
        // Normalize the stored name so a duplicated token from the Clerk
        // profile ("Uzair Javaid Javaid Iqbal") collapses even on rows that
        // were written before the client started normalizing at the source.
        name: normalizeSpeakerName(
          row.participant_name ?? row.participant_email ?? "Unknown",
        ),
        email: row.participant_email ?? null,
        joinedAt: rowStart,
        leftAt: rowEnd,
        anyOpen: rowEnd === null,
        talkTimeSeconds: row.talk_time_seconds ?? 0,
      });
      continue;
    }

    // Earliest join wins.
    if (rowStart && (!existing.joinedAt || rowStart < existing.joinedAt)) {
      existing.joinedAt = rowStart;
    }
    // Latest concrete leave wins.
    if (rowEnd) {
      if (!existing.leftAt || rowEnd > existing.leftAt) existing.leftAt = rowEnd;
    } else {
      // A still-open row means this participant never fired a clean leave.
      existing.anyOpen = true;
    }
    existing.talkTimeSeconds += row.talk_time_seconds ?? 0;
  }

  return Array.from(byUser.values()).map((p) => ({
    userId: p.userId,
    name: p.name,
    email: p.email,
    joinedAt: p.joinedAt,
    // Extend an open row to the meeting end so presence reflects the full call
    // rather than collapsing to a ~0s blip window.
    leftAt: p.anyOpen ? (meetingEndedAt ?? p.leftAt) : p.leftAt,
    talkTimeSeconds: p.talkTimeSeconds,
  }));
}
