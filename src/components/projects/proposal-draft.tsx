/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_TITLE_MAX,
  isTaskPriority,
  type TaskPriority,
} from "@/lib/tasks";
import type { ProjectMember } from "@/lib/project-types";
import type { Proposal, ReviewProposalInput } from "@/lib/task-types";

export const inputClass =
  "rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none disabled:opacity-60";

export type Draft = { title: string; assigneeId: string; dueDate: string; priority: TaskPriority };

export const draftFor = (p: Proposal): Draft => ({
  title: p.title,
  assigneeId: p.proposedAssigneeId ?? "",
  dueDate: p.dueDate ?? "",
  // A person sets priority, never the AI (AC-70o).
  priority: "medium",
});

/** True when the row has a transcript line behind it. */
export const hasVerifiedQuote = (p: Proposal) => p.quoteVerified && !!p.quote;

export const confirmInput = (p: Proposal, draft: Draft): ReviewProposalInput => ({
  decision: "confirm",
  title: draft.title.trim(),
  assigneeId: draft.assigneeId || null,
  dueDate: draft.dueDate || null,
  ...(draft.priority === "medium" ? {} : { priority: draft.priority }),
  ...(p.quoteVerified ? {} : { confirmWithoutQuote: true }),
});

type FieldsProps = {
  draft: Draft;
  members: ProjectMember[];
  disabled: boolean;
  onChange: (draft: Draft) => void;
};

export const ProposalFields = ({ draft, members, disabled, onChange }: FieldsProps) => (
  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
    <label className="flex flex-col gap-1 text-body-md text-on-surface">
      Title
      <input
        value={draft.title}
        maxLength={TASK_TITLE_MAX}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        className={inputClass}
      />
    </label>
    <label className="flex flex-col gap-1 text-body-md text-on-surface">
      Assignee
      <select
        value={draft.assigneeId}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, assigneeId: e.target.value })}
        className={inputClass}
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
    <label className="flex flex-col gap-1 text-body-md text-on-surface">
      Priority
      <select
        value={draft.priority}
        disabled={disabled}
        onChange={(e) => {
          if (isTaskPriority(e.target.value)) onChange({ ...draft, priority: e.target.value });
        }}
        className={inputClass}
      >
        {TASK_PRIORITIES.map((value) => (
          <option key={value} value={value}>
            {TASK_PRIORITY_LABELS[value]}
          </option>
        ))}
      </select>
    </label>
    <label className="flex flex-col gap-1 text-body-md text-on-surface">
      Due date
      <input
        type="date"
        value={draft.dueDate}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, dueDate: e.target.value })}
        className={inputClass}
      />
    </label>
  </div>
);
