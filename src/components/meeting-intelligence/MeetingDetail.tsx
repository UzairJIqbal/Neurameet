/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft, FileText } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
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
  const { user } = useUser();
  const [data, setData] = useState<MeetingDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  useEffect(() => {
    // Abort the previous request when a retry (or a new meetingId) starts, so
    // a superseded response can never overwrite the latest state.
    const controller = new AbortController();
    const fetchDetail = async () => {
      try {
        setIsLoading(true);
        setNotFound(false);
        const res = await fetch(`/api/meetings/${meetingId}`, {
          signal: controller.signal,
        });

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
        if (controller.signal.aborted) return;
        console.error("Failed to load meeting:", err);
        toast.error("Failed to load meeting");
        setNotFound(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    fetchDetail();
    return () => controller.abort();
  }, [meetingId, retryNonce]);

  const retrySummary = async () => {
    // Guard against a slow/rate-limited AI provider hanging the request forever
    // (same class of hang fixed in UploadTranscriptModal). Signal + timeout so a
    // stuck /api/ai/process surfaces a failure instead of spinning silently.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, emailNotifications: false }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("summary retry failed");
      const refreshed = await fetch(`/api/meetings/${meetingId}`, {
        signal: controller.signal,
      });
      if (refreshed.ok) {
        setData((await refreshed.json()) as MeetingDetailResponse);
      }
      toast.success("Summary regenerated");
    } catch (err) {
      if (controller.signal.aborted) {
        toast.error("Summary generation timed out. Please try again.");
      } else {
        toast.error("Summary generation failed, try again");
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load this meeting."
        onRetry={() => setRetryNonce((k) => k + 1)}
        listHref="/meeting-intelligence"
        listLabel="Back to meetings"
      />
    );
  }

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

  const { meeting, insights, actionItems, attendanceCount } = data;
  const dateLabel = meeting.startedAt ?? meeting.createdAt;
  // Owner check for D3.4 recording-access control. The detail API already
  // restricts to owner-owned meetings, so this is defense-in-depth: a
  // non-owner (if the API filter is ever relaxed) sees no Recording tab.
  const isOwner = !!user?.id && meeting.user_id === user.id;

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => router.push("/meeting-intelligence")}
          className="inline-flex w-fit items-center gap-2 text-body-md text-on-surface-variant transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to meetings
        </button>
        <Link
          href={`/after-meeting/${meeting.id}`}
          className="inline-flex w-fit items-center gap-2 text-body-md text-on-surface-variant transition-colors hover:text-primary"
        >
          <FileText className="h-4 w-4" /> Back to call recap
        </Link>
      </div>

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
        attendanceCount={attendanceCount}
        isOwner={isOwner}
        onRetry={retrySummary}
      />
    </section>
  );
};

export default MeetingDetail;
