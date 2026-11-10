import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { callTypeOfRow } from "@/lib/stream-call-type-server";
import { assertMinutesUnlocked } from "@/lib/minutes-lock";
import { generateTranscriptForMeeting } from "@/agent/transcript-generation";
import {
  claimTranscriptGeneration,
  isMissingColumn,
  setTranscriptState,
} from "@/lib/transcript-state";
import {
  accessErrorResponse,
  checkMeetingAccess,
  NEED_ROLES,
  type MeetingAccess,
} from "@/lib/project-auth";

// Native ffmpeg (ffmpeg-static) requires the Node runtime (never edge).
export const runtime = "nodejs";
// Download, ffmpeg and Whisper for every participant run inside this request.
// 300 s is the Vercel Hobby ceiling with fluid compute; the generator stops
// starting new work at 250 s so it can still answer.
export const maxDuration = 300;

// Once a call ended this long ago and Stream still lists no individual
// recording, there never will be one (recording was off), so say so for good.
const NO_RECORDING_FINAL_AFTER_MS = 20 * 60 * 1000;

/**
 * Participant transcript download. Any signed in participant of the meeting can
 * download a local .txt of the merged "SpeakerName: text" transcript. This is a
 * personal artifact: it is cached in `transcripts` (raw_text only) to avoid
 * re transcribing on repeat clicks, but it NEVER triggers AI processing
 * (summary, action items, embeddings). Those run only through the
 * Upload Transcript flow (Dashboard → Upload Transcript).
 */
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Declared in outer scope so the catch block can mark the right row failed.
  let meetingId = "";

  try {
    const body = await request.json();
    // A body `streamCallType` (older clients) is ignored: the type comes from
    // the meeting row (W3), never the browser.
    const { streamCallId, language } = body as {
      meetingId?: string;
      streamCallId?: string;
      language?: string;
    };
    meetingId = body.meetingId ?? "";

    if (!meetingId || !streamCallId) {
      return NextResponse.json(
        { error: "meetingId and streamCallId are required" },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();

    // Authorize against the stored meeting, never the request body: the call id
    // must be this meeting's, and the caller must be its owner or a recorded
    // attendee. Otherwise any signed-in user could transcribe any meeting.
    const { data: meeting } = await supabase
      .from("meetings")
      .select(
        "id, user_id, project_id, stream_call_id, stream_call_type, ended_at",
      )
      .eq("id", meetingId)
      .maybeSingle();
    if (!meeting || meeting.stream_call_id !== streamCallId) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    // Personal meeting: owner or recorded attendee. Project meeting: content
    // (Owner, Admin, Developer) to download; generating needs manage (below).
    let access: MeetingAccess;
    try {
      access = await checkMeetingAccess(supabase, userId, meeting, "content", {
        personalFallback: async () => {
          const { data: attended } = await supabase
            .from("attendance_events")
            .select("id")
            .eq("meeting_id", meetingId)
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();
          return !!attended;
        },
        personalDenied: { status: 403, message: "Forbidden" },
      });
    } catch (err) {
      const denied = accessErrorResponse(err);
      if (denied) return denied;
      throw err;
    }

    // Cache read: only serve a ready transcript that actually has text. A row in
    // `pending` / `no_recording` / `failed` must not be returned as a success,
    // and an empty raw_text means generation has not completed yet. The cache is
    // keyed by language too: when the caller explicitly chose a language that
    // differs from the cached one, we must re-transcribe instead of returning a
    // stale text (Bug 2 fix — selecting Urdu must not return the English cache).
    const requestedLang = language && language.trim() ? language.trim() : "";
    const { data: existing } = await supabase
      .from("transcripts")
      .select("raw_text, processing_state, language")
      .eq("meeting_id", meetingId)
      .limit(1)
      .maybeSingle();
    if (
      existing?.raw_text &&
      existing.raw_text.trim().length > 0 &&
      existing.processing_state !== "pending" &&
      (requestedLang === "" || existing.language === requestedLang)
    ) {
      return NextResponse.json({
        status: "ok",
        transcript: existing.raw_text,
        cached: true,
      });
    }

    // Generating writes the meeting's transcript: on a project meeting only an
    // Owner or Admin may do that (spec 0004, manage).
    if (access.role && !NEED_ROLES.manage.includes(access.role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Tasdeeq AC-7: generation would rewrite a transcript under a minutes review.
    const locked = await assertMinutesUnlocked(supabase, meetingId);
    if (locked) return locked;

    // No ready cache: take the generation lock. A fresh `pending` row means
    // another request is already transcribing, so answer `pending` and let the
    // client keep polling instead of starting a second (quota-burning) run.
    try {
      const claimed = await claimTranscriptGeneration(supabase, meetingId);
      if (!claimed) {
        return NextResponse.json({
          status: "pending",
          message: "Your transcript is being generated.",
        });
      }
    } catch (claimErr) {
      // Lock is best-effort (e.g. database not migrated yet); still proceed.
      console.error("Transcript claim failed, continuing:", claimErr);
      try {
        await setTranscriptState(supabase, meetingId, "pending", {
          source: "recording",
        });
      } catch {
        /* best-effort */
      }
    }

    // No cache: generate the merged transcript for any signed in participant.
    const result = await generateTranscriptForMeeting({
      userId,
      meetingId,
      streamCallId,
      streamCallType: callTypeOfRow(meeting),
      enforceOwner: false,
      language: language && language.trim() ? language.trim() : undefined,
    });

    if (result.status === "ok") {
      const rawText = result.transcript.trim();
      // Upsert (not insert): a row may already exist from the `pending` write
      // above or a concurrent click, and `meeting_id` is UNIQUE.
      const readyRow: Record<string, unknown> = {
        meeting_id: meetingId,
        source: "recording",
        raw_text: rawText,
        language: result.language,
        processing_state: "ready",
        updated_at: new Date().toISOString(),
        raw_whisper_text: result.rawTranscript?.trim() ?? null,
      };
      let { error: transcriptError } = await supabase
        .from("transcripts")
        .upsert(readyRow, { onConflict: "meeting_id" });
      // Database not migrated to F10 yet: save without the new columns.
      if (transcriptError && isMissingColumn(transcriptError)) {
        delete readyRow.updated_at;
        delete readyRow.raw_whisper_text;
        ({ error: transcriptError } = await supabase
          .from("transcripts")
          .upsert(readyRow, { onConflict: "meeting_id" }));
      }

      if (transcriptError) {
        console.error("Failed to cache transcript:", transcriptError);
        // A concurrent click may have inserted first (unique meeting_id).
        // Re read the cached row rather than failing the download.
        const { data: retry } = await supabase
          .from("transcripts")
          .select("raw_text")
          .eq("meeting_id", meetingId)
          .limit(1)
          .maybeSingle();
        if (retry?.raw_text) {
          try {
            await setTranscriptState(supabase, meetingId, "ready");
          } catch {
            /* best-effort */
          }
          return NextResponse.json({
            status: "ok",
            transcript: retry.raw_text,
            cached: true,
          });
        }
        try {
          await setTranscriptState(supabase, meetingId, "failed");
        } catch {
          /* best-effort */
        }
        return NextResponse.json(
          { status: "failed", message: "Failed to cache transcript" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        status: "ok",
        transcript: rawText,
        cached: false,
        language: result.language,
      });
    }

    // Terminal-but-retryable state: persist it so the UI can poll and retry.
    if (result.status === "no_recording") {
      try {
        await setTranscriptState(supabase, meetingId, "no_recording");
      } catch {
        /* best-effort */
      }
      const endedAt = meeting.ended_at ? Date.parse(meeting.ended_at) : NaN;
      const final =
        Number.isFinite(endedAt) &&
        Date.now() - endedAt > NO_RECORDING_FINAL_AFTER_MS;
      return NextResponse.json({
        status: "no_recording",
        final,
        message: final
          ? "This meeting was not recorded, so there is nothing to transcribe. Upload a transcript instead."
          : result.message,
      });
    }
    if (result.status === "too_short") {
      try {
        await setTranscriptState(supabase, meetingId, "too_short");
      } catch {
        /* best-effort */
      }
      return NextResponse.json({
        status: "too_short",
        message: "Meeting too short to transcribe",
      });
    }

    try {
      await setTranscriptState(supabase, meetingId, "failed");
    } catch {
      /* best-effort */
    }
    return NextResponse.json({
      status: "failed",
      message: result.status === "failed" ? result.message : undefined,
    });
  } catch (err) {
    console.error("Transcript download route error:", err);
    if (meetingId) {
      try {
        const supabase = supabaseServer();
        await setTranscriptState(supabase, meetingId, "failed");
      } catch {
        /* best-effort */
      }
    }
    return NextResponse.json(
      {
        status: "failed",
        message: "Transcript generation failed, try manual upload",
      },
      { status: 500 },
    );
  }
}
