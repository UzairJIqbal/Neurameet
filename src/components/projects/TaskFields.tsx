/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  isTaskPriority,
  isTaskStatus,
  type TaskStatus,
} from "@/lib/tasks";
import { isManagerRole, patchDenial } from "@/lib/task-rules";
import type { ProjectMember, ProjectRole } from "@/lib/project-types";
import type { Task, TaskPatchInput, TaskProofChain } from "@/lib/task-types";
import CompleteTaskDialog from "./CompleteTaskDialog";
import { PriorityBadge } from "./task-visuals";

export type DrawerAccess = {
  role: ProjectRole;
  me: string;
  members: ProjectMember[];
};

export type TaskSave = (patch: Omit<TaskPatchInput, "ifVersion">) => Promise<boolean>;

type Props = {
  task: Task;
  proofChain: TaskProofChain | null;
  /** Null until the member list loads, or when it can't: everything reads only. */
  access: DrawerAccess | null;
  saving: boolean;
  onSave: TaskSave;
};

const LABEL = "text-body-md text-on-surface-variant";
const VALUE = "text-body-md text-on-surface";
const INPUT =
  "w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none disabled:opacity-50";
const LINK_BUTTON = "text-body-md text-primary underline disabled:opacity-50";

const denied = (access: DrawerAccess | null, task: Task, patch: { status?: TaskStatus }) =>
  !access ||
  patchDenial(access.role, access.me, { status: task.status, assignee_id: task.assigneeId }, patch) !== null;

/** Who this person may pick. The route refuses anything else (AC-40). */
const assigneeOptions = (access: DrawerAccess, task: Task): Array<{ id: string; name: string }> => {
  const named = access.members.map((m) => ({
    id: m.userId,
    name: m.userId === access.me ? `${m.name} (you)` : m.name,
  }));
  const allowed = isManagerRole(access.role) ? named : named.filter((m) => m.id === access.me);
  const current = task.assigneeId;
  if (!current || allowed.some((m) => m.id === current)) return allowed;
  return [...allowed, { id: current, name: task.assigneeName ?? "Unknown member" }];
};

const Row = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) => (
  <>
    {htmlFor ? (
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
    ) : (
      <span className={LABEL}>{label}</span>
    )}
    <div className="min-w-0">{children}</div>
  </>
);

const DueDateField = ({ task, disabled, onSave }: { task: Task; disabled: boolean; onSave: TaskSave }) => {
  const saved = task.dueDate ?? "";
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);

  // On blur, because a typed date passes through valid values on the way.
  const commit = async () => {
    if (value === saved) return;
    if (!(await onSave({ dueDate: value || null }))) setValue(saved);
  };

  return (
    <input
      id="task-due"
      type="date"
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      className={INPUT}
    />
  );
};

const DescriptionSection = ({
  task,
  canEdit,
  saving,
  onSave,
}: {
  task: Task;
  canEdit: boolean;
  saving: boolean;
  onSave: TaskSave;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(task.description ?? "");
    setEditing(true);
  };

  const submit = async () => {
    if (await onSave({ description: draft.trim() || null })) setEditing(false);
  };

  return (
    <section aria-label="Description" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">Description</h3>
        {canEdit && !editing && (
          <button type="button" onClick={startEdit} className={LINK_BUTTON}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            aria-label="Description"
            dir="auto"
            rows={4}
            maxLength={TASK_DESCRIPTION_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={INPUT}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className={LINK_BUTTON}>
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-primary-container px-3 py-1.5 text-body-md text-on-primary hover:bg-primary disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p dir="auto" className={`whitespace-pre-wrap break-words ${task.description ? VALUE : LABEL}`}>
          {task.description || "No description yet."}
        </p>
      )}
    </section>
  );
};

// The drawer's editable fields (AC-70q). Each control follows the same role
// matrix the route enforces, and shows plain text when the change isn't allowed.
const TaskFields = ({ task, proofChain, access, saving, onSave }: Props) => {
  const [completing, setCompleting] = useState(false);

  const reopenOrComplete = task.status === "completed" ? "todo" : "completed";
  const statusLocked = denied(access, task, { status: reopenOrComplete });
  const fieldsLocked = denied(access, task, {});

  const changeStatus = (value: string) => {
    if (!isTaskStatus(value) || value === task.status) return;
    if (value === "completed") setCompleting(true);
    else void onSave({ status: value });
  };

  const changePriority = (value: string) => {
    if (isTaskPriority(value) && value !== task.priority) void onSave({ priority: value });
  };

  const confirmComplete = async (evidence: string) => {
    await onSave({ status: "completed", completionEvidence: evidence });
    setCompleting(false);
  };

  return (
    <>
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
        <Row label="Status" htmlFor={statusLocked ? undefined : "task-status"}>
          {statusLocked ? (
            <span className={VALUE}>{TASK_STATUS_LABELS[task.status]}</span>
          ) : (
            <select
              id="task-status"
              value={task.status}
              disabled={saving}
              onChange={(e) => changeStatus(e.target.value)}
              className={INPUT}
            >
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          )}
        </Row>
        <Row label="Assignee" htmlFor={fieldsLocked ? undefined : "task-assignee"}>
          {fieldsLocked || !access ? (
            <span className={VALUE}>{task.assigneeName ?? "Unassigned"}</span>
          ) : (
            <select
              id="task-assignee"
              value={task.assigneeId ?? ""}
              disabled={saving}
              onChange={(e) => void onSave({ assigneeId: e.target.value || null })}
              className={INPUT}
            >
              <option value="">Unassigned</option>
              {assigneeOptions(access, task).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          )}
        </Row>
        <Row label="Priority" htmlFor={fieldsLocked ? undefined : "task-priority"}>
          {fieldsLocked ? (
            <PriorityBadge priority={task.priority} />
          ) : (
            <select
              id="task-priority"
              value={task.priority}
              disabled={saving}
              onChange={(e) => changePriority(e.target.value)}
              className={INPUT}
            >
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {TASK_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          )}
        </Row>
        <Row label="Due date" htmlFor={fieldsLocked ? undefined : "task-due"}>
          {fieldsLocked ? (
            <span className={`${VALUE} font-mono`}>{task.dueDate ?? "None"}</span>
          ) : (
            <DueDateField task={task} disabled={saving} onSave={onSave} />
          )}
        </Row>
        <Row label="Created">
          <span className={VALUE}>{new Date(task.createdAt).toLocaleDateString()}</span>
        </Row>
        <Row label="Meeting source">
          {proofChain?.meetingId ? (
            <Link
              href={`/meeting-intelligence/${proofChain.meetingId}`}
              dir="auto"
              className="break-words text-body-md text-primary underline"
            >
              {proofChain.meetingTitle ?? "Open the meeting"}
            </Link>
          ) : (
            <span className={LABEL}>None</span>
          )}
        </Row>
      </div>

      <DescriptionSection task={task} canEdit={!fieldsLocked} saving={saving} onSave={onSave} />

      {completing && (
        <CompleteTaskDialog
          taskKey={task.key}
          busy={saving}
          onCancel={() => setCompleting(false)}
          onConfirm={confirmComplete}
        />
      )}
    </>
  );
};

export default TaskFields;
