/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, VideoOff } from "lucide-react";
import { LoaderOne } from "./ui/loader";
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        const [recRes, meetRes] = await Promise.all([
          fetch("/api/recordings"),
          fetch("/api/meetings"),
        ]);

        if (!recRes.ok) {
          throw new Error(`Recordings API error: ${recRes.status}`);
        }

        const recData = await recRes.json();
        const recList = (recData.recordings ?? []) as Recording[];
        setRecordings(recList);

        if (meetRes.ok) {
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
          setMeetingLinks(links);
        }
      } catch (err) {
        console.error("Failed to load recordings:", err);
        toast.error("Failed to load recordings");
        setRecordings([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePlay = (recording: Recording) => {
    const url = recording?.url || recording?.file_url || recording?.video_url;

    if (!url) {
      toast.error("No playback URL found");
      return;
    }

    window.open(url, "_blank");
  };

  const linkedMeeting = (recording: Recording): LinkedMeeting | undefined =>
    recording.call_id ? meetingLinks.get(recording.call_id) : undefined;

  if (isLoading) return <LoaderOne />;

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          Recordings
        </h1>
        <p className="text-body-md text-on-surface-variant">
          {recordings.length} recording{recordings.length === 1 ? "" : "s"}
        </p>
      </header>

      {recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <VideoOff className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            No recordings yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-12 gap-4 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant">
            <div className="col-span-6 md:col-span-5">Recording</div>
            <div className="col-span-6 md:col-span-4">Date</div>
            <div className="col-span-12 hidden text-right md:col-span-3 md:block">
              Action
            </div>
          </div>
          <div className="divide-y divide-surface-variant">
            {recordings.map((recording, index) => {
              const meeting = linkedMeeting(recording);
              return (
                <div
                  key={recording?.id || recording?.call_id || index}
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
                  <div className="col-span-6 text-body-md text-on-surface-variant md:col-span-4">
                    {recording?.start_time
                      ? new Date(recording.start_time).toLocaleString()
                      : "No date available"}
                  </div>
                  <div className="col-span-12 mt-2 flex flex-wrap justify-start gap-2 md:col-span-3 md:mt-0 md:justify-end">
                    <button
                      onClick={() => handlePlay(recording)}
                      className="inline-flex items-center gap-2 rounded-lg border border-surface-variant px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <Play className="h-4 w-4" />
                      Play
                    </button>
                    {meeting && (
                      <button
                        onClick={() =>
                          router.push(`/meeting-intelligence/${meeting.id}`)
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
                      >
                        View insights
                      </button>
                    )}
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
