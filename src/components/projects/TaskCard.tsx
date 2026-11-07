/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import { CalendarDays, MessageSquare, Quote, User, Video } from "lucide-react";
import type { Task } from "@/lib/task-types";
import { PriorityBadge, PrRefChips } from "./task-visuals";

const quoteTooltip = (task: Task) => {
  const where = [
    task.quoteSpeaker,
    task.quoteLine ? `line ${task.quoteLine}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `"${task.quote}"${where ? ` (${where})` : ""}`;
};

// One board card (AC-70p). Viewers never get the quote, comment count, or PR
// refs, so those simply never render for them.
const TaskCard = ({ task }: { task: Task }) => (
  <div className="flex flex-col gap-2 rounded-lg border border-surface-variant bg-surface-container-lowest p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-label-mono text-on-surface-variant">{task.key}</span>
      <PriorityBadge priority={task.priority} />
    </div>
    <p className="break-words text-body-md text-on-surface">{task.title}</p>
    {(task.sourceMeetingId || (task.prRefs?.length ?? 0) > 0) && (
      <div className="flex flex-wrap items-center gap-1">
        {task.sourceMeetingId && (
          <span
            title={task.meetingTitle ?? undefined}
            className="inline-flex items-center gap-1 rounded-full bg-surface-container-low px-2 py-0.5 text-xs font-medium text-on-surface-variant"
          >
            <Video className="h-3 w-3" aria-hidden />
            Meeting
          </span>
        )}
        {task.prRefs && <PrRefChips refs={task.prRefs} />}
      </div>
    )}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-md text-on-surface-variant">
      <span className="inline-flex items-center gap-1">
        <User className="h-3.5 w-3.5" aria-hidden />
        {task.assigneeName ?? "Unassigned"}
      </span>
      {task.dueDate && (
        <span className="inline-flex items-center gap-1 font-mono text-label-mono">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {task.dueDate}
        </span>
      )}
      {task.commentCount !== undefined && (
        <span
          aria-label={`${task.commentCount} comments`}
          className="inline-flex items-center gap-1 font-mono text-label-mono"
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          {task.commentCount}
        </span>
      )}
      {task.quote && (
        <span
          title={quoteTooltip(task)}
          aria-label={`Quote: ${quoteTooltip(task)}`}
          className="inline-flex items-center gap-1 rounded-full bg-primary-container/15 px-2 py-0.5 text-label-caps uppercase tracking-wider text-primary-container"
        >
          <Quote className="h-3 w-3" aria-hidden />
          Quote
        </span>
      )}
    </div>
  </div>
);

export default TaskCard;
