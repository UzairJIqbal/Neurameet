/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { MeetingDetailData } from "@/lib/meeting-types";
import TabEmptyState from "./EmptyState";
import toast from "react-hot-toast";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";

interface Recording {
  url?: string;
  file_url?: string;
  video_url?: string;
  filename?: string;
  call_id?: string;
}

// Stream individual recordings arrive with raw technical filenames
// (e.g. `individual_default_<callId>_user_<id>_<uuid>_audio_only_<ts>.mkv`).
// That is unreadable in the UI, so we show a clean label and keep the original
// filename in the tooltip for traceability (P11(d) polish).
function cleanRecordingName(index: number): string {
  return `Recording ${index + 1}`;
}

const RecordingTab = ({ meeting }: { meeting: MeetingDetailData }) => {
  // The Recording tab is owner-only (gated in MeetingTabs), so by the time we
  // reach here the viewer owns the meeting. No generation UI lives here — the
  // F-series only produces a personal .txt via the recap page, and the full AI
  // pipeline runs exclusively through the Upload Transcript flow. This tab is
  // playback only.
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        setIsLoading(true);
        const res = await fetch("/api/recordings");

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data = await res.json();
        setRecordings(data.recordings ?? []);
      } catch (err) {
        console.error("Failed to load recordings:", err);
        toast.error("Failed to load recordings");
        setRecordings([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecordings();
  }, [retryNonce]);

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load recordings."
        onRetry={() => setRetryNonce((k) => k + 1)}
      />
    );
  }

  if (isLoading) {
    return (
      <p className="text-body-md text-on-surface-variant">Loading recordings…</p>
    );
  }

  // Stream call ids may arrive as "type:id" (e.g. "default:abc123") or as a
  // bare id depending on the source. Compare on the segment after the last ":"
  // so attendance/recordings and the meeting row match regardless of prefix.
  const callIdKey = (s?: string): string =>
    s && s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : (s ?? "");
  const matches = recordings.filter(
    (r) => callIdKey(r.call_id) === callIdKey(meeting.streamCallId),
  );

  if (matches.length === 0) {
    return <TabEmptyState message="No recording available for this meeting." />;
  }

  const playUrl = (rec: Recording): string | undefined =>
    rec.url || rec.file_url || rec.video_url;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-sm">
        <div className="divide-y divide-surface-variant">
          {matches.map((rec, i) => (
            <div
              key={`${rec.call_id ?? "rec"}-${i}`}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-primary">
                  <Play className="h-4 w-4" />
                </div>
                <span className="font-body-md font-medium text-on-surface" title={rec.filename ?? undefined}>
                  {cleanRecordingName(i)}
                </span>
              </div>
              {playUrl(rec) ? (
                <a
                  href={playUrl(rec)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
                >
                  <Play className="h-4 w-4" />
                  Play
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Playback is available once the recording is processed"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-surface-container px-4 py-2 text-body-md font-semibold text-on-surface-variant opacity-60"
                >
                  <Play className="h-4 w-4" />
                  Play
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecordingTab;
