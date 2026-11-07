/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import { TASK_STATUS_LABELS } from "@/lib/tasks";
import type { Task } from "@/lib/task-types";
import { PriorityBadge, PrRefChips } from "./task-visuals";

type Props = {
  tasks: Task[];
  showRestricted: boolean;
  onOpen: (taskId: string) => void;
};

const HEAD = "px-3 py-2 text-left text-label-caps uppercase tracking-wider text-on-surface-variant";
const CELL = "px-3 py-2 align-top text-body-md text-on-surface-variant";

// The Tasks tab's List view: the card's fields as a table (AC-70p). Viewers get
// no comment count or PR refs, so those columns are not shown to them.
const TasksList = ({ tasks, showRestricted, onOpen }: Props) => (
  <div className="overflow-x-auto rounded-lg border border-surface-variant bg-surface-container-lowest">
    <table className="w-full min-w-[48rem]">
      <thead className="border-b border-surface-variant">
        <tr>
          <th className={HEAD}>Task</th>
          <th className={HEAD}>Priority</th>
          <th className={HEAD}>Status</th>
          <th className={HEAD}>Assignee</th>
          <th className={HEAD}>Due</th>
          <th className={HEAD}>Meeting</th>
          {showRestricted && <th className={HEAD}>PRs</th>}
          {showRestricted && <th className={HEAD}>Comments</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-variant">
        {tasks.map((task) => (
          <tr key={task.id} onClick={() => onOpen(task.id)} className="cursor-pointer hover:bg-surface-container-low">
            <td className={CELL}>
              <button
                type="button"
                aria-label={`Open ${task.key}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(task.id);
                }}
                className="flex flex-col items-start text-left"
              >
                <span className="font-mono text-label-mono">{task.key}</span>
                <span className="break-words text-on-surface">{task.title}</span>
              </button>
            </td>
            <td className={CELL}>
              <PriorityBadge priority={task.priority} />
            </td>
            <td className={CELL}>{TASK_STATUS_LABELS[task.status]}</td>
            <td className={CELL}>{task.assigneeName ?? "Unassigned"}</td>
            <td className={`${CELL} font-mono`}>{task.dueDate ?? "None"}</td>
            <td className={CELL}>{task.sourceMeetingId ? (task.meetingTitle ?? "Meeting") : "None"}</td>
            {showRestricted && (
              <td className={CELL}>
                <div className="flex flex-wrap gap-1">
                  <PrRefChips refs={task.prRefs ?? []} />
                </div>
              </td>
            )}
            {showRestricted && <td className={`${CELL} font-mono`}>{task.commentCount ?? 0}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default TasksList;
