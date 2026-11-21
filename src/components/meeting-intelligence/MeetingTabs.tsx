/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import {
  ActionItem,
  MeetingDetailData,
  MeetingInsights,
} from "@/lib/meeting-types";
import OverviewTab from "./OverviewTab";
import SummaryTab from "./SummaryTab";
import ActionItemsTab from "./ActionItemsTab";
import RecordingTab from "./RecordingTab";
import CategoryTab from "./CategoryTab";
import AiChatTab from "./AiChatTab";
import EngagementTab from "./EngagementTab";
import TranscriptTab from "./TranscriptTab";
import ProposalsPanel from "@/components/projects/ProposalsPanel";
import type { ProjectRole } from "@/lib/project-types";

// AC-70v: every shipped tab stays, in this order.
const TABS = [
  "Overview",
  "AI Summary",
  "Transcript",
  "Action Items",
  "Recording",
  "Category",
  "Engagement",
  "AI Chat",
] as const;

type TabKey = (typeof TABS)[number];

// D3.4: the Recording tab is owner-only. Non-owners never see it.
// AC-70v: a Viewer never sees the Transcript tab.
const VISIBLE_TABS = (isOwner: boolean, isViewer: boolean): readonly TabKey[] =>
  TABS.filter((t) => {
    if (t === "Recording") return isOwner;
    if (t === "Transcript") return !isViewer;
    return true;
  });

const MeetingTabs = ({
  meeting,
  insights,
  actionItems,
  meetingId,
  attendanceCount,
  isOwner,
  onRetry,
  onMoved,
  projectId = null,
  role = null,
  transcriptText,
  onProposalsChanged,
}: {
  meeting: MeetingDetailData;
  insights: MeetingInsights | null;
  actionItems: ActionItem[];
  meetingId: string;
  attendanceCount: number;
  isOwner: boolean;
  onRetry?: () => void;
  onMoved?: () => void;
  projectId?: string | null;
  role?: ProjectRole | null;
  transcriptText?: string | null;
  onProposalsChanged?: () => void;
}) => {
  const [active, setActive] = useState<TabKey>("Overview");
  const isViewer = role === "viewer";
  const visibleTabs = VISIBLE_TABS(isOwner, isViewer);
  // AC-70w: unreviewed and dismissed rows live in the review panel, not the list.
  const listedItems = projectId
    ? actionItems.filter(
        (item) =>
          item.reviewState !== "proposed" && item.reviewState !== "rejected",
      )
    : actionItems;

  const pendingReview =
    projectId && !isViewer
      ? actionItems.filter((item) => item.reviewState === "proposed").length
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 overflow-x-auto border-b border-surface-variant">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-body-md font-body-md font-medium transition-colors ${
              active === tab
                ? "border-primary-container text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div>
        {active === "Overview" && pendingReview > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-container-lowest px-5 py-4 shadow-card">
            <p className="text-body-md text-on-surface">
              {pendingReview} task{pendingReview === 1 ? "" : "s"} from this
              meeting {pendingReview === 1 ? "is" : "are"} waiting for review.
            </p>
            <button
              type="button"
              onClick={() => setActive("Action Items")}
              className="rounded-full border border-primary-container px-4 py-2 text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/10"
            >
              Review tasks
            </button>
          </div>
        )}
        {active === "Overview" && (
          <OverviewTab
            meeting={meeting}
            insights={insights}
            actionItems={listedItems}
            attendanceCount={attendanceCount}
            isOwner={isOwner}
            onMoved={onMoved}
          />
        )}
        {active === "AI Summary" && (
          <SummaryTab
            insights={insights}
            onRetry={isOwner ? onRetry : undefined}
            transcriptMissing={!isViewer && !transcriptText?.trim()}
            recapHref={
              meeting.streamCallId
                ? `/after-meeting/${meeting.streamCallId}`
                : undefined
            }
          />
        )}
        {!isViewer && active === "Transcript" && (
          <TranscriptTab text={transcriptText} />
        )}
        {active === "Action Items" && (
          <div className="flex flex-col gap-6">
            {projectId && role && !isViewer && (
              <ProposalsPanel
                project={{ id: projectId }}
                meetingId={meetingId}
                onChanged={onProposalsChanged}
              />
            )}
            <ActionItemsTab
              insights={insights}
              actionItems={listedItems}
              canManage={!projectId && isOwner}
            />
          </div>
        )}
        {isOwner && active === "Recording" && (
          <RecordingTab meeting={meeting} />
        )}
        {active === "Category" && (
          <CategoryTab insights={insights} meetingId={meetingId} />
        )}
        {active === "AI Chat" && <AiChatTab meetingId={meetingId} />}
        {active === "Engagement" && <EngagementTab meetingId={meetingId} />}
      </div>
    </div>
  );
};

export default MeetingTabs;
