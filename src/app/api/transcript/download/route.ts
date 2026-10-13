import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateTranscriptForMeeting } from "@/agent/transcript-generation";
import { setTranscriptState } from "@/lib/transcript-state";

// Native ffmpeg (ffmpeg-static) requires the Node runtime (never edge).
export const runtime = "nodejs";

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
    const { streamCallId, streamCallType, language } = body as {
      meetingId?: string;
      streamCallId?: string;
      streamCallType?: string;
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
      .select("user_id, stream_call_id")
      .eq("id", meetingId)
      .maybeSingle();
    if (!meeting || meeting.stream_call_id !== streamCallId) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    if (meeting.user_id !== userId) {
      const { data: attended } = await supabase
        .from("attendance_events")
        .select("id")
        .eq("meeting_id", meetingId)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (!attended) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
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

    // No ready cache: mark in-flight so a concurrent click (or a later poll)
    // sees `pending` instead of starting a second transcription.
    try {
      await setTranscriptState(supabase, meetingId, "pending", {
        source: "recording",
      });
    } catch {
      // state write is best-effort; generation itself still proceeds.
    }

    // No cache: generate the merged transcript for any signed in participant.
    const result = await generateTranscriptForMeeting({
      userId,
      meetingId,
      streamCallId,
      streamCallType: streamCallType || "default",
      enforceOwner: false,
      language: language && language.trim() ? language.trim() : undefined,
    });

    if (result.status === "ok") {
      const rawText = result.transcript.trim();
      // Upsert (not insert): a row may already exist from the `pending` write
      // above or a concurrent click, and `meeting_id` is UNIQUE.
      const { error: transcriptError } = await supabase
        .from("transcripts")
        .upsert(
          {
            meeting_id: meetingId,
            source: "recording",
            raw_text: rawText,
            language: result.language,
            processing_state: "ready",
          },
          { onConflict: "meeting_id" },
        );

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
      return NextResponse.json({
        status: "no_recording",
        message: result.message,
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
