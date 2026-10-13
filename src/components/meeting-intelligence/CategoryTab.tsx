/* eslint-disable prettier/prettier */
"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MeetingInsights,
  MEETING_CATEGORIES,
  type MeetingCategory,
} from "@/lib/meeting-types";
import { updateMeetingCategory } from "@/actions/meetings";
import toast from "react-hot-toast";
import TabEmptyState from "./EmptyState";

const CategoryTab = ({
  insights,
  meetingId,
}: {
  insights: MeetingInsights | null;
  meetingId: string;
}) => {
  const router = useRouter();
  const [selected, setSelected] = useState<MeetingCategory>(
    (insights?.category as MeetingCategory) ?? "General",
  );
  // The saved value, so the badge and Save button update even when the
  // parent's insights prop doesn't change after router.refresh().
  const [saved, setSaved] = useState<MeetingCategory | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!insights) {
    return <TabEmptyState message="No category available yet." />;
  }

  const current =
    saved ?? (insights.category as MeetingCategory) ?? "General";

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateMeetingCategory(meetingId, selected);
      if (res.ok) {
        setSaved(selected);
        toast.success("Category updated");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-headline-sm font-semibold text-on-surface">
          Category
        </h3>
        <span className="inline-flex w-fit items-center rounded-full bg-primary-container/15 px-3 py-1 text-label-caps uppercase tracking-wider text-primary-container">
          {current}
        </span>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-body-md text-on-surface-variant">
              Change category
            </span>
            <select
              value={selected}
              onChange={(e) =>
                setSelected(e.target.value as MeetingCategory)
              }
              className="rounded-md border border-outline-variant bg-surface px-3 py-2.5 text-body-md text-on-surface focus:border-primary-container focus:outline-none"
            >
              {MEETING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || selected === current}
            className="inline-flex items-center justify-center rounded-md bg-primary-container px-4 py-2.5 text-body-md text-on-primary transition-colors hover:bg-primary disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-headline-sm font-semibold text-on-surface">
          Detected Topics
        </h3>
        {insights.detectedTopics.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">
            No topics detected.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {insights.detectedTopics.map((t, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full bg-surface-container-low px-3 py-1 text-body-md text-on-surface-variant"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryTab;
