"use client";

import React, { useState } from "react";
import {
  Calendar,
  Video,
  Link,
  Clock,
  FileText,
  TrendingUp,
} from "lucide-react";
import { useGetCall } from "@/hooks/useGetCall";
import { Call } from "@stream-io/video-react-sdk";
import MeetingModel from "./MeetingModel";
import UploadTranscriptModal from "./UploadTranscriptModal";
import { ModalProvider } from "./ui/animated-modal";

/* ------------------------------------------------------------------ */
/*  Sparkline — tiny inline SVG chart                                  */
/* ------------------------------------------------------------------ */

const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 40;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-10 w-full"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline
        points={points}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

type StatCardProps = {
  label: string;
  value: string;
  trend: string;
  trendColor: string;
  sparkColor: string;
  sparkData: number[];
};

const StatCard = ({
  label,
  value,
  trend,
  trendColor,
  sparkColor,
  sparkData,
}: StatCardProps) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
    <p className="text-sm text-on-surface-variant">{label}</p>
    <p className="text-2xl font-bold text-on-surface">{value}</p>
    <Sparkline data={sparkData} color={sparkColor} />
    <div className="flex items-center gap-1">
      <TrendingUp className={`h-3.5 w-3.5 ${trendColor}`} />
      <span className={`text-xs ${trendColor}`}>{trend}</span>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Quick Action Card                                                  */
/* ------------------------------------------------------------------ */

type QuickActionCardProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
};

const QuickActionCard = ({
  icon,
  title,
  subtitle,
  onClick,
}: QuickActionCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 text-left transition-colors hover:bg-surface-container-low"
  >
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container/10">
      <span className="text-primary-container">{icon}</span>
    </div>
    <div>
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{subtitle}</p>
    </div>
  </button>
);

/* ------------------------------------------------------------------ */
/*  Upcoming Meeting Card                                              */
/* ------------------------------------------------------------------ */

const UpcomingMeetingCard = ({ call }: { call: Call | undefined }) => {
  const title =
    (call?.state.custom?.title as string | undefined) ?? "No upcoming meeting";
  const startsAt = call?.state.startsAt;
  const timeLabel = startsAt
    ? `${startsAt.toLocaleDateString("en-US", { weekday: "long" })} at ${startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : "—";

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 sm:flex-row sm:items-center sm:justify-between">
      {/* Left: icon + info */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container/10">
          <Calendar className="h-6 w-6 text-primary-container" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-bold text-on-surface">{title}</p>
          <p className="text-sm text-on-surface-variant">{timeLabel}</p>
        </div>
      </div>

      {/* Right: badges + CTA + participants */}
      <div className="flex flex-col items-start gap-3 sm:items-end">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-primary-container/10 px-3 py-1 text-xs font-medium text-primary-container">
            Team
          </span>
          <span className="flex items-center gap-1.5 text-xs text-green-1">
            <span className="h-2 w-2 rounded-full bg-green-1" />
            online
          </span>
        </div>

        <button
          type="button"
          className="rounded-xl bg-primary-container px-5 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
        >
          Join Meeting
        </button>

        <div className="flex items-center gap-2">
          {/* Stacked avatars */}
          <div className="flex -space-x-2">
            {["A", "B", "C"].map((initial, i) => (
              <div
                key={initial}
                style={{ zIndex: 3 - i }}
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface-container-lowest text-[10px] font-bold text-white ${
                  i === 0
                    ? "bg-primary-container"
                    : i === 1
                      ? "bg-secondary-container"
                      : "bg-green-1"
                }`}
              >
                {initial}
              </div>
            ))}
          </div>
          <span className="text-xs text-on-surface-variant">
            4 participants
          </span>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  DashboardContent — main export                                     */
/* ------------------------------------------------------------------ */

const DashboardContent = () => {
  const { upcomingCalls } = useGetCall();
  const nextMeeting = upcomingCalls?.[0];

  /* Modal state */
  const [meetingModalType, setMeetingModalType] = useState<
    "isInstantMeeting" | "isScheduleMeeting" | "isJoinMeeting" | null
  >(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  return (
    <ModalProvider>
      <section className="flex h-full w-full flex-col gap-6 overflow-y-auto overflow-x-hidden bg-surface">
        {/* ---- Welcome header ---- */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-on-surface sm:text-3xl">
            Welcome back, Uzair Iqbal!
          </h1>
          <p className="text-sm text-on-surface-variant">
            Here&apos;s what&apos;s happening with your meetings.
          </p>
        </div>

        {/* ---- Stats row ---- */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="This Month"
            value="12 Meetings"
            trend="+2 from last month"
            trendColor="text-green-1"
            sparkColor="#00C48C"
            sparkData={[4, 7, 5, 9, 8, 12]}
          />
          <StatCard
            label="Minutes Streamed"
            value="23 Hours"
            trend="+3 since yesterday"
            trendColor="text-blue-1"
            sparkColor="#0E78F9"
            sparkData={[10, 14, 12, 18, 20, 23]}
          />
          <StatCard
            label="This Week"
            value="5 Meetings"
            trend="+1 from yesterday"
            trendColor="text-purple-1"
            sparkColor="#830EF9"
            sparkData={[1, 2, 1, 3, 2, 5]}
          />
        </div>

        {/* ---- Upcoming meeting ---- */}
        <UpcomingMeetingCard call={nextMeeting} />

        {/* ---- Quick actions ---- */}
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-on-surface">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickActionCard
              icon={<Video className="h-5 w-5" />}
              title="New Meeting"
              subtitle="Start Instant"
              onClick={() => setMeetingModalType("isInstantMeeting")}
            />
            <QuickActionCard
              icon={<Link className="h-5 w-5" />}
              title="Join Meeting"
              subtitle="Enter Code"
              onClick={() => setMeetingModalType("isJoinMeeting")}
            />
            <QuickActionCard
              icon={<Clock className="h-5 w-5" />}
              title="Schedule"
              subtitle="Plan Ahead"
              onClick={() => setMeetingModalType("isScheduleMeeting")}
            />
            <QuickActionCard
              icon={<FileText className="h-5 w-5" />}
              title="Upload Transcript"
              subtitle="AI Insights"
              onClick={() => setShowUploadModal(true)}
            />
          </div>
        </div>
      </section>

      {/* ---- Modals ---- */}
      {meetingModalType && (
        <MeetingModel
          type={meetingModalType}
          onClose={() => setMeetingModalType(null)}
        />
      )}
      {showUploadModal && (
        <UploadTranscriptModal onClose={() => setShowUploadModal(false)} />
      )}
    </ModalProvider>
  );
};

export default DashboardContent;
