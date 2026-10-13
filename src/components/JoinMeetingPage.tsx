/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Video, ArrowRight, Copy } from "lucide-react";
import { getMeetingIdFromLink } from "@/lib/utils";
import toast from "react-hot-toast";

const JoinMeetingPage = () => {
  const { user } = useUser();
  const router = useRouter();
  const [value, setValue] = useState("");

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const personalRoomLink = user?.id
    ? `${baseUrl}/meeting/${user.id}`
    : "";

  const handleJoin = () => {
    const meetingId = getMeetingIdFromLink(value.trim());
    if (!meetingId) {
      toast.error("Please enter a valid meeting code or link");
      return;
    }
    router.push(`/meeting/${meetingId}`);
  };

  const handleCopy = () => {
    if (!personalRoomLink) return;
    navigator.clipboard.writeText(personalRoomLink);
    toast("Personal room link copied");
  };

  return (
    <div className="flex flex-1 min-h-0 items-center justify-center">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] lg:p-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low text-primary-container">
            <Video size={28} />
          </div>
          <h2 className="mb-2 text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
            Join Meeting
          </h2>
          <p className="text-body-md font-body-md text-on-surface-variant">
            Enter meeting code or paste the meeting link to join the meeting.
          </p>
        </div>

        {/* Form */}
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin();
          }}
        >
          <div className="flex flex-col gap-2">
            <label
              className="text-label-caps font-label-caps uppercase tracking-wider text-on-surface"
              htmlFor="meeting-code"
            >
              Meeting Code or Link
            </label>
            <input
              id="meeting-code"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://meet.neurameet.com/abc-xyz"
              className="h-12 w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-4 text-body-md font-body-md text-on-surface placeholder:text-outline transition-all focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/20"
            />
          </div>
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary-container text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
          >
            <span>Join Meeting</span>
            <ArrowRight size={18} />
          </button>
        </form>

        {/* Divider */}
        <div className="my-2 h-px w-full bg-surface-variant" />

        {/* Personal Room */}
        <div className="flex flex-col gap-3">
          <h3 className="text-body-md font-body-md font-semibold text-on-surface">
            Your Personal Room
          </h3>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-surface-variant bg-surface-container-low p-3">
            <span className="truncate text-label-mono font-label-mono text-on-surface-variant">
              {personalRoomLink}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!personalRoomLink}
              className="flex shrink-0 items-center gap-1 text-label-caps font-label-caps font-bold uppercase text-primary-container transition-colors hover:text-primary disabled:opacity-50"
            >
              <Copy size={16} />
              <span>Copy Link</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinMeetingPage;
