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

const TABS = [
  "Overview",
  "Summary",
  "Action Items",
  "Recording",
  "Category",
  "AI Chat",
] as const;

type TabKey = (typeof TABS)[number];

const MeetingTabs = ({
  meeting,
  insights,
  actionItems,
  meetingId,
}: {
  meeting: MeetingDetailData;
  insights: MeetingInsights | null;
  actionItems: ActionItem[];
  meetingId: string;
}) => {
  const [active, setActive] = useState<TabKey>("Overview");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 overflow-x-auto border-b border-surface-variant">
        {TABS.map((tab) => (
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
          />
        )}
        {active === "Summary" && <SummaryTab insights={insights} />}
        {active === "Action Items" && (
          <ActionItemsTab insights={insights} actionItems={actionItems} />
        )}
        {active === "Recording" && <RecordingTab meeting={meeting} />}
        {active === "Category" && (
          <CategoryTab insights={insights} meetingId={meetingId} />
        )}
        {active === "AI Chat" && <AiChatTab meetingId={meetingId} />}
      </div>
    </div>
  );
};

export default MeetingTabs;
