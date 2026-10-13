/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { MeetingDetailData } from "@/lib/meeting-types";
import TabEmptyState from "./EmptyState";
import toast from "react-hot-toast";

interface Recording {
  url?: string;
  file_url?: string;
  video_url?: string;
  filename?: string;
  call_id?: string;
}

const RecordingTab = ({ meeting }: { meeting: MeetingDetailData }) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  }, []);

  if (isLoading) {
    return (
      <p className="text-body-md text-on-surface-variant">Loading recordings…</p>
    );
  }

  const matches = recordings.filter(
    (r) => r.call_id === meeting.streamCallId,
  );

  if (matches.length === 0) {
    return <TabEmptyState message="No recording available for this meeting." />;
  }

  const handlePlay = (rec: Recording) => {
    const url = rec.url || rec.file_url || rec.video_url;

    if (!url) {
      toast.error("No playback URL found");
      return;
    }

    window.open(url, "_blank");
  };

  return (
    <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="divide-y divide-surface-variant">
        {matches.map((rec, i) => (
          <div
            key={rec.call_id ?? i}
            className="flex items-center justify-between gap-4 px-6 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-primary">
                <Play className="h-4 w-4" />
              </div>
              <span className="font-body-md font-medium text-on-surface">
                {rec.filename ?? "Recording"}
              </span>
            </div>
            <button
              onClick={() => handlePlay(rec)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
            >
              <Play className="h-4 w-4" />
              Play
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecordingTab;
