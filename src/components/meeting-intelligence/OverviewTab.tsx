/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import { Calendar, CheckSquare, Tag, CircleDot } from "lucide-react";
import {
  ActionItem,
  MeetingDetailData,
  MeetingInsights,
} from "@/lib/meeting-types";

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
}: {
  meeting: MeetingDetailData;
  insights: MeetingInsights | null;
  actionItems: ActionItem[];
}) => {
  const dateLabel = meeting.startedAt ?? meeting.createdAt;
  const summaryPreview = insights?.summary
    ? insights.summary.length > 320
      ? `${insights.summary.slice(0, 320)}…`
      : insights.summary
    : null;

  return (
    <div className="flex flex-col gap-6">
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
