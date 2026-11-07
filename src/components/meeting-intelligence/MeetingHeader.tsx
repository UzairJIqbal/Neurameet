/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import Link from "next/link";
import { CalendarDays, Clock, Download, FolderKanban, User, Video } from "lucide-react";
import {
  MEETING_TYPE_LABELS,
  type MeetingDetailData,
  type MeetingInsights,
} from "@/lib/meeting-types";
import { meetingSummaryText, summaryFileName } from "@/lib/meeting-export";
import MeetingParticipants from "./MeetingParticipants";

const CHIP = "inline-flex items-center rounded-full px-3 py-1 text-label-caps uppercase tracking-wider";
const META = "inline-flex items-center gap-1.5 text-body-md text-on-surface-variant";

const timeOf = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const durationLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

const timeRange = (meeting: MeetingDetailData) => {
  const start = new Date(meeting.startedAt ?? meeting.createdAt);
  const endValue = meeting.endedAt ?? meeting.scheduledEndAt;
  if (!endValue) return timeOf(start);
  const end = new Date(endValue);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes <= 0) return timeOf(start);
  return `${timeOf(start)} to ${timeOf(end)} (${durationLabel(minutes)})`;
};

const downloadSummary = (meeting: MeetingDetailData, insights: MeetingInsights) => {
  const text = meetingSummaryText(meeting.title, meeting.startedAt ?? meeting.createdAt, insights);
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = summaryFileName(meeting.title);
  link.click();
  URL.revokeObjectURL(url);
};

type Props = {
  meeting: MeetingDetailData;
  insights: MeetingInsights | null;
  projectId: string | null;
  projectName: string | null;
};

const MeetingHeader = ({ meeting, insights, projectId, projectName }: Props) => {
  const date = new Date(meeting.startedAt ?? meeting.createdAt);
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-surface-variant bg-surface-container-lowest p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-container/15 text-primary-container">
            <Video className="h-6 w-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-headline-md text-on-surface">{meeting.title}</h1>
              <span className={`${CHIP} bg-surface-container-low text-on-surface-variant`}>{meeting.status}</span>
              {meeting.meetingType && (
                <span className={`${CHIP} bg-secondary-container text-on-secondary-container`}>
                  {MEETING_TYPE_LABELS[meeting.meetingType]}
                </span>
              )}
              {insights?.category && (
                <span className={`${CHIP} bg-primary-container/15 text-primary-container`}>{insights.category}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {projectId && projectName && (
                <Link href={`/projects/${projectId}`} className={`${META} hover:text-primary`}>
                  <FolderKanban className="h-4 w-4" aria-hidden /> {projectName}
                </Link>
              )}
              <span className={META}>
                <CalendarDays className="h-4 w-4" aria-hidden />
                {date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
              <span className={META}>
                <Clock className="h-4 w-4" aria-hidden /> {timeRange(meeting)}
              </span>
              <span className={META}>
                <User className="h-4 w-4" aria-hidden /> Organised by {meeting.organizerName}
              </span>
            </div>
          </div>
        </div>
        {insights?.summary && (
          <button
            type="button"
            onClick={() => downloadSummary(meeting, insights)}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low"
          >
            <Download className="h-4 w-4" aria-hidden /> Export summary
          </button>
        )}
      </div>
      {meeting.description && (
        <p className="whitespace-pre-wrap break-words text-body-md text-on-surface-variant">{meeting.description}</p>
      )}
      <MeetingParticipants
        projectId={projectId}
        organizerId={meeting.user_id}
        invitedUserIds={meeting.invitedUserIds}
      />
    </header>
  );
};

export default MeetingHeader;
