/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import { User, CalendarDays } from "lucide-react";
import { ActionItem, MeetingInsights } from "@/lib/meeting-types";
import TabEmptyState from "./EmptyState";

const ActionItemsTab = ({
  insights,
  actionItems,
}: {
  insights: MeetingInsights | null;
  actionItems: ActionItem[];
}) => {
  return (
    <div className="flex flex-col gap-6">
      {actionItems.length === 0 ? (
        <TabEmptyState message="No action items yet." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="divide-y divide-surface-variant">
            {actionItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-container" />
                  <span className="font-body-md font-medium text-on-surface">
                    {item.title}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 pl-5 text-body-md text-on-surface-variant">
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
            ))}
          </div>
        </div>
      )}

      {insights && insights.decisions.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
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
