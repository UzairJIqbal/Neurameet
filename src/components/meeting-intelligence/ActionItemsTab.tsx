/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { User, CalendarDays, ArrowRight } from "lucide-react";
import {
  ActionItem,
  FollowUpStatus,
  MeetingInsights,
} from "@/lib/meeting-types";
import FollowUpCheck from "@/components/follow-ups/FollowUpCheck";
import TabEmptyState from "./EmptyState";

const STATUS_CHIP: Record<FollowUpStatus, { label: string; className: string }> = {
  pending: { label: "Open", className: "bg-surface-container text-on-surface-variant" },
  needs_attention: { label: "Needs attention", className: "bg-error-container text-error" },
  completed: { label: "Done", className: "bg-success-container text-on-success-container" },
};

// Leading marker: the owner ticks the follow-up, others see a dot (the status
// chip sits with the meta), and items with no follow-up keep the plain dot.
const ItemMarker = ({
  item,
  canManage,
  onStatusChange,
}: {
  item: ActionItem;
  canManage: boolean;
  onStatusChange: (status: FollowUpStatus) => void;
}) =>
  canManage && item.followUpId && item.followUpStatus ? (
    <FollowUpCheck
      id={item.followUpId}
      status={item.followUpStatus}
      title={item.title}
      onChange={onStatusChange}
    />
  ) : (
    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-container" />
  );

const ActionItemsTab = ({
  insights,
  actionItems,
  canManage = false,
}: {
  insights: MeetingInsights | null;
  actionItems: ActionItem[];
  /** Personal meeting owner: may tick follow-ups done. */
  canManage?: boolean;
}) => {
  // Local copy so a tick shows at once without reloading the meeting.
  const [items, setItems] = useState(actionItems);
  useEffect(() => setItems(actionItems), [actionItems]);
  const hasFollowUps = items.some((i) => i.followUpId);

  const setStatus = (id: string, status: FollowUpStatus) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, followUpStatus: status } : i)),
    );

  return (
    <div className="flex flex-col gap-6">
      {items.length === 0 ? (
        <TabEmptyState message="No action items yet." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-card">
          <div className="divide-y divide-surface-variant">
            {items.map((item) => {
              const done = item.followUpStatus === "completed";
              const chip = item.followUpStatus && !canManage
                ? STATUS_CHIP[item.followUpStatus]
                : null;
              return (
              <div
                key={item.id}
                className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-3">
                  <ItemMarker
                    item={item}
                    canManage={canManage}
                    onStatusChange={(status) => setStatus(item.id, status)}
                  />
                  <span
                    className={`font-body-md font-medium ${
                      done ? "text-on-surface-variant line-through" : "text-on-surface"
                    }`}
                  >
                    {item.title}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 pl-5 text-body-md text-on-surface-variant">
                  {chip && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-label-caps uppercase tracking-wider ${chip.className}`}
                    >
                      {chip.label}
                    </span>
                  )}
                  {item.assignee && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-4 w-4" /> {item.assignee}
                    </span>
                  )}
                  {item.dueDate && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-4 w-4" />
                      {new Date(item.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {hasFollowUps && (
        <Link
          href="/follow-ups"
          className="inline-flex w-fit items-center gap-1 text-body-md text-primary hover:underline"
        >
          See all follow-ups
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}

      {insights && insights.decisions.length > 0 && (
        <div className="flex flex-col gap-3 rounded-card bg-surface-container-lowest p-6 shadow-card">
          <h3 className="text-headline-sm font-semibold text-on-surface">
            Decisions
          </h3>
          <ul className="flex flex-col gap-2">
            {insights.decisions.map((d, i) => (
              <li
                key={i}
                className="flex gap-2 text-body-md text-on-surface-variant"
              >
                <span className="text-primary">•</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ActionItemsTab;
