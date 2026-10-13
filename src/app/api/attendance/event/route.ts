/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyStreamUserToken } from "@/lib/stream-token";

type AttendanceEventType =
  | "join"
  | "leave"
  | "mic_on"
  | "mic_off"
  | "camera_on"
  | "call_ended";

interface AttendanceEventBody {
  stream_call_id: string;
  user_id?: string | null;
  stream_user_id?: string | null;
  // Guests have no Clerk session; they prove identity with their Stream token.
  guest_stream_token?: string | null;
  participant_email?: string | null;
  participant_name?: string | null;
  event_type: AttendanceEventType;
}

const VALID_EVENTS: ReadonlySet<string> = new Set([
  "join",
  "leave",
  "mic_on",
  "mic_off",
  "camera_on",
  "call_ended",
]);

function secondsBetween(laterIso: string, earlierIso: string): number {
  const deltaMs =
    new Date(laterIso).getTime() - new Date(earlierIso).getTime();
  return Math.max(0, Math.round(deltaMs / 1000));
}

interface CallInfo {
  title: string;
  ownerId: string | null;
}

// Resolve the meeting title and owner from the Stream call. Stream stores the
// human title in custom (e.g. "Instant Meeting" / the scheduled description);
// the Supabase meetings row is created later (first attendance event) and must
// copy it, otherwise the dashboard "Meeting Title" column is always blank. The
// owner is the call's creator, never the caller. ownerId is null if the call
// can't be read.
async function resolveCallInfo(streamCallId: string): Promise<CallInfo> {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secretKey = process.env.STREAM_SECRET_KEY;
  if (!apiKey || !secretKey) return { title: "Meeting", ownerId: null };
  try {
    const client = new StreamClient(apiKey, secretKey);
    const call = client.video.call("default", streamCallId);
    const data = await call.get();
    // Scheduled meetings store the real title in custom.title; instant/personal
    // calls use custom.description. Prefer title, fall back to description.
    const custom = data.call?.custom as
      | { title?: string; description?: string }
      | undefined;
    const title = custom?.title?.trim() || custom?.description?.trim();
    return {
      title: title ? title : "Meeting",
      ownerId: data.call?.created_by?.id ?? null,
    };
  } catch {
    return { title: "Meeting", ownerId: null };
  }
}

// Signed-in callers are identified by their Clerk session; guests by a Stream
// token that Stream itself accepts. Body-supplied ids are never trusted.
async function resolveCallerId(
  authUserId: string | null,
  body: AttendanceEventBody,
): Promise<string | null> {
  if (authUserId) return authUserId;
  if (!body.guest_stream_token) return null;
  return verifyStreamUserToken(body.guest_stream_token, body.stream_call_id);
}

export async function POST(request: Request) {
  const { userId: authUserId } = await auth();

  let body: AttendanceEventBody;
  try {
    body = (await request.json()) as AttendanceEventBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { stream_call_id, event_type } = body;

  if (!stream_call_id || !event_type || !VALID_EVENTS.has(event_type)) {
    return NextResponse.json(
      { error: "Missing or invalid required fields" },
      { status: 400 },
    );
  }

  const user_id = await resolveCallerId(authUserId, body);
  if (!user_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Call-end is a terminal marker, not an attendance row mutation: it flips the
  // meeting row to "ended" and stamps ended_at (the recap "Total time" derives
  // from these). Fire it from the client on `call.ended` so a normally-ended call
  // (no transcript upload) still records its end. Best-effort, idempotent.
  if (event_type === "call_ended") {
    try {
      const supabase = supabaseServer();
      const now = new Date().toISOString();
      const { data: meeting } = await supabase
        .from("meetings")
        .select("id, ended_at, user_id")
        .eq("stream_call_id", stream_call_id)
        .maybeSingle();
      // Only the meeting owner may end it.
      if (meeting && (!authUserId || meeting.user_id !== authUserId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (meeting) {
        await supabase
          .from("meetings")
          .update({
            status: "ended",
            ...(meeting.ended_at ? {} : { ended_at: now }),
          })
          .eq("id", meeting.id);
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to mark call ended";
      console.error("Attendance call_ended error:", message);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  const email = body.participant_email ?? null;
  const name = body.participant_name ?? null;
  // Guests: the verified Stream id is both their user_id and stream_user_id.
  const streamUserId = authUserId ? (body.stream_user_id ?? null) : user_id;

  try {
    const supabase = supabaseServer();

    const now = new Date().toISOString();

    // Calls created through the Stream SDK (New / Schedule / Personal Room)
    // never write a Supabase meetings row at creation time, so the first
    // attendance event must anchor one. Look up by stream_call_id; if missing,
    // create the row (the first joiner owns it) so attendance can persist.
    let { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, title, status")
      .eq("stream_call_id", stream_call_id)
      .maybeSingle();

    let meetingId: string;
    if (meeting) {
      meetingId = meeting.id;
      // Backfill blank titles from the Stream call custom so the dashboard
      // "Meeting Title" column isn't empty for meetings created before this fix.
      if (!meeting.title) {
        const { title } = await resolveCallInfo(stream_call_id);
        if (title !== "Meeting") {
          try {
            await supabase
              .from("meetings")
              .update({ title })
              .eq("id", meeting.id);
          } catch {
            // best-effort backfill; never block attendance
          }
        }
      }
      // A meeting pre-created at schedule time starts as "scheduled"; flip it to
      // "active" on the first join so its status tracks reality (recap/detail
      // rely on status). Also stamp started_at to the actual join time so the
      // call duration and timeline start when the call actually takes place.
      if (meeting.status === "scheduled") {
        try {
          await supabase
            .from("meetings")
            .update({ status: "active", started_at: now })
            .eq("id", meeting.id);
        } catch {
          // best-effort status flip; never block attendance
        }
      }
    } else {
      // A concurrent join event from the same or another participant may have
      // already created the meetings row for this stream_call_id (the
      // subscription + seed effect can both fire the local join). The unique
      // index on stream_call_id makes the second insert fail with 23505 —
      // treat that as "someone else won the race" and fall through to the
      // existing-row branch above rather than returning 500.
      // The row's owner is the Stream call's creator, whoever joins first.
      const { title, ownerId } = await resolveCallInfo(stream_call_id);
      if (!ownerId) {
        return NextResponse.json({ error: "Call not found" }, { status: 404 });
      }
      const { data: created, error: createError } = await supabase
        .from("meetings")
        .insert({
          user_id: ownerId,
          stream_call_id,
          title,
          status: "active",
          started_at: now,
          guest_admission_mode: "approval", // lazy-created meetings default to approval for safety
        })
        .select("id")
        .single();
      if (createError) {
        // 23505 = unique_violation on stream_call_id: the row was created by a
        // concurrent request. Re-fetch and use it instead of erroring.
        if ((createError as { code?: string }).code === "23505") {
          const { data: existing, error: lookupError } = await supabase
            .from("meetings")
            .select("id, title, status")
            .eq("stream_call_id", stream_call_id)
            .single();
          if (lookupError || !existing) {
            console.error("Attendance: meeting row lost in race:", lookupError);
            return NextResponse.json(
              { error: "Failed to record attendance" },
              { status: 500 },
            );
          }
          meeting = existing;
          meetingId = existing.id;
        } else {
          console.error("Attendance: failed to create meeting row:", createError);
          return NextResponse.json(
            { error: "Failed to record attendance" },
            { status: 500 },
          );
        }
      } else {
        meetingId = created.id;
      }
    }

    const findOpenRow = async () => {
      return supabase
        .from("attendance_events")
        .select("*")
        .eq("meeting_id", meetingId)
        .eq("user_id", user_id)
        .is("session_ended_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
    };

    const createRow = async () => {
      const { data, error } = await supabase
        .from("attendance_events")
        .insert({
          meeting_id: meetingId,
          user_id,
          stream_user_id: streamUserId,
          participant_email: email,
          participant_name: name,
          session_started_at: now,
        })
        .select("*")
        .single();
      if (error) {
        // 23505 = unique_violation: a concurrent join (the subscription + seed
        // effect, or the other client in the call) already opened the row. The
        // partial unique index (one OPEN row per meeting+user) makes this the
        // race-safe idempotency guard — re-fetch the surviving row instead of
        // throwing so mic/camera updates can continue.
        if ((error as { code?: string }).code === "23505") {
          const { data: existing } = await findOpenRow();
          return { data: existing, error: null as null };
        }
        throw error;
      }
      return { data, error: null as null };
    };

    switch (event_type) {
      case "join": {
        const { data: existing } = await findOpenRow();
        if (existing) break; // idempotent: reuse the open session row
        const { error } = await createRow();
        if (error) throw error;
        break;
      }

      case "leave": {
        const { data: row } = await findOpenRow();
        if (!row) break;
        const delta = row.mic_enabled_at
          ? secondsBetween(now, row.mic_enabled_at)
          : 0;
        const { error } = await supabase
          .from("attendance_events")
          .update({
            session_ended_at: now,
            mic_enabled_at: null,
            talk_time_seconds: row.talk_time_seconds + delta,
            updated_at: now,
          })
          .eq("id", row.id);
        if (error) throw error;
        break;
      }

      case "mic_on": {
        const { data: existing } = await findOpenRow();
        const row = existing ?? (await createRow()).data;
        if (!row) throw new Error("Failed to open attendance row");
        const { error } = await supabase
          .from("attendance_events")
          .update({
            mic_toggles: row.mic_toggles + 1,
            mic_enabled_at: row.mic_enabled_at ?? now,
            updated_at: now,
          })
          .eq("id", row.id);
        if (error) throw error;
        break;
      }

      case "mic_off": {
        const { data: row } = await findOpenRow();
        if (!row) break;
        const talkTime = row.mic_enabled_at
          ? row.talk_time_seconds + secondsBetween(now, row.mic_enabled_at)
          : row.talk_time_seconds;
        const { error } = await supabase
          .from("attendance_events")
          .update({
            mic_enabled_at: null,
            talk_time_seconds: talkTime,
            updated_at: now,
          })
          .eq("id", row.id);
        if (error) throw error;
        break;
      }

      case "camera_on": {
        const { data: existing } = await findOpenRow();
        const row = existing ?? (await createRow()).data;
        if (!row) throw new Error("Failed to open attendance row");
        const { error } = await supabase
          .from("attendance_events")
          .update({
            camera_toggles: row.camera_toggles + 1,
            updated_at: now,
          })
          .eq("id", row.id);
        if (error) throw error;
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to record attendance";
    console.error("Attendance event error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
