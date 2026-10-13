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

const TABS = [
  "Overview",
  "Summary",
  "Action Items",
  "Recording",
  "Category",
  "AI Chat",
  "Engagement",
] as const;

type TabKey = (typeof TABS)[number];

// D3.4: the Recording tab is owner-only. Non-owners never see it.
const VISIBLE_TABS = (isOwner: boolean): readonly TabKey[] =>
  TABS.filter((t) => t !== "Recording" || isOwner);

const MeetingTabs = ({
  meeting,
  insights,
  actionItems,
  meetingId,
  attendanceCount,
  isOwner,
  onRetry,
}: {
  meeting: MeetingDetailData;
  insights: MeetingInsights | null;
  actionItems: ActionItem[];
  meetingId: string;
  attendanceCount: number;
  isOwner: boolean;
  onRetry?: () => void;
}) => {
  const [active, setActive] = useState<TabKey>("Overview");
  const visibleTabs = VISIBLE_TABS(isOwner);

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
        {active === "Overview" && (
          <OverviewTab
            meeting={meeting}
            insights={insights}
            actionItems={actionItems}
            attendanceCount={attendanceCount}
            isOwner={isOwner}
          />
        )}
        {active === "Summary" && (
          <SummaryTab insights={insights} onRetry={onRetry} />
        )}
        {active === "Action Items" && (
          <ActionItemsTab insights={insights} actionItems={actionItems} />
        )}
        {isOwner && active === "Recording" && <RecordingTab meeting={meeting} />}
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
