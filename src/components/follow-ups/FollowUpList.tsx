/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import toast from "react-hot-toast";
import { FollowUpItem, FollowUpStatus } from "@/lib/meeting-types";

const STATUS_STYLES: Record<FollowUpStatus, string> = {
  pending: "bg-surface-container text-on-surface-variant",
  needs_attention: "bg-primary-container/15 text-primary-container",
  completed: "bg-primary-container text-on-primary",
};

const STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: "Pending",
  needs_attention: "Needs attention",
  completed: "Completed",
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : "No date";

const FollowUpList = () => {
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFollowUps = async () => {
      try {
        setIsLoading(true);
        const res = await fetch("/api/follow-ups");

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data = (await res.json()) as { followUps: FollowUpItem[] };
        setFollowUps(data.followUps ?? []);
      } catch (err) {
        console.error("Failed to load follow-ups:", err);
        toast.error("Failed to load follow-ups");
        setFollowUps([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFollowUps();
  }, []);

  if (isLoading) return <LoaderOne />;

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          Follow-ups
        </h1>
        <p className="text-body-md text-on-surface-variant">
          {followUps.length} follow-up{followUps.length === 1 ? "" : "s"}
        </p>
      </header>

      {followUps.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <ListChecks className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            No follow-ups yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-12 gap-4 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant">
            <div className="col-span-6 md:col-span-5">Action item</div>
            <div className="col-span-6 md:col-span-3">Meeting</div>
            <div className="col-span-6 md:col-span-2">Due</div>
            <div className="col-span-6 hidden text-right md:col-span-2 md:block">
              Open
            </div>
          </div>
          <div className="divide-y divide-surface-variant">
            {followUps.map((fu) => (
              <Link
                key={fu.id}
                href={`/follow-ups/${fu.id}`}
                className="grid grid-cols-12 items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-container-low"
              >
                <div className="col-span-6 flex flex-col gap-2 md:col-span-5">
                  <span className="break-words font-body-md font-medium text-on-surface">
                    {fu.actionTitle ?? "Untitled action item"}
                  </span>
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-label-caps uppercase tracking-wider ${STATUS_STYLES[fu.status]}`}
                  >
                    {STATUS_LABELS[fu.status]}
                  </span>
                </div>
                <div className="col-span-6 truncate text-body-md text-on-surface-variant md:col-span-3">
                  {fu.meetingTitle ?? "Unknown meeting"}
                </div>
                <div className="col-span-6 text-body-md text-on-surface-variant md:col-span-2">
                  {formatDate(fu.dueDate)}
                </div>
                <div className="col-span-6 md:col-span-2 md:text-right">
                  <span className="inline-flex items-center gap-2 rounded-lg border border-surface-variant px-4 py-2 text-body-md text-primary transition-colors hover:border-primary hover:bg-primary/5">
                    Open
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default FollowUpList;
