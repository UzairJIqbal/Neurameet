/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import { ListChecks, Lightbulb, Inbox } from "lucide-react";
import { MeetingInsights } from "@/lib/meeting-types";

const SummaryTab = ({
  insights,
  onRetry,
}: {
  insights: MeetingInsights | null;
  onRetry?: () => void;
}) => {
  const [retrying, setRetrying] = useState(false);

  if (!insights?.summary) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
        <Inbox className="h-10 w-10 text-on-surface-variant" />
        <p className="text-body-lg text-on-surface-variant">
          No summary available yet.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={async () => {
              setRetrying(true);
              try {
                await onRetry();
              } finally {
                setRetrying(false);
              }
            }}
            disabled={retrying}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-primary-container px-4 py-2 text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Retry summary generation"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h2 className="text-headline-md font-semibold text-on-surface">
          Summary
        </h2>
        <p className="whitespace-pre-line text-body-md leading-relaxed text-on-surface-variant">
          {insights.summary}
        </p>
      </div>

      {insights.keyPoints.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="flex items-center gap-2 text-headline-sm font-semibold text-on-surface">
            <ListChecks className="h-5 w-5 text-primary" /> Key Points
          </h3>
          <ul className="flex flex-col gap-2">
            {insights.keyPoints.map((kp, i) => (
              <li
                key={i}
                className="flex gap-2 text-body-md text-on-surface-variant"
              >
                <span className="text-primary">•</span>
                {kp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {insights.decisions.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="flex items-center gap-2 text-headline-sm font-semibold text-on-surface">
            <Lightbulb className="h-5 w-5 text-primary" /> Decisions
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

export default SummaryTab;
