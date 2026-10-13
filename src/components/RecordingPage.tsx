/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Search, VideoOff } from "lucide-react";
import { LoaderOne } from "./ui/loader";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import toast from "react-hot-toast";

interface Recording {
  id?: string;
  url?: string;
  file_url?: string;
  video_url?: string;
  filename?: string;
  start_time?: string;
  call_id?: string;
}

interface LinkedMeeting {
  id: string;
  title: string;
}

const RecordingPage = () => {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [meetingLinks, setMeetingLinks] = useState<
    Map<string, LinkedMeeting>
  >(new Map());
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  // D3.4 /debug: a composite frame recording is only queryable once Stream has
  // finished processing it, which routinely takes several minutes. A single
  // fetch on mount left the page empty until a manual reload, so we keep polling
  // (10s) until a recording appears or a bounded window (15 min) passes, and
  // stop the moment one shows up. Meetings are fetched once (links are a
  // nice-to-have and must never block the recordings view).
  useEffect(() => {
    let active = true;
    let ticks = 0;
    let hasErrored = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const CEILING = 90; // 90 x 10s ~= 15 minutes, covers Stream composite latency

    const loadMeetings = async () => {
      try {
        const meetRes = await fetch("/api/meetings");
        if (!meetRes.ok) return;
        const meetData = await meetRes.json();
        const meetings = (meetData.meetings ?? []) as Array<{
          streamCallId: string;
          id: string;
          title: string;
        }>;
        const links = new Map<string, LinkedMeeting>();
        for (const m of meetings) {
          if (m.streamCallId) {
            links.set(m.streamCallId, { id: m.id, title: m.title });
          }
        }
        if (active) setMeetingLinks(links);
      } catch {
        /* meetings are optional context, never fail the recordings view */
      }
    };

    const loadRecordings = async () => {
      try {
        const recRes = await fetch("/api/recordings");
        if (!recRes.ok) {
          throw new Error(`Recordings API error: ${recRes.status}`);
        }
        const recData = await recRes.json();
        const recList = (recData.recordings ?? []) as Recording[];
        if (!active) return;
        setRecordings(recList);
        if (recList.length > 0 || ++ticks >= CEILING) {
          if (intervalId) clearInterval(intervalId);
        }
      } catch (err) {
        if (!active) return;
        console.error("Failed to load recordings:", err);
        // Keep polling: a transient failure must not stop the auto-refresh that
        // surfaces a recording once Stream finishes processing it. Only warn
        // once so we don't spam the toast every 10s. Last good data (if any)
        // stays visible; the interval keeps running until the ceiling.
        if (!hasErrored) {
          hasErrored = true;
          toast.error("Could not reach the recordings service. Retrying…");
        }
        if (++ticks >= CEILING) {
          if (intervalId) clearInterval(intervalId);
        }
      }
    };

    setIsLoading(true);
    loadRecordings();
    loadMeetings().finally(() => {
      if (active) setIsLoading(false);
    });
    intervalId = setInterval(loadRecordings, 10000);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [retryNonce]);

  const playUrl = (recording: Recording): string | undefined =>
    recording?.url || recording?.file_url || recording?.video_url;

  const linkedMeeting = (recording: Recording): LinkedMeeting | undefined =>
    recording.call_id ? meetingLinks.get(recording.call_id) : undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recordings;
    return recordings.filter((r) => {
      const name = (r.filename ?? "").toLowerCase();
      const title = (linkedMeeting(r)?.title ?? "").toLowerCase();
      return name.includes(q) || title.includes(q);
    });
  }, [query, recordings, meetingLinks]);

  const handleDeleteRecording = async (id?: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/recordings/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Delete failed: ${res.status}`);
      }
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      toast.success("Recording deleted");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete recording";
      toast.error(msg);
    }
  };

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load recordings."
        onRetry={() => setRetryNonce((k) => k + 1)}
      />
    );
  }

  if (isLoading) return <LoaderOne />;

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-y-auto px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          Recordings
        </h1>
        <p className="text-body-md text-on-surface-variant">
          {recordings.length} recording{recordings.length === 1 ? "" : "s"}
        </p>
      </header>

      {recordings.length > 0 && (
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or meeting"
            className="w-full rounded-lg border border-surface-variant bg-surface-container-lowest py-2 pl-9 pr-3 text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
          />
        </div>
      )}

      {recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <VideoOff className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            No recordings yet. Composite recordings can take several minutes to
            finish processing after you stop, then appear here automatically.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <VideoOff className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            No recordings match “{query}”.
          </p>
        </div>
      ) : (
        <div className="shrink-0 overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-sm">
          <div className="grid grid-cols-12 gap-4 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant">
            <div className="col-span-6 md:col-span-5">Recording</div>
            <div className="col-span-6 md:col-span-3">Date</div>
            <div className="col-span-12 hidden text-right md:col-span-4 md:block">
              Action
            </div>
          </div>
          <div className="divide-y divide-surface-variant">
            {filtered.map((recording, index) => {
              const meeting = linkedMeeting(recording);
              return (
                <div
                  key={`${recording?.id ?? recording?.call_id ?? "rec"}-${index}`}
                  className="grid grid-cols-12 items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-container-low"
                >
                  <div className="col-span-6 flex items-center gap-3 md:col-span-5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-primary">
                      <Play className="h-4 w-4" />
                    </div>
                    <span className="break-words font-body-md font-medium text-on-surface">
                      {recording?.filename?.substring(0, 40) ||
                        "Untitled recording"}
                    </span>
                  </div>
                  <div className="col-span-6 text-body-md text-on-surface-variant md:col-span-3">
                    {recording?.start_time
                      ? new Date(recording.start_time).toLocaleString()
                      : "No date available"}
                  </div>
                  <div className="col-span-12 mt-2 flex flex-wrap justify-start gap-2 md:col-span-4 md:flex-nowrap md:mt-0 md:justify-end">
                    {playUrl(recording) ? (
                      <a
                        href={playUrl(recording)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-surface-variant px-4 py-2 text-body-md font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
                      >
                        <Play className="h-4 w-4" />
                        Play
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="Playback is available once the recording is processed"
                        className="inline-flex cursor-not-allowed items-center gap-2 whitespace-nowrap rounded-lg border border-surface-variant px-4 py-2 text-body-md font-medium text-on-surface-variant opacity-60"
                      >
                        <Play className="h-4 w-4" />
                        Play
                      </button>
                    )}
                    <ConfirmDelete
                      label="Delete recording"
                      confirmLabel="Delete"
                      onConfirm={() => handleDeleteRecording(recording.id)}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        meeting
                          ? router.push(`/meeting-intelligence/${meeting.id}`)
                          : toast.error(
                              "No meeting is linked to this recording yet",
                            )
                      }
                      disabled={!meeting}
                      title={
                        meeting
                          ? "Open meeting insights"
                          : "No meeting is linked to this recording yet"
                      }
                      className={
                        meeting
                          ? "inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
                          : "inline-flex cursor-not-allowed items-center gap-2 whitespace-nowrap rounded-lg bg-surface-container px-4 py-2 text-body-md font-semibold text-on-surface-variant opacity-60"
                      }
                    >
                      View insights
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default RecordingPage;
