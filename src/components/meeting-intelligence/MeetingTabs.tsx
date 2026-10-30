/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
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
import LedgerTab from "./LedgerTab";
import { fetchLedger } from "@/lib/ledger-client";

const TABS = [
  "Overview",
  "Summary",
  "Action Items",
  "Recording",
  "Category",
  "AI Chat",
  "Engagement",
  "Ledger",
] as const;

type TabKey = (typeof TABS)[number];

// D3.4: the Recording tab is owner-only. Non-owners never see it.
// Spec 0001 AC-12: the Ledger tab is owner-only too.
const OWNER_ONLY_TABS: readonly TabKey[] = ["Recording", "Ledger"];
const VISIBLE_TABS = (isOwner: boolean): readonly TabKey[] =>
  TABS.filter((t) => isOwner || !OWNER_ONLY_TABS.includes(t));

const MeetingTabs = ({
  meeting,
  insights,
  actionItems,
  meetingId,
  attendanceCount,
  isOwner,
  onRetry,
  ledgerVersion = 0,
}: {
  meeting: MeetingDetailData;
  insights: MeetingInsights | null;
  actionItems: ActionItem[];
  meetingId: string;
  attendanceCount: number;
  isOwner: boolean;
  onRetry?: () => void;
  ledgerVersion?: number;
}) => {
  const [active, setActive] = useState<TabKey>("Overview");
  const [reversalCount, setReversalCount] = useState(0);
  const visibleTabs = VISIBLE_TABS(isOwner);

  // Spec 0001 AC-11: the Ledger tab badge. No spinner, so a failure only hides it.
  useEffect(() => {
    if (!isOwner) return;
    const controller = new AbortController();
    fetchLedger(meetingId, controller.signal)
      .then((json) => setReversalCount(json.reversalCount))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          console.error("[ledger] badge fetch failed:", err);
        }
      });
    return () => controller.abort();
  }, [isOwner, meetingId, ledgerVersion]);

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
            {tab === "Ledger" && reversalCount > 0 && (
              <span
                aria-label={`${reversalCount} reversed`}
                className="ml-2 rounded-full bg-error-container px-2 py-0.5 text-label-caps text-error"
              >
                {reversalCount}
              </span>
            )}
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
          <SummaryTab
            insights={insights}
            onRetry={isOwner ? onRetry : undefined}
          />
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
        {isOwner && active === "Ledger" && <LedgerTab meetingId={meetingId} refreshKey={ledgerVersion} onReversalCount={setReversalCount} />}
      </div>
    </div>
  );
};

export default MeetingTabs;
