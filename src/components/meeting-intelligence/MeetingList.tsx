/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import toast from "react-hot-toast";
import { MeetingListItem } from "@/lib/meeting-types";

const MeetingList = () => {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        setIsLoading(true);
        const res = await fetch("/api/meetings");

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data = (await res.json()) as { meetings: MeetingListItem[] };
        setMeetings(data.meetings ?? []);
      } catch (err) {
        console.error("Failed to load meetings:", err);
        toast.error("Failed to load meetings");
        setMeetings([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMeetings();
  }, []);

  if (isLoading) return <LoaderOne />;

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          Meeting Intelligence
        </h1>
        <p className="text-body-md text-on-surface-variant">
          {meetings.length} meeting{meetings.length === 1 ? "" : "s"}
        </p>
      </header>

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <FileText className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">No meetings yet.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
          >
            <Upload className="h-4 w-4" />
            Upload Transcript
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-12 gap-4 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant">
            <div className="col-span-6 md:col-span-5">Meeting</div>
            <div className="col-span-6 md:col-span-3">Date</div>
            <div className="hidden md:col-span-2">Category</div>
            <div className="col-span-12 text-right md:col-span-2">Action</div>
          </div>
          <div className="divide-y divide-surface-variant">
            {meetings.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-12 items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-container-low"
              >
                <div className="col-span-6 flex items-center gap-3 md:col-span-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <span className="break-words font-body-md font-medium text-on-surface">
                    {m.title}
                  </span>
                </div>
                <div className="col-span-6 text-body-md text-on-surface-variant md:col-span-3">
                  {m.startedAt
                    ? new Date(m.startedAt).toLocaleDateString()
                    : m.createdAt
                      ? new Date(m.createdAt).toLocaleDateString()
                      : "—"}
                </div>
                <div className="hidden md:col-span-2">
                  {m.hasInsights && m.category ? (
                    <span className="inline-flex items-center rounded-full bg-primary-container/15 px-2 py-0.5 text-xs font-medium text-primary-container">
                      {m.category}
                    </span>
                  ) : (
                    <span className="text-xs text-on-surface-variant">
                      Processing…
                    </span>
                  )}
                </div>
                <div className="col-span-12 mt-2 text-right md:col-span-2 md:mt-0">
                  <button
                    onClick={() => router.push(`/meeting-intelligence/${m.id}`)}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
                  >
                    Open Insights
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default MeetingList;
