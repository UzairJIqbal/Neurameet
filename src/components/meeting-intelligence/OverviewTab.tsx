/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import { Calendar, CheckSquare, Tag, CircleDot, Download } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  ActionItem,
  MeetingDetailData,
  MeetingInsights,
  type GuestAdmissionMode,
} from "@/lib/meeting-types";
import { updateMeetingGuestAdmissionMode } from "@/actions/meetings";

const StatCard = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="flex flex-col gap-2 rounded-xl border border-surface-variant bg-surface-container-lowest p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
    <div className="flex items-center gap-2 text-on-surface-variant">
      {icon}
      <span className="text-label-caps uppercase tracking-wider">{label}</span>
    </div>
    <span className="text-body-lg font-medium text-on-surface">{value}</span>
  </div>
);

const OverviewTab = ({
  meeting,
  insights,
  actionItems,
  attendanceCount,
  isOwner,
}: {
  meeting: MeetingDetailData;
  insights: MeetingInsights | null;
  actionItems: ActionItem[];
  attendanceCount: number;
  isOwner: boolean;
}) => {
  const [admissionMode, setAdmissionMode] = useState<GuestAdmissionMode>(
    meeting.guestAdmissionMode ?? "approval",
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleAdmissionChange = async (mode: GuestAdmissionMode) => {
    if (!isOwner || isSaving) return;
    setIsSaving(true);
    const prev = admissionMode;
    setAdmissionMode(mode);
    const result = await updateMeetingGuestAdmissionMode(meeting.id, mode);
    if (result.ok) {
      toast.success(
        mode === "open"
          ? "Guests can now join freely"
          : "Guest approval required",
      );
    } else {
      setAdmissionMode(prev);
      toast.error(result.error ?? "Failed to update admission mode");
    }
    setIsSaving(false);
  };
  const dateLabel = meeting.startedAt ?? meeting.createdAt;
  const summaryPreview = insights?.summary
    ? insights.summary.length > 320
      ? `${insights.summary.slice(0, 320)}…`
      : insights.summary
    : null;

  const hasAttendance = attendanceCount > 0;
  // The report API is owner-only, so participants never get a link that 404s.
  const canDownloadReport = hasAttendance && isOwner;
  const reportHref = `/api/attendance/report?meetingId=${meeting.id}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-body-md font-medium text-on-surface">
            Attendance Report
          </span>
          <span className="text-body-md text-on-surface-variant">
            {canDownloadReport
              ? "Download the participant attendance PDF for this meeting."
              : hasAttendance
                ? "Only the meeting owner can download the attendance report."
                : "No attendance recorded yet."}
          </span>
        </div>
        {canDownloadReport ? (
          <a
            href={reportHref}
            download
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-medium text-on-primary transition-colors hover:bg-primary"
          >
            <Download className="h-4 w-4" /> Download
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex w-fit cursor-not-allowed items-center gap-2 rounded-lg bg-surface-container px-4 py-2 text-body-md font-medium text-on-surface-variant opacity-60"
          >
            <Download className="h-4 w-4" /> Download
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Tag className="h-4 w-4" />}
          label="Category"
          value={insights?.category ?? "—"}
        />
        <StatCard
          icon={<CheckSquare className="h-4 w-4" />}
          label="Action Items"
          value={String(actionItems.length)}
        />
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          label="Date"
          value={dateLabel ? new Date(dateLabel).toLocaleDateString() : "—"}
        />
        <StatCard
          icon={<CircleDot className="h-4 w-4" />}
          label="Status"
          value={meeting.status}
        />
      </div>

      {isOwner && (
        <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-1">
            <span className="text-body-md font-medium text-on-surface">
              Guest Admission
            </span>
            <span className="text-body-md text-on-surface-variant">
              {admissionMode === "open"
                ? "Anyone with the link can join freely"
                : "Guests must be approved by you"}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleAdmissionChange("open")}
              disabled={isSaving || admissionMode === "open"}
              className={`rounded-lg px-4 py-2 text-body-md font-medium transition-colors ${
                admissionMode === "open"
                  ? "bg-primary-container text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              } disabled:opacity-60`}
            >
              Anyone can join
            </button>
            <button
              type="button"
              onClick={() => handleAdmissionChange("approval")}
              disabled={isSaving || admissionMode === "approval"}
              className={`rounded-lg px-4 py-2 text-body-md font-medium transition-colors ${
                admissionMode === "approval"
                  ? "bg-primary-container text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              } disabled:opacity-60`}
            >
              Approval required
            </button>
          </div>
        </div>
      )}

      {summaryPreview ? (
        <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="text-headline-md font-semibold text-on-surface">
            Summary
          </h2>
          <p className="whitespace-pre-line text-body-md leading-relaxed text-on-surface-variant">
            {summaryPreview}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-10 text-center text-body-md text-on-surface-variant">
          No summary available yet.
        </div>
      )}
    </div>
  );
};

export default OverviewTab;
