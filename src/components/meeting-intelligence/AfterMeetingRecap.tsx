/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ModalProvider } from "@/components/ui/animated-modal";
import { useUser, useClerk } from "@clerk/nextjs";
import { Loader2, Sparkles, Users, Clock, FileText } from "lucide-react";
import { MeetingRecap } from "@/lib/meeting-recap";
import toast from "react-hot-toast";

// All states the recap "Generate Transcript" button can be in. This is a
// participant-only, personal .txt download: it NEVER triggers AI. The only
// terminal success is "done" (file downloaded). "no_recording" / "too_short" /
// "failed" are retryable; "pending" means we are waiting on Stream + a background
// poll to finish, so the button is disabled and the user is told.
type GenState =
  | "idle"
  | "generating"
  | "pending"
  | "done"
  | "exists"
  | "no_recording"
  | "too_short"
  | "failed";

// ~5 minutes (20 × 15s) of waiting for Stream to finalize recordings. After
// this we stop polling and show a final, clear message instead of spinning
// forever.
const NO_RECORDING_POLL_CAP = 20;

function formatDuration(
  startedAt: string | null,
  endedAt: string | null,
): string {
  if (!startedAt || !endedAt) return "—";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string): string {
  if (status === "ended") return "Ended";
  if (status === "active") return "Active";
  if (status === "scheduled") return "Scheduled";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTalk(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

const AfterMeetingRecap = ({ recap }: { recap: MeetingRecap }) => {
  const { isSignedIn, user } = useUser();
  const { redirectToSignIn } = useClerk();
  const [gen, setGen] = useState<GenState>("idle");
  const [noRecordingTimedOut, setNoRecordingTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPoll();
  }, []);

  // When Stream hasn't finalized recordings yet, poll the download endpoint and
  // auto-retry once the transcript is ready. Capped at NO_RECORDING_POLL_CAP ticks
  // (~5 min) so we never poll forever.
  const startWaiting = () => {
    setGen("pending");
    setNoRecordingTimedOut(false);
    attemptsRef.current = 0;
    stopPoll();
    pollRef.current = setInterval(async () => {
      attemptsRef.current += 1;
      if (attemptsRef.current >= NO_RECORDING_POLL_CAP) {
        // Stream never finalized within ~5 min — stop and tell the user.
        stopPoll();
        setNoRecordingTimedOut(true);
        setGen("no_recording");
        return;
      }
      try {
        await executeDownload(true);
      } catch {
        /* keep polling until the cap */
      }
    }, 15000);
  };

  const executeDownload = async (isAutoRetry = false) => {
    if (!isAutoRetry) {
      if (
        gen === "generating" ||
        gen === "pending" ||
        gen === "done" ||
        gen === "exists"
      ) {
        return;
      }
    }
    // Logged-out visitors are sent to sign in, then back to this page.
    if (!isSignedIn) {
      redirectToSignIn({ redirectUrl: window.location.pathname });
      return;
    }
    if (!isAutoRetry) {
      setGen("generating");
    }
    // Guard against a slow/rate-limited AI provider hanging the request forever
    // (same class of hang fixed in UploadTranscriptModal). Signal + timeout so a
    // stuck /api/transcript/download surfaces a failure instead of spinning.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch("/api/transcript/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId: recap.id,
          streamCallId: recap.streamCallId,
          streamCallType: "default",
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      const status = data?.status;
      if (status === "ok") {
        const text = data.transcript ?? "";
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `meeting-${recap.id}-transcript.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        stopPoll();
        setGen("done");
        toast.success("Transcript downloaded");
      } else if (status === "exists") {
        stopPoll();
        setGen("exists");
        toast("A transcript already exists for this meeting");
      } else if (status === "too_short") {
        stopPoll();
        setGen("too_short");
        toast("Meeting too short to transcribe");
      } else if (status === "no_recording") {
        // Stream hasn't finalized the recordings yet — wait and auto-retry.
        if (!isAutoRetry) {
          startWaiting();
          toast(
            data?.message?.trim() ||
              "Recordings are still processing. We'll grab your transcript shortly.",
          );
        }
      } else {
        stopPoll();
        setGen("failed");
        // Surface the real server message instead of a hardcoded generic line,
        // so the cause (no recording captured, still processing, STT error) is
        // visible to the user rather than hidden behind "try manual upload".
        toast.error(
          data?.message?.trim() || "Transcript generation failed, try manual upload",
        );
      }
    } catch (err) {
      if (!isAutoRetry) {
        stopPoll();
        setGen("failed");
        if (controller.signal.aborted) {
          toast.error(
            "Transcript generation timed out. Please try again shortly.",
          );
        } else {
          toast.error("Transcript generation failed, try manual upload");
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleGenerate = () => executeDownload(false);

  const genDisabled =
    gen === "generating" ||
    (gen === "pending" && !noRecordingTimedOut) ||
    gen === "done" ||
    gen === "exists";

  const genLabel =
    gen === "generating" || (gen === "pending" && !noRecordingTimedOut)
      ? "Processing…"
      : gen === "done"
        ? "Transcript ready"
        : gen === "exists"
          ? "Transcript exists"
          : gen === "no_recording" && !noRecordingTimedOut
            ? "Recordings processing"
            : "Generate Transcript";

  const participantJoinTimes = recap.participants
    .map((p) => (p.joinedAt ? new Date(p.joinedAt).getTime() : null))
    .filter((t): t is number => t !== null);
  const participantLeaveTimes = recap.participants
    .map((p) => (p.leftAt ? new Date(p.leftAt).getTime() : null))
    .filter((t): t is number => t !== null);

  const rawStart = recap.startedAt ? new Date(recap.startedAt).getTime() : 0;
  const rawEnd = recap.endedAt ? new Date(recap.endedAt).getTime() : 0;

  // Use the earliest participant join time as the call start when available,
  // preventing lobby/preview time or pre-scheduled creation stamps from introducing
  // an artificial empty gap at the start of the presence timeline.
  const earliestJoin =
    participantJoinTimes.length > 0 ? Math.min(...participantJoinTimes) : rawStart;
  const latestLeave =
    participantLeaveTimes.length > 0 ? Math.max(...participantLeaveTimes) : rawEnd;

  const meetingStart = earliestJoin || rawStart;
  const meetingEnd = Math.max(rawEnd || latestLeave, meetingStart);
  const hasTimeline = Boolean(meetingStart && meetingEnd && meetingEnd > meetingStart);

  const effectiveStart = meetingStart ? new Date(meetingStart).toISOString() : recap.startedAt;
  const effectiveEnd = meetingEnd ? new Date(meetingEnd).toISOString() : recap.endedAt;

  const totalTime = formatDuration(effectiveStart, effectiveEnd);

  // Determine if the signed‑in user is the meeting owner
  const isOwner = user?.id === recap.user_id;

  // Find the participant entry for the current user (match by Clerk user ID or email)
  const currentParticipant = recap.participants.find(
    (p) => p.userId === user?.id || p.email === (user?.primaryEmailAddress?.emailAddress ?? ''),
  );

  // For guests, show their own presence duration instead of the full meeting duration
  const displayTotalTime = isOwner
    ? totalTime
    : currentParticipant
      ? formatDuration(currentParticipant.joinedAt, currentParticipant.leftAt ?? recap.endedAt)
      : totalTime;
  return (
    <ModalProvider>
      <main className="min-h-screen bg-surface px-6 py-10 text-on-surface">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
            {recap.title || "Meeting"}
          </h1>
          {recap.description && (
            <p className="text-body-md text-on-surface-variant">
              {recap.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-label-caps uppercase tracking-wider text-on-surface-variant">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {statusLabel(recap.status)}
            </span>
            {recap.startedAt && (
              <span className="text-body-sm text-on-surface-variant">
                {formatDateTime(recap.startedAt)}
              </span>
            )}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-xl border border-surface-variant bg-surface-container-lowest px-4 py-4">
            <span className="inline-flex items-center gap-1.5 text-label-caps uppercase tracking-wider text-on-surface-variant">
              <Clock className="h-3.5 w-3.5" /> Total time
            </span>
            <span className="text-body-lg font-semibold text-on-surface">
              {displayTotalTime}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-surface-variant bg-surface-container-lowest px-4 py-4">
            <span className="inline-flex items-center gap-1.5 text-label-caps uppercase tracking-wider text-on-surface-variant">
              <Users className="h-3.5 w-3.5" /> Participants
            </span>
            <span className="text-body-lg font-semibold text-on-surface">
              {recap.participants.length}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-surface-variant bg-surface-container-lowest px-4 py-4">
            <span className="inline-flex items-center gap-1.5 text-label-caps uppercase tracking-wider text-on-surface-variant">
              <FileText className="h-3.5 w-3.5" /> Status
            </span>
            <span className="text-body-lg font-semibold text-on-surface">
              {statusLabel(recap.status)}
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-body-lg font-semibold text-on-surface">
              Call timeline
            </h2>
            <span className="text-body-xs text-on-surface-variant">
              Participant presence across the meeting duration
            </span>
          </div>
          {!hasTimeline ? (
            <p className="text-body-md text-on-surface-variant">
              Timeline will appear once the meeting start and end times are
              recorded.
            </p>
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border border-surface-variant bg-surface-container-lowest p-5">
              <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
                <span>{formatTime(effectiveStart)}</span>
                <span>{formatTime(effectiveEnd)}</span>
              </div>
              <div className="flex flex-col gap-2">
                {recap.participants.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant">
                    No participants recorded yet.
                  </p>
                ) : (
                  recap.participants.map((p) => {
                    const j = p.joinedAt
                      ? new Date(p.joinedAt).getTime()
                      : null;
                    const l = p.leftAt ? new Date(p.leftAt).getTime() : null;
                    const segStart =
                      j != null ? Math.max(j, meetingStart!) : meetingStart!;
                    const segEnd =
                      l != null ? Math.min(l, meetingEnd!) : meetingEnd!;
                    const leftPct =
                      ((segStart - meetingStart!) /
                        (meetingEnd! - meetingStart!)) *
                      100;
                    const widthPct =
                      ((segEnd - segStart) / (meetingEnd! - meetingStart!)) * 100;
                    const noSeg = segEnd <= segStart;
                    const presenceDuration = formatDuration(
                      p.joinedAt,
                      p.leftAt ?? effectiveEnd,
                    );
                    return (
                      <div key={p.userId ?? p.email ?? p.name} className="flex items-center gap-3">
                        <span
                          className="w-32 shrink-0 truncate text-body-sm text-on-surface-variant"
                          title={p.name}
                        >
                          {p.name}
                        </span>
                        <div className="relative h-5 flex-1 rounded-full bg-surface-container">
                          {!noSeg && (
                            <div
                              className="absolute top-0 h-5 rounded-full bg-primary"
                              title={`${p.name}: present ${presenceDuration}`}
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                              }}
                            />
                          )}
                        </div>
                        <span className="w-16 shrink-0 text-right text-body-xs text-on-surface-variant">
                          {presenceDuration}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-body-lg font-semibold text-on-surface">
            Participants
          </h2>
          {recap.participants.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              No participants recorded yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-surface-variant overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest">
              {recap.participants.map((p) => (
                <li
                  key={p.userId ?? p.email ?? p.name}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <div className="flex flex-col">
                    <span className="text-body-md font-medium text-on-surface">
                      {p.name}
                    </span>
                    {p.email && (
                      <span className="text-body-sm text-on-surface-variant">
                        {p.email}
                      </span>
                    )}
                    <span className="text-body-sm text-on-surface-variant">
                      {formatDuration(p.joinedAt, p.leftAt ?? effectiveEnd)} present
                      {p.talkTimeSeconds > 0
                        ? ` · spoke ${formatTalk(p.talkTimeSeconds)}`
                        : " · 0s talk time"}
                    </span>
                  </div>
                  <span className="text-body-sm text-on-surface-variant">
                    {formatTime(p.joinedAt)}
                    {p.leftAt ? ` – ${formatTime(p.leftAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-surface-variant bg-surface-container-lowest p-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-body-md font-semibold text-on-surface">
              Get your transcript
            </h3>
            <p className="text-body-sm text-on-surface-variant">
              Download a plain-text transcript of the call recording, then upload
              it from the Dashboard to unlock AI summaries and insights.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={genDisabled}
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {gen === "generating" || gen === "pending" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {genLabel}
            </button>
            <Link
              href="/dashboard"
              className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-body-md font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
            >
              Go back to Dashboard
            </Link>
          </div>
          {gen === "pending" && !noRecordingTimedOut && (
            <p className="text-body-sm text-on-surface-variant">
              Recordings are still being processed by Stream. We&apos;ll fetch
              your transcript automatically when it&apos;s ready — no need to
              wait here.
            </p>
          )}
          {gen === "no_recording" && noRecordingTimedOut && (
            <p className="text-body-sm text-on-surface-variant">
              No recording was captured for this meeting. You can still upload
              a transcript from the Dashboard to get AI summaries and insights.
            </p>
          )}
          {!isSignedIn && (
            <p className="text-body-sm text-on-surface-variant">
              Sign in to generate a transcript from the meeting recording.
            </p>
          )}
        </section>
      </div>
    </main>
    </ModalProvider>
  );
};

export default AfterMeetingRecap;
