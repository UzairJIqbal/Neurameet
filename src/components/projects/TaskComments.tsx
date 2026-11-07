/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { ProjectClientError, addTaskComment, deleteTaskComment } from "@/lib/project-client";
import { TASK_COMMENT_MAX } from "@/lib/tasks";
import type { TaskComment } from "@/lib/task-types";

type Props = {
  taskId: string;
  comments: TaskComment[];
  truncated: boolean;
  /** Null until the member list loads. Only your own comments need it. */
  me: string | null;
  isManager: boolean;
  onAdded: (comment: TaskComment) => void;
  onRemoved: (commentId: string) => void;
};

const errorText = (err: unknown, fallback: string) =>
  err instanceof ProjectClientError ? err.message : fallback;

// Plain text only (AC-70r). The parent never renders this for a Viewer.
const TaskComments = ({ taskId, comments, truncated, me, isManager, onAdded, onRemoved }: Props) => {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const body = draft.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body) return;
    setSaving(true);
    try {
      const { comment } = await addTaskComment(taskId, body);
      onAdded(comment);
      setDraft("");
    } catch (err) {
      toast.error(errorText(err, "Failed to add the comment"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (commentId: string) => {
    try {
      await deleteTaskComment(taskId, commentId);
      onRemoved(commentId);
    } catch (err) {
      toast.error(errorText(err, "Failed to delete the comment"));
    }
  };

  return (
    <section aria-label="Comments" className="flex flex-col gap-3">
      <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">Comments</h3>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <textarea
          aria-label="Add a comment"
          dir="auto"
          rows={2}
          maxLength={TASK_COMMENT_MAX}
          placeholder="Add a comment"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving || !body}
          className="self-end rounded-lg bg-primary-container px-3 py-1.5 text-body-md text-on-primary hover:bg-primary disabled:opacity-50"
        >
          Comment
        </button>
      </form>
      {comments.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1 rounded-lg border border-surface-variant p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words text-body-md font-medium text-on-surface">
                  {comment.authorName}
                </span>
                {(isManager || comment.authorId === me) && (
                  <ConfirmDelete
                    size="sm"
                    label="Delete this comment"
                    onConfirm={() => remove(comment.id)}
                  />
                )}
              </div>
              <p dir="auto" className="whitespace-pre-wrap break-words text-body-md text-on-surface">
                {comment.body}
              </p>
              <span className="font-mono text-label-mono text-on-surface-variant">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
      {truncated && (
        <p className="text-body-md text-on-surface-variant">Showing the latest 50 comments.</p>
      )}
    </section>
  );
};

export default TaskComments;
