import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateSpeakerContributions } from "@/agent/speaker-insights";
import { normalizeSpeakerName } from "@/lib/speaker-name";
import {
  SpeakerEngagementResponse,
  SpeakerInsight,
} from "@/lib/meeting-types";

export const runtime = "nodejs";

// Deterministic low-engagement: present for over a minute but talked less than
// 15% of their measured presence.
const LOW_ENGAGEMENT_RATIO = 0.15;
const LOW_ENGAGEMENT_MIN_DURATION_SECONDS = 60;

type AttendanceRow = {
  user_id: string | null;
  participant_name: string | null;
  participant_email: string | null;
  session_started_at: string;
  session_ended_at: string | null;
  talk_time_seconds: number | null;
  mic_toggles: number | null;
  camera_toggles: number | null;
};

function durationSeconds(startedAt: string, endedAt: string | null): number {
  const start = new Date(startedAt).getTime();
  if (!endedAt) return 0;
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { meetingId } = (await request.json()) as { meetingId?: string };

    if (!meetingId || !meetingId.trim()) {
      return NextResponse.json(
        { error: "meetingId is required" },
        { status: 400 },
      );
    }

    const id = meetingId.trim();
    const supabase = supabaseServer();

    // (1) ownership-checked meeting fetch
    // NOTE: `category` is NOT a column on `meetings` (it lives on
    // `meeting_insights`); selecting it here throws Postgres 42703 and makes the
    // whole meeting lookup fail. Fetch category separately below.
    // Scope check: the meeting must exist and the caller must be the owner OR a
    // recorded participant. This mirrors the lenient ownership rule in
    // /api/transcript/upload, /api/ai/embed, and /api/meetings/[id] — a
    // participant may view insights for a meeting they attended under a different
    // Clerk account than the creator, so a strict owner-only check wrongly 404s
    // with "Meeting not found" (e.g. the Engagement tab for a participant).
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, title, user_id")
      .eq("id", id)
      .single();

    if (meetingError || !meeting) {
      console.error("Engagement meeting not found:", meetingError);
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    if (meeting.user_id !== userId) {
      const { data: part } = await supabase
        .from("attendance_events")
        .select("user_id")
        .eq("meeting_id", meeting.id)
        .eq("user_id", userId)
        .limit(1);
      if (!part || part.length === 0) {
        // Guests may have a NULL user_id in attendance_events;
        // match on stream_user_id (the guest's Stream identity).
        const { data: guestPart } = await supabase
          .from("attendance_events")
          .select("user_id")
          .eq("meeting_id", meeting.id)
          .eq("stream_user_id", userId)
          .limit(1);
        if (!guestPart || guestPart.length === 0) {
          console.error("Engagement meeting not authorized for user:", userId);
          return NextResponse.json(
            { error: "Meeting not found" },
            { status: 404 },
          );
        }
      }
    }

    // (2) attendance events, (3) transcript, and the meeting category (from
    // `meeting_insights`, the only table that holds it) — all keyed by meeting id.
    const [
      { data: attendance, error: attendanceError },
      { data: transcriptRow },
      { data: insightsRow },
    ] = await Promise.all([
      supabase
        .from("attendance_events")
        .select(
          "user_id, participant_name, participant_email, session_started_at, session_ended_at, talk_time_seconds, mic_toggles, camera_toggles",
        )
        .eq("meeting_id", id),
      supabase
        .from("transcripts")
        .select("raw_text")
        .eq("meeting_id", id)
        .maybeSingle(),
      supabase
        .from("meeting_insights")
        .select("category")
        .eq("meeting_id", id)
        .maybeSingle(),
    ]);

    if (attendanceError) {
      console.error("Engagement attendance query failed:", attendanceError);
      return NextResponse.json(
        { error: "Failed to load attendance" },
        { status: 500 },
      );
    }

    const hasTranscript = Boolean(transcriptRow?.raw_text);
    const rawText = transcriptRow?.raw_text ?? "";
    const meetingCategory = (insightsRow as { category?: string | null } | null)
      ?.category ?? null;

    // (4) aggregate attendance into speakers keyed by stable identity
    const byKey = new Map<string, SpeakerInsight>();

    for (const row of (attendance ?? []) as AttendanceRow[]) {
      const key =
        row.user_id ||
        row.participant_email ||
        row.participant_name ||
        "unknown";

      const duration = durationSeconds(
        row.session_started_at,
        row.session_ended_at,
      );
      const talkTime = row.talk_time_seconds ?? 0;
      const mic = row.mic_toggles ?? 0;
      const cam = row.camera_toggles ?? 0;
      const name =
        normalizeSpeakerName(row.participant_name ?? "") ||
        normalizeSpeakerName(row.participant_email ?? "") ||
        "Unknown";

      const existing = byKey.get(key);
      if (existing) {
        existing.sessions += 1;
        existing.totalTalkTimeSeconds += talkTime;
        existing.totalDurationSeconds += duration;
        existing.micToggles += mic;
        existing.cameraToggles += cam;
        existing.email = existing.email ?? row.participant_email ?? null;
        if (existing.name === "Unknown") existing.name = name;
      } else {
        byKey.set(key, {
          name,
          email: row.participant_email ?? null,
          present: true,
          sessions: 1,
          totalTalkTimeSeconds: talkTime,
          totalDurationSeconds: duration,
          talkTimeRatio: 0,
          micToggles: mic,
          cameraToggles: cam,
          contributions: [],
          keyTopics: [],
          lowEngagement: false,
          lowEngagementReason: null,
        });
      }
    }

    const aggregated: SpeakerInsight[] = [...byKey.values()];

    // (5) deterministic low-engagement from measured talk-time / presence
    for (const s of aggregated) {
      s.talkTimeRatio =
        s.totalDurationSeconds > 0
          ? Number((s.totalTalkTimeSeconds / s.totalDurationSeconds).toFixed(3))
          : 0;
      if (
        s.totalDurationSeconds > LOW_ENGAGEMENT_MIN_DURATION_SECONDS &&
        s.talkTimeRatio < LOW_ENGAGEMENT_RATIO
      ) {
        s.lowEngagement = true;
        s.lowEngagementReason = `Talked for ${s.totalTalkTimeSeconds}s of ${s.totalDurationSeconds}s presence (~${Math.round(
          s.talkTimeRatio * 100,
        )}%)`;
      }
    }

    // hasAttendance reflects REAL attendance (speakers whose attendance_events
    // row exists, i.e. present: true). Capture it here, before the AI branch
    // below appends transcript-only speakers (present: false) to `aggregated`.
    // Computing it from aggregated.length at response time would wrongly report
    // hasAttendance: true for a transcript-only meeting nobody attended.
    const hasAttendance = aggregated.length > 0;

    // (6) AI contributions when a transcript is present
    let overallSummary: string;
    if (hasTranscript && rawText) {
      const ai = await generateSpeakerContributions({
        transcriptText: rawText.slice(0, 16000),
        knownNames: aggregated.map((s) => ({
          name: s.name,
          talkTimeSeconds: s.totalTalkTimeSeconds,
          durationSeconds: s.totalDurationSeconds,
        })),
        meetingTitle: meeting.title ?? undefined,
        category: meetingCategory,
      });

      const byName = new Map(
        ai.speakers.map((sp) => [sp.name.trim().toLowerCase(), sp]),
      );

      // merge AI attribution into known (attended) speakers
      for (const s of aggregated) {
        const match = byName.get(s.name.trim().toLowerCase());
        if (!match) continue;
        s.contributions = match.contributions;
        s.keyTopics = match.keyTopics;
        if (match.lowEngagement) {
          s.lowEngagement = true;
          s.lowEngagementReason = match.lowEngagementReason ?? s.lowEngagementReason;
        }
      }

      // append transcript-only speakers (found in transcript, not in attendance)
      for (const sp of ai.speakers) {
        const exists = aggregated.some(
          (s) => s.name.trim().toLowerCase() === sp.name.trim().toLowerCase(),
        );
        if (exists) continue;
        aggregated.push({
          name: sp.name,
          email: null,
          present: false,
          sessions: 0,
          totalTalkTimeSeconds: 0,
          totalDurationSeconds: 0,
          talkTimeRatio: 0,
          micToggles: 0,
          cameraToggles: 0,
          contributions: sp.contributions,
          keyTopics: sp.keyTopics,
          lowEngagement: sp.lowEngagement,
          lowEngagementReason: sp.lowEngagementReason ?? null,
        });
      }

      overallSummary = ai.overallSummary;
    } else if (aggregated.length > 0) {
      overallSummary =
        "No transcript was uploaded for this meeting, so contributions are based on attendance only.";
    } else {
      overallSummary =
        "No transcript and no attendance have been recorded for this meeting, so there is nothing to analyze yet.";
    }

    // (8) response
    const response: SpeakerEngagementResponse = {
      meetingId: meeting.id,
      hasTranscript,
      hasAttendance,
      overallSummary,
      speakers: aggregated,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Engagement generation failed";
    console.error("Speaker engagement error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
