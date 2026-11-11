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
import MinutesTab from "./MinutesTab";
import TranscriptTab from "./TranscriptTab";
import ProposalsPanel from "@/components/projects/ProposalsPanel";
import { fetchLedger } from "@/lib/ledger-client";
import type { ProjectRole } from "@/lib/project-types";

const LEDGER_TAB = "Decisions and Promises";

// AC-70v: every shipped tab stays, in this order.
const TABS = [
  "Overview",
  "AI Summary",
  "Transcript",
  LEDGER_TAB,
  "Action Items",
  "Recording",
  "Category",
  "Minutes",
  "Engagement",
  "AI Chat",
] as const;

type TabKey = (typeof TABS)[number];

// D3.4: the Recording tab is owner-only. Non-owners never see it.
// Spec 0001 AC-12: the Ledger tab is owner-only on a personal meeting. On a project
// meeting every member reads it, and `canManage` decides the controls (AC-58b).
// AC-70v: a Viewer never sees the Transcript tab.
const VISIBLE_TABS = (isOwner: boolean, ledgerOpen: boolean, isViewer: boolean): readonly TabKey[] =>
  TABS.filter((t) => {
    if (t === "Recording") return isOwner;
    if (t === LEDGER_TAB) return ledgerOpen;
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
  ledgerVersion = 0,
  projectId = null,
  canManage,
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
  ledgerVersion?: number;
  projectId?: string | null;
  canManage?: boolean;
  role?: ProjectRole | null;
  transcriptText?: string | null;
  onProposalsChanged?: () => void;
}) => {
  const [active, setActive] = useState<TabKey>("Overview");
  const [reversalCount, setReversalCount] = useState(0);
  const ledgerOpen = isOwner || !!projectId;
  const isViewer = role === "viewer";
  const visibleTabs = VISIBLE_TABS(isOwner, ledgerOpen, isViewer);
  // AC-70w: unreviewed and dismissed rows live in the review panel, not the list.
  const listedItems = projectId
    ? actionItems.filter((item) => item.reviewState !== "proposed" && item.reviewState !== "rejected")
    : actionItems;

  // Spec 0001 AC-11: the Ledger tab badge. No spinner, so a failure only hides it.
  useEffect(() => {
    if (!ledgerOpen) return;
    const controller = new AbortController();
    fetchLedger(meetingId, controller.signal)
      .then((json) => setReversalCount(json.reversalCount))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          console.error("[ledger] badge fetch failed:", err);
        }
      });
    return () => controller.abort();
  }, [ledgerOpen, meetingId, ledgerVersion]);

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
            {tab === LEDGER_TAB && reversalCount > 0 && (
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
        {!isViewer && active === "Transcript" && <TranscriptTab text={transcriptText} />}
        {active === "Action Items" && (
          <div className="flex flex-col gap-6">
            {projectId && role && !isViewer && (
              <ProposalsPanel project={{ id: projectId }} meetingId={meetingId} onChanged={onProposalsChanged} />
            )}
            <ActionItemsTab insights={insights} actionItems={listedItems} />
          </div>
        )}
        {isOwner && active === "Recording" && <RecordingTab meeting={meeting} />}
        {active === "Category" && (
          <CategoryTab insights={insights} meetingId={meetingId} />
        )}
        {active === "AI Chat" && <AiChatTab meetingId={meetingId} />}
        {active === "Engagement" && <EngagementTab meetingId={meetingId} />}
        {ledgerOpen && active === LEDGER_TAB && <LedgerTab meetingId={meetingId} canManage={canManage ?? isOwner} refreshKey={ledgerVersion} onReversalCount={setReversalCount} />}
        {active === "Minutes" && <MinutesTab meetingId={meetingId} />}
      </div>
    </div>
  );
};

export default MeetingTabs;
