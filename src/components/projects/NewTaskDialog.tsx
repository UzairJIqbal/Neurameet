/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { createTask, updateTask } from "@/lib/project-client";
import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TITLE_MAX,
  isTaskPriority,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks";
import type { ProjectMember } from "@/lib/project-types";
import type { Task } from "@/lib/task-types";

type Props = {
  projectId: string;
  members: ProjectMember[];
  /** Set by a column's `+`. The task is created, then moved here. */
  initialStatus?: TaskStatus;
  onClose: () => void;
  onCreated: (task: Task) => void;
};

const inputClass =
  "w-full rounded-xl border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";
const primaryButton =
  "rounded-full bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";

// Developer or higher: a task by hand, with the next key (AC-38).
const NewTaskDialog = ({
  projectId,
  members,
  initialStatus = "todo",
  onClose,
  onCreated,
}: Props) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // AC-70p: the move runs under the same rules as a drag, so it can be refused.
  const moveToColumn = async (task: Task): Promise<Task> => {
    if (initialStatus === "todo") return task;
    try {
      const moved = await updateTask(task.id, {
        status: initialStatus,
        ifVersion: task.version,
      });
      return moved.task;
    } catch (err) {
      console.error("Failed to move the new task:", err);
      toast.error(`${task.key} was created in ${TASK_STATUS_LABELS.todo}`);
      return task;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { task } = await createTask(projectId, {
        title: title.trim(),
        description: description.trim() || null,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
        priority,
      });
      toast.success(`${task.key} created`);
      onCreated(await moveToColumn(task));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create the task",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-5 rounded-card bg-surface-container-lowest p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 id="new-task-title" className="text-headline-sm text-on-surface">
            Add Task
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-low"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-body-md text-on-surface">
          Title
          <input
            required
            maxLength={TASK_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-body-md text-on-surface">
          Description
          <textarea
            rows={3}
            maxLength={TASK_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-body-md text-on-surface">
          Assignee
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
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
            value={priority}
            onChange={(e) => {
              if (isTaskPriority(e.target.value)) setPriority(e.target.value);
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
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && (
          <p role="alert" className="text-body-md text-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || title.trim().length === 0}
          className={primaryButton}
        >
          {busy ? "Creating..." : "Create task"}
        </button>
      </form>
    </div>
  );
};

export default NewTaskDialog;
