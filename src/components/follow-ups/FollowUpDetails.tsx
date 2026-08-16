/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ListChecks } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import toast from "react-hot-toast";
import { FollowUpDetail, FollowUpStatus } from "@/lib/meeting-types";
import { updateFollowUpStatus } from "@/actions/follow-ups";

const STATUS_OPTIONS: { value: FollowUpStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "completed", label: "Completed" },
];

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

const FollowUpDetails = ({ id }: { id: string }) => {
  const [followUp, setFollowUp] = useState<FollowUpDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/follow-ups/${id}`);

      if (res.status === 404) {
        setNotFound(true);
        setFollowUp(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = (await res.json()) as { followUp: FollowUpDetail };
      setFollowUp(data.followUp ?? null);
    } catch (err) {
      console.error("Failed to load follow-up:", err);
      toast.error("Failed to load follow-up");
      setFollowUp(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = (status: FollowUpStatus) => {
    if (status === followUp?.status) return;
    startTransition(async () => {
      const result = await updateFollowUpStatus(id, status);
      if (!result.ok) {
        toast.error(result.error || "Failed to update follow-up");
        return;
      }
      await load();
    });
  };

  if (isLoading) return <LoaderOne />;

  if (notFound || !followUp) {
    return (
      <section className="flex w-full flex-col gap-6 px-6 py-8">
        <Link
          href="/follow-ups"
          className="inline-flex w-fit items-center gap-2 text-body-md text-primary transition-colors hover:text-primary-container"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to follow-ups
        </Link>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <ListChecks className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            Follow-up not found.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <Link
        href="/follow-ups"
        className="inline-flex w-fit items-center gap-2 text-body-md text-primary transition-colors hover:text-primary-container"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to follow-ups
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          {followUp.actionTitle ?? "Untitled action item"}
        </h1>
        <p className="text-body-md text-on-surface-variant">
          {followUp.meetingTitle ?? "Unknown meeting"}
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-headline-sm font-semibold text-on-surface">
          Details
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-label-caps uppercase tracking-wider text-on-surface-variant">
              Assignee
            </dt>
            <dd className="text-body-md text-on-surface">
              {followUp.assignee ?? "Unassigned"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-label-caps uppercase tracking-wider text-on-surface-variant">
              Due date
            </dt>
            <dd className="text-body-md text-on-surface">
              {formatDate(followUp.dueDate)}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-label-caps uppercase tracking-wider text-on-surface-variant">
              Priority
            </dt>
            <dd className="text-body-md text-on-surface">
              {PRIORITY_LABELS[followUp.priority] ?? followUp.priority}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-label-caps uppercase tracking-wider text-on-surface-variant">
              Meeting started
            </dt>
            <dd className="text-body-md text-on-surface">
              {formatDateTime(followUp.meetingStartedAt)}
            </dd>
          </div>
          {followUp.notes && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="text-label-caps uppercase tracking-wider text-on-surface-variant">
                Notes
              </dt>
              <dd className="text-body-md text-on-surface">
                {followUp.notes}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-headline-sm font-semibold text-on-surface">
          Status
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STATUS_OPTIONS.map((option) => {
            const active = followUp.status === option.value;
            const isCompleted = option.value === "completed";
            return (
              <button
                key={option.value}
                type="button"
                disabled={isPending}
                onClick={() => handleStatusChange(option.value)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-body-md font-medium transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-primary-container text-on-primary hover:bg-primary"
                    : "border border-surface-variant bg-surface-container-lowest text-on-surface hover:border-primary hover:bg-surface-container-low"
                }`}
              >
                {isCompleted && <CheckCircle2 className="h-4 w-4" />}
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-body-md text-on-surface-variant">
          Last updated {formatDateTime(followUp.updatedAt)}
        </p>
      </div>
    </section>
  );
};

export default FollowUpDetails;
