/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import toast from "react-hot-toast";
import {
  ActionItem,
  MeetingDetailResponse,
  MeetingDetailData,
  MeetingInsights,
} from "@/lib/meeting-types";
import MeetingTabs from "./MeetingTabs";

const MeetingDetail = ({ meetingId }: { meetingId: string }) => {
  const router = useRouter();
  const [data, setData] = useState<MeetingDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/meetings/${meetingId}`);

        if (res.status === 404) {
          setNotFound(true);
          return;
        }

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const json = (await res.json()) as MeetingDetailResponse;
        setData(json);
      } catch (err) {
        console.error("Failed to load meeting:", err);
        toast.error("Failed to load meeting");
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetail();
  }, [meetingId]);

  if (isLoading) return <LoaderOne />;

  if (notFound || !data) {
    return (
      <section className="flex w-full flex-col gap-6 px-6 py-8">
        <button
          onClick={() => router.push("/meeting-intelligence")}
          className="inline-flex w-fit items-center gap-2 text-body-md text-on-surface-variant transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to meetings
        </button>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <FileText className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            Meeting not found.
          </p>
        </div>
      </section>
    );
  }

  const { meeting, insights, actionItems } = data;
  const dateLabel = meeting.startedAt ?? meeting.createdAt;

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <button
        onClick={() => router.push("/meeting-intelligence")}
        className="inline-flex w-fit items-center gap-2 text-body-md text-on-surface-variant transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to meetings
      </button>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
            {meeting.title}
          </h1>
          <span className="inline-flex items-center rounded-full bg-surface-container-low px-3 py-1 text-label-caps uppercase tracking-wider text-on-surface-variant">
            {meeting.status}
          </span>
          {insights?.category && (
            <span className="inline-flex items-center rounded-full bg-primary-container/15 px-3 py-1 text-label-caps uppercase tracking-wider text-primary-container">
              {insights.category}
            </span>
          )}
        </div>
        <p className="text-body-md text-on-surface-variant">
          {dateLabel ? new Date(dateLabel).toLocaleString() : "No date"}
        </p>
      </header>

      <MeetingTabs
        meeting={meeting as MeetingDetailData}
        insights={insights as MeetingInsights | null}
        actionItems={actionItems as ActionItem[]}
        meetingId={meeting.id}
      />
    </section>
  );
};

export default MeetingDetail;
