"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { LoadError } from "@/components/ui/load-error";
import { cn } from "@/lib/utils";
import {
  notificationAge,
  type NotificationItem,
} from "@/lib/notification-client";
import { MEETING_TYPE_LABELS, type MeetingListItem } from "@/lib/meeting-types";
import type { ProjectCard } from "@/lib/project-types";
import type { MyTask } from "@/lib/task-types";
import { dueLabel, isOverdue } from "@/lib/my-tasks";
import { TaskStatusChip } from "@/components/projects/task-visuals";
import {
  AvatarStack,
  ProjectIconTile,
} from "@/components/projects/project-visuals";

export const CARD =
  "rounded-lg border border-surface-variant bg-surface-container-lowest p-4";
const VIEW_ALL =
  "flex items-center gap-1 text-body-md text-primary-container hover:underline";

export const CardHeading = ({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) => (
  <div className="mb-3 flex items-center justify-between gap-2">
    <h3 className="text-headline-sm font-semibold text-on-surface">{title}</h3>
    {href && (
      <Link href={href} className={VIEW_ALL}>
        {linkLabel ?? "View all"} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    )}
  </div>
);

export const CardState = ({
  isLoading,
  failed,
  retry,
  message,
  children,
}: {
  isLoading: boolean;
  failed: boolean;
  retry: () => void;
  message: string;
  children: React.ReactNode;
}) =>
  failed ? (
    <LoadError compact message={message} onRetry={retry} />
  ) : isLoading ? (
    <p className="text-body-md text-on-surface-variant">Loading...</p>
  ) : (
    <>{children}</>
  );

const startOf = (m: MeetingListItem) =>
  m.startedAt ? new Date(m.startedAt).getTime() : Number.MAX_SAFE_INTEGER;

/** Earliest future scheduled rows first. A missed one is never the "next" meeting (AC-77b). */
export const nextMeetings = (
  meetings: MeetingListItem[],
  now: number,
): MeetingListItem[] =>
  meetings
    .filter((m) => m.status === "scheduled" && m.startedAt && startOf(m) >= now)
    .sort((a, b) => startOf(a) - startOf(b));

const startsIn = (iso: string, now: number): string => {
  const minutes = Math.max(
    0,
    Math.round((new Date(iso).getTime() - now) / 60000),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const UpcomingMeetingCard = ({
  meetings,
  projectNames,
  now,
}: {
  meetings: MeetingListItem[];
  projectNames: Map<string, string>;
  now: number;
}) => {
  const upcoming = nextMeetings(meetings, now);
  const [next, ...rest] = upcoming;
  return (
    <div className={CARD}>
      <CardHeading
        title="Upcoming Meeting"
        href="/meeting-intelligence"
        linkLabel="View all meetings"
      />
      {!next ? (
        <p className="text-body-md text-on-surface-variant">
          No upcoming meetings. Schedule one to see it here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-surface-variant bg-surface-container-low p-3">
            <div className="flex flex-wrap items-center gap-2">
              {next.meetingType && (
                <span className="rounded-full bg-primary-container/15 px-2 py-0.5 text-xs font-medium text-primary-container">
                  {MEETING_TYPE_LABELS[next.meetingType] ?? next.meetingType}
                </span>
              )}
              <span className="rounded-full bg-secondary-container px-2 py-0.5 text-xs font-medium text-on-secondary-container">
                Starts in {startsIn(next.startedAt as string, now)}
              </span>
            </div>
            <p className="mt-2 text-headline-sm font-semibold text-on-surface">
              {next.title}
            </p>
            {next.projectId && projectNames.get(next.projectId) && (
              <p className="text-body-md text-on-surface-variant">
                {projectNames.get(next.projectId)}
              </p>
            )}
            <p className="mt-1 text-body-md text-on-surface-variant">
              {when(next.startedAt as string)}
            </p>
            {next.invitedUserIds && next.invitedUserIds.length > 0 && (
              <p className="text-body-md text-on-surface-variant">
                {next.invitedUserIds.length} invited
              </p>
            )}
            {next.streamCallId && (
              <Link
                href={`/meeting/${next.streamCallId}`}
                className="mt-3 inline-flex rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary"
              >
                Join
              </Link>
            )}
          </div>
          {rest.slice(0, 2).map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 text-body-md"
            >
              <span className="min-w-0 truncate text-on-surface">
                {m.title}
              </span>
              <span className="shrink-0 text-on-surface-variant">
                {when(m.startedAt as string)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export type QuickActionItem = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
};

const ACTION_CLASS =
  "flex flex-col items-start gap-1 rounded-lg border border-surface-variant bg-surface-container-lowest p-3 text-left transition-colors hover:border-primary-container";

export const QuickActionsCard = ({
  actions,
}: {
  actions: QuickActionItem[];
}) => (
  <div className={CARD}>
    <h3 className="mb-3 text-headline-sm font-semibold text-on-surface">
      Quick Actions
    </h3>
    <div className="grid grid-cols-2 gap-3">
      {actions.map((a) => {
        const body = (
          <>
            <span className="text-primary-container">{a.icon}</span>
            <span className="text-body-md font-semibold text-on-surface">
              {a.title}
            </span>
            <span className="text-xs text-on-surface-variant">
              {a.subtitle}
            </span>
          </>
        );
        return a.href ? (
          <Link key={a.title} href={a.href} className={ACTION_CLASS}>
            {body}
          </Link>
        ) : (
          <button
            key={a.title}
            type="button"
            onClick={a.onClick}
            className={ACTION_CLASS}
          >
            {body}
          </button>
        );
      })}
    </div>
  </div>
);

export const NotificationsCard = ({ items }: { items: NotificationItem[] }) => (
  <div className={CARD}>
    <CardHeading title="Notifications" href="/notifications" />
    {items.length === 0 ? (
      <p className="text-body-md text-on-surface-variant">
        You are all caught up.
      </p>
    ) : (
      <ul className="flex flex-col gap-3">
        {items.slice(0, 6).map((n) => (
          <li key={n.id}>
            <Link
              href={n.link}
              className="flex items-start justify-between gap-2 hover:underline"
            >
              <span className="min-w-0">
                <span className="block truncate text-body-md text-on-surface">
                  {n.title}
                </span>
                <span className="block truncate text-xs text-on-surface-variant">
                  {n.body}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-on-surface-variant">
                {notificationAge(n.createdAt)}
                {!n.readAt && (
                  <span
                    className="h-2 w-2 rounded-full bg-primary-container"
                    aria-label="Unread"
                  />
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const percent = (p: ProjectCard) =>
  p.taskTotal === 0 ? 0 : Math.round((p.taskCompleted / p.taskTotal) * 100);

export const MyProjectsSection = ({
  projects,
}: {
  projects: ProjectCard[];
}) => (
  <div>
    <CardHeading
      title={`My Projects ${projects.length}`}
      href="/projects"
      linkLabel="View all projects"
    />
    {projects.length === 0 ? (
      <p className={cn(CARD, "text-body-md text-on-surface-variant")}>
        You are not in a project yet. Create one to get started.
      </p>
    ) : (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {projects.slice(0, 4).map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className={cn(
              CARD,
              "flex flex-col gap-2 hover:border-primary-container",
            )}
          >
            <div className="flex items-center gap-3">
              <ProjectIconTile icon={p.icon} color={p.color} />
              <span className="min-w-0 truncate text-body-lg font-semibold text-on-surface">
                {p.name}
              </span>
            </div>
            {p.description && (
              <p className="line-clamp-2 text-body-md text-on-surface-variant">
                {p.description}
              </p>
            )}
            <p className="flex min-w-0 items-center gap-2 text-body-md text-on-surface-variant">
              <Github className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">
                {p.repo.connected
                  ? (p.repo.name ?? "Repository connected")
                  : "No repository"}
              </span>
            </p>
            <div className="flex items-center justify-between text-body-md text-on-surface-variant">
              <span>
                {p.taskCompleted} of {p.taskTotal} tasks complete
              </span>
              <span>{percent(p)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-container">
              <div
                className="h-full rounded-full bg-primary-container"
                style={{ width: `${percent(p)}%` }}
              />
            </div>
            <AvatarStack avatars={p.avatars} total={p.memberCount} />
          </Link>
        ))}
      </div>
    )}
  </div>
);

export const FocusTasksCard = ({
  tasks,
  today,
  onOpen,
}: {
  tasks: MyTask[];
  today: string;
  onOpen: (id: string) => void;
}) => (
  <div className={CARD}>
    <CardHeading title="My Focus Tasks" href="/my-tasks" />
    {tasks.length === 0 ? (
      <p className="text-body-md text-on-surface-variant">
        Nothing open is assigned to you.
      </p>
    ) : (
      <ul className="flex flex-col divide-y divide-surface-variant">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <button
              type="button"
              aria-label={`Open ${task.key}`}
              onClick={() => onOpen(task.id)}
              className="min-w-0 text-left"
            >
              <span className="block truncate text-body-md text-on-surface">
                {task.title}
              </span>
              <span className="block truncate text-xs text-on-surface-variant">
                <span className="font-mono text-label-mono">{task.key}</span> ·{" "}
                {task.projectName}
              </span>
            </button>
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "text-xs",
                  isOverdue(task, today)
                    ? "text-error"
                    : "text-on-surface-variant",
                )}
              >
                {dueLabel(task, today)}
              </span>
              <TaskStatusChip status={task.status} />
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const SummaryChip = ({
  value,
  label,
}: {
  value: number;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-variant bg-surface-container-lowest px-3 py-1 text-body-md text-on-surface-variant">
    <span className="font-mono text-label-mono text-on-surface">{value}</span>{" "}
    {label}
  </span>
);
