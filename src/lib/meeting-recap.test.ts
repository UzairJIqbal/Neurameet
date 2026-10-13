// @vitest-environment node
//
// Regression test for the recap participant merge bug (2026-08-27).
//
// A transient socket blip (common on mobile) emits session_participant_left then
// session_participant_joined, which closes the first attendance row and opens a
// second. The first row ends up with session_started_at ~= session_ended_at (a
// ~0s span) while the second, still-open row holds the real talk time. The old
// MIN(start)/MAX(end) merge collapsed to that ~0s row and reported "0s present"
// even though the person spoke (the user saw "0s present · spoke 25s" and a
// "11:15 AM – 11:15 AM" time range). The fixed merge keeps the earliest join,
// extends an open row to the meeting end, and sums talk time.
import { describe, it, expect } from "vitest";
import { mergeAttendanceParticipants } from "./attendance-merge";

type Row = {
  user_id: string | null;
  stream_user_id: string | null;
  participant_name: string | null;
  participant_email: string | null;
  session_started_at: string | null;
  session_ended_at: string | null;
  talk_time_seconds: number | null;
};

describe("mergeAttendanceParticipants", () => {
  it("does not collapse presence to 0s when a blip splits the participant into a degenerate closed row + an open row", () => {
    const meetingEndedAt = "2026-08-27T11:17:00.000Z";
    const rows: Row[] = [
      // Degenerate ~0s blip row (join then immediate leave on reconnect).
      {
        user_id: "u1",
        stream_user_id: null,
        participant_name: "Uzair Javaid Iqbal",
        participant_email: "uzair@example.com",
        session_started_at: "2026-08-27T11:15:00.000Z",
        session_ended_at: "2026-08-27T11:15:05.000Z",
        talk_time_seconds: 0,
      },
      // Real open row holding the actual speech.
      {
        user_id: "u1",
        stream_user_id: null,
        participant_name: "Uzair Javaid Iqbal",
        participant_email: "uzair@example.com",
        session_started_at: "2026-08-27T11:15:30.000Z",
        session_ended_at: null,
        talk_time_seconds: 25,
      },
    ];

    const result = mergeAttendanceParticipants(rows, meetingEndedAt);

    expect(result).toHaveLength(1);
    const p = result[0];
    // Earliest join is kept.
    expect(p.joinedAt).toBe("2026-08-27T11:15:00.000Z");
    // The open row is extended to the meeting end, NOT the degenerate ~0s end.
    expect(p.leftAt).toBe(meetingEndedAt);
    // Talk time is summed, not lost.
    expect(p.talkTimeSeconds).toBe(25);
  });

  it("uses the real leave time when every row is closed", () => {
    const rows: Row[] = [
      {
        user_id: "u2",
        stream_user_id: null,
        participant_name: "Ann",
        participant_email: null,
        session_started_at: "2026-08-27T10:00:00.000Z",
        session_ended_at: "2026-08-27T10:30:00.000Z",
        talk_time_seconds: 5,
      },
      {
        user_id: "u2",
        stream_user_id: null,
        participant_name: "Ann",
        participant_email: null,
        session_started_at: "2026-08-27T10:31:00.000Z",
        session_ended_at: "2026-08-27T10:45:00.000Z",
        talk_time_seconds: 5,
      },
    ];

    const result = mergeAttendanceParticipants(rows, "2026-08-27T11:00:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0].joinedAt).toBe("2026-08-27T10:00:00.000Z");
    // MAX end across closed rows, not the meeting end.
    expect(result[0].leftAt).toBe("2026-08-27T10:45:00.000Z");
    expect(result[0].talkTimeSeconds).toBe(10);
  });

  it("reports a single clean row unchanged", () => {
    const rows: Row[] = [
      {
        user_id: "u3",
        stream_user_id: null,
        participant_name: "Bob",
        participant_email: "bob@example.com",
        session_started_at: "2026-08-27T09:00:00.000Z",
        session_ended_at: "2026-08-27T09:10:00.000Z",
        talk_time_seconds: 10,
      },
    ];

    const result = mergeAttendanceParticipants(rows, "2026-08-27T09:10:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0].joinedAt).toBe("2026-08-27T09:00:00.000Z");
    expect(result[0].leftAt).toBe("2026-08-27T09:10:00.000Z");
    expect(result[0].talkTimeSeconds).toBe(10);
  });

  it("keeps separate guest entries with NULL user_id but distinct emails", () => {
    const meetingEndedAt = "2026-08-27T12:00:00.000Z";
    const rows: Row[] = [
      // Guest 1: no Clerk account, identified by email.
      {
        user_id: null,
        stream_user_id: null,
        participant_name: "Alice Guest",
        participant_email: "alice@example.com",
        session_started_at: "2026-08-27T11:00:00.000Z",
        session_ended_at: null,
        talk_time_seconds: 30,
      },
      // Guest 2: no Clerk account, different email.
      {
        user_id: null,
        stream_user_id: null,
        participant_name: "Bob Guest",
        participant_email: "bob@example.com",
        session_started_at: "2026-08-27T11:05:00.000Z",
        session_ended_at: "2026-08-27T11:50:00.000Z",
        talk_time_seconds: 20,
      },
    ];

    const result = mergeAttendanceParticipants(rows, meetingEndedAt);

    // Each guest must be a SEPARATE participant, not collapsed into one.
    expect(result).toHaveLength(2);
    const alice = result.find((p) => p.email === "alice@example.com");
    const bob = result.find((p) => p.email === "bob@example.com");
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    expect(alice?.talkTimeSeconds).toBe(30);
    expect(bob?.talkTimeSeconds).toBe(20);
    expect(alice?.name).toBe("Alice Guest");
    expect(bob?.name).toBe("Bob Guest");
  });

  it("collapses rows with identical composite keys (same email) into one entry", () => {
    const meetingEndedAt = "2026-08-27T12:00:00.000Z";
    const rows: Row[] = [
      // Same guest rejoining after a blip — same email, different user_id (null).
      {
        user_id: null,
        stream_user_id: null,
        participant_name: "Alice",
        participant_email: "alice@example.com",
        session_started_at: "2026-08-27T11:00:00.000Z",
        session_ended_at: "2026-08-27T11:05:00.000Z",
        talk_time_seconds: 0,
      },
      {
        user_id: null,
        stream_user_id: null,
        participant_name: "Alice",
        participant_email: "alice@example.com",
        session_started_at: "2026-08-27T11:10:00.000Z",
        session_ended_at: null,
        talk_time_seconds: 40,
      },
    ];

    const result = mergeAttendanceParticipants(rows, meetingEndedAt);

    expect(result).toHaveLength(1);
    expect(result[0].talkTimeSeconds).toBe(40);
    expect(result[0].joinedAt).toBe("2026-08-27T11:00:00.000Z");
  });

  it("keeps separate guests identified by stream_user_id even when user_id is null", () => {
    const meetingEndedAt = "2026-08-27T12:00:00.000Z";
    const rows: Row[] = [
      // Guest 1: no Clerk account, identified by stream_user_id.
      {
        user_id: null,
        stream_user_id: "guest-stream-1",
        participant_name: "Alice Guest",
        participant_email: null,
        session_started_at: "2026-08-27T11:00:00.000Z",
        session_ended_at: null,
        talk_time_seconds: 30,
      },
      // Guest 2: no Clerk account, different stream_user_id.
      {
        user_id: null,
        stream_user_id: "guest-stream-2",
        participant_name: "Bob Guest",
        participant_email: null,
        session_started_at: "2026-08-27T11:05:00.000Z",
        session_ended_at: "2026-08-27T11:50:00.000Z",
        talk_time_seconds: 20,
      },
    ];

    const result = mergeAttendanceParticipants(rows, meetingEndedAt);

    // Each guest must be a SEPARATE participant, not collapsed into one.
    expect(result).toHaveLength(2);
    const alice = result.find((p) => p.userId === "guest-stream-1");
    const bob = result.find((p) => p.userId === "guest-stream-2");
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    expect(alice?.talkTimeSeconds).toBe(30);
    expect(bob?.talkTimeSeconds).toBe(20);
    expect(alice?.name).toBe("Alice Guest");
    expect(bob?.name).toBe("Bob Guest");
  });
});
