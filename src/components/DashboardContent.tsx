"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Plus,
  Video,
  Upload,
  Search,
  X,
  Bell,
  Sparkles,
  CalendarDays,
  FileText,
  ListChecks,
  ArrowRight,
} from "lucide-react";
import MeetingModel from "./MeetingModel";
import UploadTranscriptModal from "./UploadTranscriptModal";
import { ModalProvider } from "./ui/animated-modal";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import { MeetingListItem, FollowUpItem } from "@/lib/meeting-types";
import toast from "react-hot-toast";

/* ------------------------------------------------------------------ */
/*  Quick Action Card                                                  */
/* ------------------------------------------------------------------ */

type QuickAction = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconWrap: string;
  onClick: () => void;
};

const QuickActionCard = ({
  title,
  subtitle,
  icon,
  iconWrap,
  onClick,
}: QuickAction) => (
  <button
    type="button"
    onClick={onClick}
    className="card-shadow flex flex-col items-center justify-center gap-2 rounded-xl border border-surface-variant bg-surface-container-lowest p-4 transition-all hover:border-primary-container hover:shadow-md"
  >
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-full ${iconWrap}`}
    >
      {icon}
    </div>
    <span className="text-body-md font-bold text-on-surface">{title}</span>
    <span className="text-xs text-on-surface-variant">{subtitle}</span>
  </button>
);

/* ------------------------------------------------------------------ */
/*  Skeleton rows — fixed size, no layout shift                        */
/* ------------------------------------------------------------------ */

const SkeletonBlock = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-surface-container ${className}`} />
);

// Matches a Meeting Intelligence row (icon chip + title / date / Open Insights).
const MeetingRowSkeleton = () => (
  <div className="grid grid-cols-12 items-center px-6 py-4">
    <div className="col-span-6 flex items-center gap-3 md:col-span-5">
      <SkeletonBlock className="h-8 w-8" />
      <SkeletonBlock className="h-4 w-40" />
    </div>
    <div className="col-span-3">
      <SkeletonBlock className="h-4 w-20" />
    </div>
    <div className="col-span-3 flex justify-end">
      <SkeletonBlock className="h-8 w-24 rounded-lg" />
    </div>
  </div>
);

// Matches a Follow-up row (icon chip + two line label / due / Open).
const FollowUpRowSkeleton = () => (
  <div className="grid grid-cols-12 items-center px-6 py-4">
    <div className="col-span-6 flex items-center gap-3 md:col-span-5">
      <SkeletonBlock className="h-8 w-8 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-3 w-28" />
      </div>
    </div>
    <div className="col-span-3">
      <SkeletonBlock className="h-4 w-20" />
    </div>
    <div className="col-span-3 flex justify-end">
      <SkeletonBlock className="h-8 w-16 rounded-lg" />
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  DashboardContent — main export                                     */
/* ------------------------------------------------------------------ */

const DashboardContent = () => {
  const router = useRouter();
  const { user } = useUser();

  /* Modal state */
  const [meetingModalType, setMeetingModalType] = useState<
    "isInstantMeeting" | "isScheduleMeeting" | "isJoinMeeting" | null
  >(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Live, user-scoped data (same sources as Meeting Intelligence / Follow-ups).
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });
  const [query, setQuery] = useState("");

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setIsLoading(true);
        const [meetingsRes, followUpsRes] = await Promise.all([
          fetch("/api/meetings"),
          fetch("/api/follow-ups"),
        ]);

        if (!meetingsRes.ok || !followUpsRes.ok) {
          throw new Error("Failed to load dashboard data");
        }

        const meetingsData =
          (await meetingsRes.json()) as { meetings: MeetingListItem[] };
        const followUpsData =
          (await followUpsRes.json()) as { followUps: FollowUpItem[] };

        setMeetings(meetingsData.meetings ?? []);
        setFollowUps(followUpsData.followUps ?? []);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        toast.error("Failed to load your meetings");
        setMeetings([]);
        setFollowUps([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [retryNonce]);

  // Greeting + live summary counts derived from the fetched data.
  const firstName = user?.firstName ?? "there";
  const hour = new Date().getHours();
  const timeOfDay =
    hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  const isToday = (value: string | null) => {
    if (!value) return false;
    const d = new Date(value);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };

  const meetingsToday = meetings.filter((m) =>
    isToday(m.startedAt ?? m.createdAt),
  ).length;
  const openFollowUps = followUps.filter(
    (f) => f.status !== "completed",
  ).length;

  // Live, client-side search over the already-fetched dashboard data.
  const q = query.trim().toLowerCase();
  const filteredMeetings = q
    ? meetings.filter((m) => m.title.toLowerCase().includes(q))
    : meetings;
  const filteredFollowUps = q
    ? followUps.filter((f) =>
        `${f.actionTitle ?? ""} ${f.meetingTitle ?? ""}`
          .toLowerCase()
          .includes(q),
      )
    : followUps;
  const visibleMeetings = q ? filteredMeetings : meetings.slice(0, 3);
  const visibleFollowUps = q ? filteredFollowUps : followUps.slice(0, 3);

  const quickActions: QuickAction[] = [
    {
      title: "New Meeting",
      subtitle: "Create a new meeting",
      icon: <Plus className="h-6 w-6" />,
      iconWrap: "bg-primary-container/10 text-primary-container",
      onClick: () => setMeetingModalType("isInstantMeeting"),
    },
    {
      title: "Join Meeting",
      subtitle: "Join with a code",
      icon: <Video className="h-6 w-6" />,
      iconWrap: "bg-secondary-container/30 text-secondary",
      onClick: () => router.push("/join-meeting"),
    },
    {
      title: "Upload Transcript",
      subtitle: "Analyze transcript",
      icon: <Upload className="h-6 w-6" />,
      iconWrap: "bg-tertiary-container/30 text-tertiary",
      onClick: () => setShowUploadModal(true),
    },
    {
      title: "Schedule Meeting",
      subtitle: "Plan a meeting",
      icon: <CalendarDays className="h-6 w-6" />,
      iconWrap: "bg-tertiary-container/30 text-tertiary",
      onClick: () => setMeetingModalType("isScheduleMeeting"),
    },
  ];

  return (
    <ModalProvider>
      <section className="flex min-h-screen flex-col bg-surface">
        {/* ---- TopAppBar ---- */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 bg-surface px-6 py-4 sm:px-10">
          <div>
            <h2 className="text-display-lg font-bold text-on-surface">
              Good {timeOfDay}, {firstName}! 👋
            </h2>
            <p className="mt-1 text-body-md text-on-surface-variant">
              You have {meetingsToday} meeting
              {meetingsToday === 1 ? "" : "s"} today and {openFollowUps} follow-up
              {openFollowUps === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-outline" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search anything..."
                aria-label="Search meetings and follow-ups"
                className="w-64 rounded-full border border-surface-variant bg-surface-container-low py-2 pl-9 pr-9 text-body-md text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-on-surface"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => router.push("/ai-chat")}
              className="flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-label-caps text-on-primary transition-colors hover:bg-primary"
            >
              <Sparkles className="h-4 w-4" />
              Ask NeuraMeet AI
            </button>
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-low"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error" />
            </button>
          </div>
        </header>

        {/* ---- Content ---- */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          {/* Mobile search entry (hidden on sm+, the header search covers that) */}
          <div className="relative mb-6 sm:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-outline" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search meetings & follow-ups"
              aria-label="Search meetings and follow-ups"
              className="w-full rounded-full border border-surface-variant bg-surface-container-low py-2 pl-9 pr-9 text-body-md text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-on-surface"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Actions */}
          <h3 className="mb-4 text-headline-sm font-semibold text-on-surface">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => (
              <QuickActionCard key={action.title} {...action} />
            ))}
          </div>

          {/* Meeting Intelligence + Follow-ups */}
          <div className="mt-8 grid grid-cols-1 gap-8">
            {/* Meeting Intelligence */}
            <div className="flex flex-col gap-4">
              <div className="flex items-end justify-between">
                <h3 className="text-headline-sm font-semibold text-on-surface">
                  Meeting Intelligence
                </h3>
                {!q && (
                  <Link
                    href="/meeting-intelligence"
                    className="flex items-center gap-1 text-body-md text-primary-container hover:underline"
                  >
                    View All <ArrowRight className="text-sm" />
                  </Link>
                )}
              </div>

              <div className="card-shadow flex-1 overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest">
                <div className="grid grid-cols-12 border-b border-surface-variant bg-surface-container-low px-6 py-3 text-label-caps uppercase tracking-wider text-on-surface-variant">
                  <div className="col-span-6 md:col-span-5">Meeting Title</div>
                  <div className="col-span-6 md:col-span-3">Date</div>
                  <div className="col-span-12 hidden text-right md:col-span-4 md:block">Action</div>
                </div>
                <div className="divide-y divide-surface-variant min-h-[12rem]">
                  {timedOut ? (
                    <LoadError
                      message="We couldn't load your meetings."
                      onRetry={() => setRetryNonce((k) => k + 1)}
                    />
                  ) : isLoading ? (
                    <>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <MeetingRowSkeleton key={i} />
                      ))}
                    </>
                  ) : meetings.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                      <FileText className="h-8 w-8 text-on-surface-variant" />
                      <p className="text-body-md text-on-surface-variant">
                        No meetings yet.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowUploadModal(true)}
                        className="rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
                      >
                        Upload Transcript
                      </button>
                    </div>
                  ) : q && filteredMeetings.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                      <Search className="h-8 w-8 text-on-surface-variant" />
                      <p className="text-body-md text-on-surface-variant">
                        No results for &ldquo;{query.trim()}&rdquo;.
                      </p>
                    </div>
                  ) : (
                    visibleMeetings.map((m) => (
                      <div
                        key={m.id}
                        className="grid grid-cols-12 items-center px-6 py-4 transition-colors hover:bg-surface-container-low/50"
                      >
                        <div className="col-span-6 flex items-center gap-3 md:col-span-5">
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-container text-primary">
                            <FileText className="h-4 w-4" />
                          </div>
                          <span className="truncate text-body-md font-bold text-on-surface">
                            {m.title}
                          </span>
                        </div>
                        <div className="col-span-6 md:col-span-3 text-body-md text-on-surface-variant">
                          {m.startedAt || m.createdAt
                            ? new Date(
                                m.startedAt ?? m.createdAt,
                              ).toLocaleDateString()
                            : "—"}
                        </div>
                        <div className="col-span-12 mt-2 flex flex-wrap justify-end gap-2 md:col-span-4 md:mt-0 md:flex-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/meeting-intelligence/${m.id}`)
                            }
                            className="rounded-lg border border-primary-container/30 px-3 py-1.5 text-sm font-medium text-primary-container transition-colors hover:bg-primary-container/5"
                          >
                            Open Insights
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Meeting Follow-ups */}
            <div className="flex flex-col gap-4">
              <div className="flex items-end justify-between">
                <h3 className="text-headline-sm font-semibold text-on-surface">
                  Meeting Follow-ups
                </h3>
                {!q && (
                  <Link
                    href="/follow-ups"
                    className="flex items-center gap-1 text-body-md text-primary-container hover:underline"
                  >
                    View All <ArrowRight className="text-sm" />
                  </Link>
                )}
              </div>

              <div className="card-shadow flex-1 overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest">
                <div className="grid grid-cols-12 border-b border-surface-variant bg-surface-container-low px-6 py-3 text-label-caps uppercase tracking-wider text-on-surface-variant">
                  <div className="col-span-6 md:col-span-5">Action Item</div>
                  <div className="col-span-6 md:col-span-3">Due</div>
                  <div className="col-span-12 hidden text-right md:col-span-4 md:block">Action</div>
                </div>
                <div className="divide-y divide-surface-variant min-h-[12rem]">
                  {timedOut ? (
                    <LoadError
                      message="We couldn't load your follow-ups."
                      onRetry={() => setRetryNonce((k) => k + 1)}
                    />
                  ) : isLoading ? (
                    <>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <FollowUpRowSkeleton key={i} />
                      ))}
                    </>
                  ) : followUps.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                      <ListChecks className="h-8 w-8 text-on-surface-variant" />
                      <p className="text-body-md text-on-surface-variant">
                        No follow-ups yet.
                      </p>
                    </div>
                  ) : q && filteredFollowUps.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                      <Search className="h-8 w-8 text-on-surface-variant" />
                      <p className="text-body-md text-on-surface-variant">
                        No results for &ldquo;{query.trim()}&rdquo;.
                      </p>
                    </div>
                  ) : (
                    visibleFollowUps.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-12 items-center px-6 py-4 transition-colors hover:bg-surface-container-low/50"
                      >
                        <div className="col-span-6 flex items-center gap-3 md:col-span-5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-container text-primary">
                            <ListChecks className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-body-md font-bold text-on-surface">
                              {item.actionTitle ?? "Untitled action item"}
                            </span>
                            <span className="block truncate text-xs text-on-surface-variant">
                              {item.meetingTitle ?? "Unknown meeting"}
                            </span>
                          </div>
                        </div>
                        <div className="col-span-6 md:col-span-3 text-body-md text-on-surface-variant">
                          {item.dueDate
                            ? new Date(item.dueDate).toLocaleDateString()
                            : "No date"}
                        </div>
                        <div className="col-span-12 mt-2 flex flex-wrap justify-end gap-2 md:col-span-4 md:mt-0 md:flex-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/follow-ups/${item.id}`)
                            }
                            className="rounded-lg border border-primary-container/30 px-3 py-1.5 text-sm font-medium text-primary-container transition-colors hover:bg-primary-container/5"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
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
