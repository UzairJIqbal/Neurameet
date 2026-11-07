/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskPriority, type TaskStatus } from "@/lib/tasks";
import type { TaskPrRef } from "@/lib/task-types";

const BADGE = "rounded-full px-2 py-0.5 text-xs font-medium";

const PRIORITY_CHIP: Record<TaskPriority, string> = {
  urgent: "bg-error-container text-on-error-container",
  high: "bg-warning-container text-on-warning-container",
  medium: "bg-primary-container/15 text-primary-container",
  low: "bg-secondary-container text-on-secondary-container",
};

export const PriorityBadge = ({ priority }: { priority: TaskPriority }) => (
  <span className={cn(BADGE, PRIORITY_CHIP[priority])}>{TASK_PRIORITY_LABELS[priority]}</span>
);

const STATUS_CHIP: Record<TaskStatus, string> = {
  todo: "bg-secondary-container text-on-secondary-container",
  in_progress: "bg-primary-container/15 text-primary-container",
  in_review: "bg-tertiary-container text-on-primary",
  completed: "bg-success-container text-on-success-container",
  blocked: "bg-error-container text-on-error-container",
};

export const TaskStatusChip = ({ status }: { status: TaskStatus }) => (
  <span className={cn(BADGE, "whitespace-nowrap", STATUS_CHIP[status])}>{TASK_STATUS_LABELS[status]}</span>
);

const prChip = (ref: TaskPrRef) => {
  if (ref.reverted) return "bg-error-container text-on-error-container";
  if (ref.state === "merged") return "bg-success-container text-on-success-container";
  return "bg-secondary-container text-on-secondary-container";
};

const prTitle = (ref: TaskPrRef) =>
  `${ref.repoFullName}#${ref.prNumber}, ${ref.reverted ? "reverted" : ref.state}`;

// Text, not links: these sit inside a card or row that opens the task on click.
export const PrRefChips = ({ refs }: { refs: TaskPrRef[] }) => (
  <>
    {refs.map((ref) => (
      <span
        key={`${ref.repoFullName}#${ref.prNumber}`}
        title={prTitle(ref)}
        aria-label={`Pull request ${prTitle(ref)}`}
        className={cn(BADGE, prChip(ref))}
      >
        #{ref.prNumber}
      </span>
    ))}
  </>
);
