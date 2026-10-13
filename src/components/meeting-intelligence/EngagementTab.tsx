/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import {
  SpeakerEngagementResponse,
  SpeakerInsight,
} from "@/lib/meeting-types";

const SpeakerCard = ({ speaker }: { speaker: SpeakerInsight }) => (
  <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-lg font-semibold text-on-surface">
          {speaker.name}
        </span>
        {speaker.lowEngagement && (
          <span className="rounded-full bg-error-container px-3 py-1 text-label-caps font-medium uppercase tracking-wider text-on-error-container">
            Low engagement
          </span>
        )}
      </div>
      <span className="text-body-md text-on-surface-variant">
        {speaker.present ? "Attended" : "Transcript only"}
      </span>
      {speaker.lowEngagement && speaker.lowEngagementReason && (
        <span className="text-body-md text-on-surface-variant">
          {speaker.lowEngagementReason}
        </span>
      )}
    </div>

    {speaker.present && (
      <p className="text-body-md text-on-surface-variant">
        {speaker.sessions} {speaker.sessions === 1 ? "session" : "sessions"} ·{" "}
        spoke {speaker.totalTalkTimeSeconds}s of {speaker.totalDurationSeconds}s
        (~{Math.round(speaker.talkTimeRatio * 100)}%) · mic{" "}
        {speaker.micToggles} · cam {speaker.cameraToggles}
      </p>
    )}

    {speaker.contributions.length > 0 && (
      <div className="flex flex-col gap-2">
        <span className="text-label-caps font-medium uppercase tracking-wider text-on-surface-variant">
          Contributions
        </span>
        <ul className="flex flex-col gap-1">
          {speaker.contributions.map((c, i) => (
            <li key={i} className="flex gap-2 text-body-md text-on-surface">
              <span className="text-primary-container">•</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {speaker.keyTopics.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {speaker.keyTopics.map((t, i) => (
          <span
            key={i}
            className="rounded-full bg-primary-container/15 px-3 py-1 text-body-md text-primary-container"
          >
            {t}
          </span>
        ))}
      </div>
    )}
  </div>
);

const EngagementTab = ({ meetingId }: { meetingId: string }) => {
  const [data, setData] = useState<SpeakerEngagementResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const { timedOut } = useLoadingTimeout(isLoading, {
    // AI-backed: the route runs an LLM call over the transcript, which can take
    // well over the default 12s. A too-tight window surfaced a false
    // "We couldn't load engagement insights" error while the request was still
    // in flight (the timer latches until the fetch settles). 30s keeps the
    // guard for genuine hangs without false-failing slow-but-valid generation.
    timeoutMs: 30000,
    retryNonce,
  });

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/engagement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Engagement failed: ${res.status}`);
        }

        const json = (await res.json()) as SpeakerEngagementResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          console.error("Engagement fetch failed:", err);
          setError(
            err instanceof Error
              ? err.message
              : "Engagement failed unexpectedly",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId, retryNonce]);

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load engagement insights."
        onRetry={() => setRetryNonce((k) => k + 1)}
      />
    );
  }

  if (isLoading) return <LoaderOne />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-error-container bg-error-container/40 px-6 py-16 text-center">
        <Users className="h-10 w-10 text-error" />
        <p className="text-body-lg text-on-error-container">
          Engagement could not be generated.
        </p>
        <p className="text-body-md text-on-surface-variant">{error}</p>
        <button
          type="button"
          onClick={() => setRetryNonce((k) => k + 1)}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-primary-container px-4 py-2 text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/10"
        >
          Retry
        </button>
      </div>
    );
  }

  const noData = !data?.hasTranscript && !data?.hasAttendance;

  if (noData) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
        <Users className="h-10 w-10 text-on-surface-variant" />
        <p className="text-body-lg text-on-surface-variant">
          No engagement data yet.
        </p>
        <p className="text-body-md text-on-surface-variant">
          Upload a transcript and/or join the meeting to capture attendance.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h2 className="text-headline-md font-semibold text-on-surface">
          Engagement overview
        </h2>
        <p className="whitespace-pre-line text-body-md leading-relaxed text-on-surface-variant">
          {data?.overallSummary}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.speakers ?? []).map((s, i) => (
          <SpeakerCard key={`${s.name}-${i}`} speaker={s} />
        ))}
      </div>
    </div>
  );
};

export default EngagementTab;
