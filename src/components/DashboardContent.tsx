"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Plus,
  Video,
  Upload,
  Sparkles,
  CalendarDays,
  FileText,
  FolderPlus,
  GitPullRequest,
  ListChecks,
  ArrowRight,
} from "lucide-react";
import MeetingModel from "./MeetingModel";
import UploadTranscriptModal from "./UploadTranscriptModal";
import { ModalProvider } from "./ui/animated-modal";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import { MeetingListItem, FollowUpItem } from "@/lib/meeting-types";
import { fetchMyCounts, fetchNotifications } from "@/lib/notification-client";
import { listMyTasks, listProjects } from "@/lib/project-client";
import { isDueThisWeek } from "@/lib/my-tasks";
import { useCardLoad } from "@/components/projects/useCardLoad";
import CreateProjectDialog from "@/components/projects/CreateProjectDialog";
import TaskDrawer from "@/components/projects/TaskDrawer";
import {
  CardState,
  FocusTasksCard,
  MyProjectsSection,
  NotificationsCard,
  QuickActionsCard,
  SummaryChip,
  UpcomingMeetingCard,
  type QuickActionItem,
} from "@/components/shell/DashboardCards";
import toast from "react-hot-toast";

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

const loadRecentNotifications = (signal: AbortSignal) =>
  fetchNotifications({ signal });

const DashboardContent = () => {
  const router = useRouter();
  const { user } = useUser();

  /* Modal state */
  const [meetingModalType, setMeetingModalType] = useState<
    "isInstantMeeting" | "isScheduleMeeting" | "isJoinMeeting" | null
  >(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  // Live, user-scoped data (same sources as Meeting Intelligence / Follow-ups).
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  // Each card loads on its own, so one failed call blanks only that card.
  const counts = useCardLoad(fetchMyCounts);
  const tasks = useCardLoad(listMyTasks);
  const projects = useCardLoad(listProjects);
  const notifications = useCardLoad(loadRecentNotifications);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setIsLoading(true);
        setLoadFailed(false);
        const [meetingsRes, followUpsRes] = await Promise.all([
          fetch("/api/meetings"),
          fetch("/api/follow-ups"),
        ]);

        if (!meetingsRes.ok || !followUpsRes.ok) {
          throw new Error("Failed to load dashboard data");
        }

        const meetingsData = (await meetingsRes.json()) as {
          meetings: MeetingListItem[];
        };
        const followUpsData = (await followUpsRes.json()) as {
          followUps: FollowUpItem[];
        };

        setMeetings(meetingsData.meetings ?? []);
        setFollowUps(followUpsData.followUps ?? []);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        toast.error("Failed to load your meetings");
        setLoadFailed(true);
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
  const timeOfDay = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

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

  const visibleMeetings = meetings.slice(0, 3);
  const visibleFollowUps = followUps.slice(0, 3);

  const myTasks = tasks.data?.tasks ?? [];
  const today = tasks.data?.today ?? "";
  const openTasks =
    counts.data?.openTasks ??
    myTasks.filter((t) => t.status !== "completed").length;
  const dueThisWeek = myTasks.filter((t) => isDueThisWeek(t, today)).length;
  const upcomingCount = counts.data?.upcomingMeetings ?? 0;
  const prReviews = counts.data?.prReviews ?? 0;
  const projectCards = projects.data?.projects ?? [];
  const projectNames = new Map(projectCards.map((p) => [p.id, p.name]));
  const dateLine = new Date(
    today ? `${today}T12:00:00` : now,
  ).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const quickActions: QuickActionItem[] = [
    {
      title: "New Project",
      subtitle: "Start a workspace",
      icon: <FolderPlus className="h-6 w-6" />,
      onClick: () => setShowCreateProject(true),
    },
    {
      title: "New Meeting",
      subtitle: "Create a new meeting",
      icon: <Plus className="h-6 w-6" />,
      onClick: () => setMeetingModalType("isInstantMeeting"),
    },
    {
      title: "AI Assistant",
      subtitle: "Ask about your meetings",
      icon: <Sparkles className="h-6 w-6" />,
      href: "/ai-chat",
    },
    {
      title: "Review PRs",
      subtitle: `${prReviews} waiting for you`,
      icon: <GitPullRequest className="h-6 w-6" />,
      href: "/notifications?filter=github",
    },
  ];

  return (
    <ModalProvider>
      <section className="flex min-h-screen flex-col bg-surface">
        {/* ---- Greeting ---- */}
        <header className="flex flex-wrap items-start justify-between gap-4 bg-surface px-6 py-4 sm:px-10">
          <div>
            <p className="text-body-md text-on-surface-variant">{dateLine}</p>
            <h2 className="text-display-lg font-bold text-on-surface">
              Good {timeOfDay}, {firstName}! 👋
            </h2>
            <p className="mt-1 text-body-md text-on-surface-variant">
              You have {meetingsToday} meeting
              {meetingsToday === 1 ? "" : "s"} today and {openFollowUps}{" "}
              follow-up
              {openFollowUps === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SummaryChip value={openTasks} label="open tasks" />
            <SummaryChip value={dueThisWeek} label="due this week" />
            <SummaryChip value={upcomingCount} label="upcoming meetings" />
          </div>
        </header>

        {/* ---- Content ---- */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <UpcomingMeetingCard
              meetings={meetings}
              projectNames={projectNames}
              now={now}
            />
            <QuickActionsCard actions={quickActions} />
            <CardState
              isLoading={notifications.isLoading && !notifications.data}
              failed={notifications.failed && !notifications.data}
              retry={notifications.retry}
              message="We could not load your notifications."
            >
              <NotificationsCard items={notifications.data?.items ?? []} />
            </CardState>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/join-meeting")}
              className="inline-flex items-center gap-2 rounded-full border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low"
            >
              <Video className="h-4 w-4" /> Join Meeting
            </button>
            <button
              type="button"
              onClick={() => setMeetingModalType("isScheduleMeeting")}
              className="inline-flex items-center gap-2 rounded-full border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low"
            >
              <CalendarDays className="h-4 w-4" /> Schedule Meeting
            </button>
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 rounded-full border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low"
            >
              <Upload className="h-4 w-4" /> Upload Transcript
            </button>
          </div>

          <div className="mt-10 flex flex-col gap-5">
            <CardState
              isLoading={projects.isLoading && !projects.data}
              failed={projects.failed && !projects.data}
              retry={projects.retry}
              message="We could not load your projects."
            >
              <MyProjectsSection projects={projectCards} />
            </CardState>
            <CardState
              isLoading={tasks.isLoading && !tasks.data}
              failed={tasks.failed && !tasks.data}
              retry={tasks.retry}
              message="We could not load your tasks."
            >
              <FocusTasksCard
                tasks={myTasks
                  .filter((t) => t.status !== "completed")
                  .slice(0, 5)}
                today={today}
                onOpen={setOpenTaskId}
              />
            </CardState>
          </div>

          {/* Meeting Intelligence + Follow-ups */}
          <div className="mt-10 grid grid-cols-1 gap-10">
            {/* Meeting Intelligence */}
            <div className="flex flex-col gap-5">
              <div className="flex items-end justify-between">
                <h3 className="text-headline-sm font-semibold text-on-surface">
                  Meeting Intelligence
                </h3>
                <Link
                  href="/meeting-intelligence"
                  className="flex items-center gap-1 text-body-md text-primary-container hover:underline"
                >
                  View All <ArrowRight className="text-sm" />
                </Link>
              </div>

              <div className="card-shadow flex-1 overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest">
                <div className="grid grid-cols-12 border-b border-surface-variant bg-surface-container-low px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant">
                  <div className="col-span-6 md:col-span-5">Meeting Title</div>
                  <div className="col-span-6 md:col-span-3">Date</div>
                  <div className="col-span-12 hidden text-right md:col-span-4 md:block">
                    Action
                  </div>
                </div>
                <div className="divide-y divide-surface-variant min-h-[12rem]">
                  {timedOut || loadFailed ? (
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
                        className="rounded-full bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
                      >
                        Upload Transcript
                      </button>
                    </div>
                  ) : (
                    visibleMeetings.map((m) => (
                      <div
                        key={m.id}
                        className="grid grid-cols-12 items-center px-6 py-5 transition-colors hover:bg-surface-container-low/50"
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
                            className="rounded-full border border-primary-container/30 px-4 py-2 text-sm font-medium text-primary-container transition-colors hover:bg-primary-container/5"
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
            <div className="flex flex-col gap-5">
              <div className="flex items-end justify-between">
                <h3 className="text-headline-sm font-semibold text-on-surface">
                  Meeting Follow-ups
                </h3>
                <Link
                  href="/follow-ups"
                  className="flex items-center gap-1 text-body-md text-primary-container hover:underline"
                >
                  View All <ArrowRight className="text-sm" />
                </Link>
              </div>

              <div className="card-shadow flex-1 overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest">
                <div className="grid grid-cols-12 border-b border-surface-variant bg-surface-container-low px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant">
                  <div className="col-span-6 md:col-span-5">Action Item</div>
                  <div className="col-span-6 md:col-span-3">Due</div>
                  <div className="col-span-12 hidden text-right md:col-span-4 md:block">
                    Action
                  </div>
                </div>
                <div className="divide-y divide-surface-variant min-h-[12rem]">
                  {timedOut || loadFailed ? (
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
                  ) : (
                    visibleFollowUps.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-12 items-center px-6 py-5 transition-colors hover:bg-surface-container-low/50"
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
                            className="rounded-full border border-primary-container/30 px-4 py-2 text-sm font-medium text-primary-container transition-colors hover:bg-primary-container/5"
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
      {showCreateProject && (
        <CreateProjectDialog
          onClose={() => setShowCreateProject(false)}
          onCreated={(project) => router.push(`/projects/${project.id}`)}
        />
      )}
      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onChanged={tasks.retry}
        />
      )}
    </ModalProvider>
  );
};

export default DashboardContent;
