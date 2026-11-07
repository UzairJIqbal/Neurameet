/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Github,
  ListTodo,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LoadError } from "@/components/ui/load-error";
import { activitySentence } from "@/lib/activity-text";
import {
  getProjectLedger,
  listActivity,
  listMembers,
  listProjectMeetings,
  listProposals,
  listTasks,
  prepareMeeting,
} from "@/lib/project-client";
import { TASK_STATUS_LABELS } from "@/lib/tasks";
import {
  canManageInvites,
  ROLE_LABELS,
  type ProjectFull,
  type ProjectTaskStatusKey,
} from "@/lib/project-types";
import type { MeetingListItem, MeetingPrepSuggestions } from "@/lib/meeting-types";
import { ageLabel } from "./ProjectHeader";
import { MemberAvatar } from "./project-visuals";
import { useCardLoad, type CardLoad } from "./useCardLoad";

type Props = {
  project: ProjectFull;
  onSchedule: () => void;
  onAddMember: () => void;
};

const CARD = "flex min-w-0 flex-col gap-3 rounded-lg border border-surface-variant bg-surface-container-lowest p-5";
const CARD_TITLE = "text-headline-sm text-on-surface";
const MUTED = "text-body-md text-on-surface-variant";
const LINK = "text-body-md text-primary hover:underline";
const PRIMARY_BUTTON =
  "rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const OUTLINE_BUTTON =
  "rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";

const tabHref = (projectId: string, tab: string) => `/projects/${projectId}?tab=${tab}`;

const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number | null;
  sub?: string | null;
}) => (
  <div className="flex min-w-0 items-start gap-3 rounded-lg border border-surface-variant bg-surface-container-lowest p-4">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
    <div className="flex min-w-0 flex-col">
      <span className={MUTED}>{label}</span>
      {/* A count that failed stays blank on its own (AC-70g). */}
      <span className="text-headline-sm text-on-surface">{value ?? "Unavailable"}</span>
      {sub && <span className="text-xs text-on-surface-variant">{sub}</span>}
    </div>
  </div>
);

// Plain SVG, so the donut needs no chart library. Stroke classes are tokens.
const DONUT_SEGMENTS: { key: ProjectTaskStatusKey; stroke: string; dot: string }[] = [
  { key: "completed", stroke: "stroke-success", dot: "bg-success" },
  { key: "in_review", stroke: "stroke-tertiary-container", dot: "bg-tertiary-container" },
  { key: "in_progress", stroke: "stroke-primary-container", dot: "bg-primary-container" },
  { key: "todo", stroke: "stroke-outline-variant", dot: "bg-outline-variant" },
  { key: "blocked", stroke: "stroke-error", dot: "bg-error" },
];

const percentOf = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 100));

const TaskDonut = ({ totals }: { totals: Record<ProjectTaskStatusKey, number> }) => {
  const total = DONUT_SEGMENTS.reduce((sum, s) => sum + totals[s.key], 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  // Each arc starts where the ones before it ended.
  const arcs = DONUT_SEGMENTS.reduce<{ key: string; stroke: string; length: number; offset: number }[]>(
    (acc, segment) => {
      const previous = acc[acc.length - 1];
      const offset = previous ? previous.offset + previous.length : 0;
      const length = total === 0 ? 0 : (totals[segment.key] / total) * circumference;
      return [...acc, { key: segment.key, stroke: segment.stroke, length, offset }];
    },
    [],
  );

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 100 100" className="-rotate-90" role="img" aria-label="Tasks by status">
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="12" className="stroke-surface-variant" />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="12"
              className={arc.stroke}
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-headline-sm text-on-surface">{percentOf(totals.completed, total)}%</span>
          <span className="text-xs text-on-surface-variant">complete</span>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {DONUT_SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-3 text-body-md">
            <span className="inline-flex items-center gap-2 text-on-surface-variant">
              <span className={`h-2 w-2 rounded-full ${segment.dot}`} aria-hidden />
              {TASK_STATUS_LABELS[segment.key]}
            </span>
            <span className="text-on-surface">{totals[segment.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** The loading and failed states one card shares with the others. */
function CardBody<T>({
  load,
  label,
  children,
}: {
  load: CardLoad<T>;
  label: string;
  children: (data: T) => React.ReactNode;
}) {
  if (load.failed) return <LoadError compact message={`We couldn't load ${label}.`} onRetry={load.retry} />;
  if (load.data === null) return <p className={MUTED}>{load.isLoading ? "Loading..." : ""}</p>;
  return <>{children(load.data)}</>;
}

const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const PREP_SECTIONS: { key: keyof MeetingPrepSuggestions; label: string }[] = [
  { key: "context", label: "Context to know" },
  { key: "openActionItems", label: "Open action items" },
  { key: "discussionPoints", label: "Discussion points" },
  { key: "questionsToAsk", label: "Questions to ask" },
];

const NextMeetingCard = ({
  meeting,
  canPrepare,
}: {
  meeting: MeetingListItem;
  canPrepare: boolean;
}) => {
  const [prep, setPrep] = useState<MeetingPrepSuggestions | null>(null);
  const [preparing, setPreparing] = useState(false);

  const prepare = async () => {
    setPreparing(true);
    try {
      const data = await prepareMeeting(meeting.title);
      setPrep(data.suggestions);
    } catch (err) {
      console.error("Meeting prep failed:", err);
      toast.error("We couldn't prepare this meeting. You can try again.");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="break-words font-medium text-on-surface">{meeting.title}</span>
        {meeting.startedAt && <span className={MUTED}>{dateTimeLabel(meeting.startedAt)}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/meeting/${meeting.streamCallId}`} className={PRIMARY_BUTTON}>
          Join
        </Link>
        {canPrepare && (
          <button type="button" onClick={prepare} disabled={preparing} className={OUTLINE_BUTTON}>
            {preparing ? "Preparing..." : "Prepare"}
          </button>
        )}
      </div>
      {prep &&
        PREP_SECTIONS.filter((s) => prep[s.key].length > 0).map((section) => (
          <div key={section.key} className="flex flex-col gap-1">
            <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">{section.label}</h3>
            <ul className="list-disc pl-5 text-body-md text-on-surface">
              {prep[section.key].map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
};

// The earliest meeting still ahead of now. A missed one is never "next".
export const nextMeetingOf = (meetings: MeetingListItem[], now: number): MeetingListItem | null =>
  meetings
    .filter((m) => m.status === "scheduled" && m.startedAt && new Date(m.startedAt).getTime() >= now)
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""))[0] ?? null;

// AC-70b: every card loads on its own, and no AI runs until you press Prepare.
const OverviewTab = ({ project, onSchedule, onAddMember }: Props) => {
  const { id, role, taskTotals, github } = project;
  const isViewer = role === "viewer";
  const canSchedule = !isViewer;

  const meetings = useCardLoad(
    useCallback((signal: AbortSignal) => listProjectMeetings(id, signal), [id]),
  );
  const review = useCardLoad(
    useCallback(
      async (signal: AbortSignal) => {
        const [proposals, ledger] = await Promise.all([
          listProposals(id, signal),
          getProjectLedger(id, {}, signal),
        ]);
        return {
          proposals: proposals.proposals.length,
          promises: ledger.canReview ? ledger.reviewCount : 0,
        };
      },
      [id],
    ),
    !isViewer,
  );
  const activity = useCardLoad(useCallback((signal: AbortSignal) => listActivity(id, null, signal), [id]));
  const tasks = useCardLoad(useCallback((signal: AbortSignal) => listTasks(id, {}, signal), [id]));
  const team = useCardLoad(useCallback((signal: AbortSignal) => listMembers(id, signal), [id]));

  const totalTasks = useMemo(
    () => (taskTotals ? Object.values(taskTotals).reduce((sum, n) => sum + n, 0) : null),
    [taskTotals],
  );
  const recentTasks = useMemo(
    () =>
      [...(tasks.data?.tasks ?? [])]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5),
    [tasks.data],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="Members" value={project.memberCount} />
        <StatCard
          icon={CalendarDays}
          label="Meetings"
          value={project.meetingCount}
          sub={project.upcomingMeetingCount === null ? null : `${project.upcomingMeetingCount} upcoming`}
        />
        <StatCard icon={ListTodo} label="Total tasks" value={totalTasks} />
        <StatCard icon={CheckCircle2} label="Completed" value={taskTotals ? taskTotals.completed : null} />
        <StatCard
          icon={Clock}
          label="Pending"
          value={project.openTaskCount}
          sub={taskTotals ? `${taskTotals.blocked} blocked` : null}
        />
        <StatCard
          icon={TrendingUp}
          label="Overall progress"
          value={taskTotals && totalTasks !== null ? `${percentOf(taskTotals.completed, totalTasks)}%` : null}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={CARD} aria-label="Task progress">
          <div className="flex items-center justify-between gap-3">
            <h2 className={CARD_TITLE}>Task progress</h2>
            <Link href={tabHref(id, "tasks")} className={LINK}>
              Open board
            </Link>
          </div>
          {taskTotals ? <TaskDonut totals={taskTotals} /> : <p className={MUTED}>Task counts are unavailable right now.</p>}
          {totalTasks === 0 && <p className={MUTED}>No tasks yet.</p>}
        </section>

        <section className={CARD} aria-label="Next meeting">
          <div className="flex items-center justify-between gap-3">
            <h2 className={CARD_TITLE}>Next meeting</h2>
            <Link href={tabHref(id, "meetings")} className={LINK}>
              View all
            </Link>
          </div>
          <CardBody load={meetings} label="the next meeting">
            {(data) => {
              const next = nextMeetingOf(data.meetings, Date.now());
              if (next) return <NextMeetingCard meeting={next} canPrepare={!isViewer} />;
              return (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={MUTED}>No meeting scheduled.</p>
                  {canSchedule && (
                    <button type="button" onClick={onSchedule} className={PRIMARY_BUTTON}>
                      Schedule Meeting
                    </button>
                  )}
                </div>
              );
            }}
          </CardBody>
        </section>
      </div>

      {!isViewer && (
        <section className={CARD} aria-label="Waiting for review">
          <h2 className={CARD_TITLE}>Waiting for review</h2>
          <CardBody load={review} label="what waits for review">
            {(data) =>
              data.proposals === 0 && data.promises === 0 ? (
                <p className={MUTED}>Nothing waits for review.</p>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {data.proposals > 0 && (
                    <Link href={tabHref(id, "tasks")} className={LINK}>
                      {data.proposals} pending proposal{data.proposals === 1 ? "" : "s"}
                    </Link>
                  )}
                  {data.promises > 0 && (
                    <Link href={tabHref(id, "promises")} className={LINK}>
                      {data.promises} promise{data.promises === 1 ? "" : "s"} to review
                    </Link>
                  )}
                </div>
              )
            }
          </CardBody>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className={CARD} aria-label="Recent activity">
          <div className="flex items-center justify-between gap-3">
            <h2 className={CARD_TITLE}>Recent activity</h2>
            <Link href={tabHref(id, "activity")} className={LINK}>
              View all
            </Link>
          </div>
          <CardBody load={activity} label="recent activity">
            {(data) =>
              data.rows.length === 0 ? (
                <p className={MUTED}>No activity yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.rows.slice(0, 5).map((row) => (
                    <li key={row.id} className="flex flex-col">
                      <span className="break-words text-body-md text-on-surface">{activitySentence(row)}</span>
                      <span className="text-xs text-on-surface-variant">{ageLabel(row.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )
            }
          </CardBody>
        </section>

        <section className={CARD} aria-label="Recent tasks">
          <div className="flex items-center justify-between gap-3">
            <h2 className={CARD_TITLE}>Recent tasks</h2>
            <Link href={tabHref(id, "tasks")} className={LINK}>
              View all
            </Link>
          </div>
          <CardBody load={tasks} label="recent tasks">
            {() =>
              recentTasks.length === 0 ? (
                <p className={MUTED}>No tasks yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {recentTasks.map((task) => (
                    <li key={task.id} className="flex flex-col">
                      <Link href={`${tabHref(id, "tasks")}&task=${task.id}`} className="break-words text-body-md text-on-surface hover:text-primary">
                        <span className="font-mono text-label-mono text-on-surface-variant">{task.key}</span> {task.title}
                      </Link>
                      <span className="text-xs text-on-surface-variant">
                        {task.assigneeName ?? "Unassigned"} · {ageLabel(task.updatedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </CardBody>
        </section>

        <section className={CARD} aria-label="Team">
          <div className="flex items-center justify-between gap-3">
            <h2 className={CARD_TITLE}>Team</h2>
            <Link href={tabHref(id, "members")} className={LINK}>
              View all
            </Link>
          </div>
          <CardBody load={team} label="the team">
            {(data) => (
              <div className="flex flex-col gap-2">
                <ul className="flex flex-col gap-2">
                  {data.members.slice(0, 5).map((member) => (
                    <li key={member.userId} className="flex items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <MemberAvatar name={member.name} imageUrl={member.imageUrl} />
                        <span className="truncate text-body-md text-on-surface">{member.name}</span>
                      </span>
                      <span className="text-xs text-on-surface-variant">{ROLE_LABELS[member.role]}</span>
                    </li>
                  ))}
                </ul>
                <p className={MUTED}>
                  {data.members.length} member{data.members.length === 1 ? "" : "s"}
                </p>
                {data.members.length === 1 && canManageInvites(role) && (
                  <button type="button" onClick={onAddMember} className={`${OUTLINE_BUTTON} self-start`}>
                    Add Member
                  </button>
                )}
              </div>
            )}
          </CardBody>
        </section>
      </div>

      <section className={CARD} aria-label="Repository">
        <h2 className={`${CARD_TITLE} inline-flex items-center gap-2`}>
          <Github className="h-5 w-5" aria-hidden />
          Repository
        </h2>
        {!github.connected ? (
          <p className={MUTED}>GitHub is not connected.</p>
        ) : github.repos.length === 0 ? (
          <p className={MUTED}>Repository connected</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {github.repos.map((repo) => (
              <li key={repo.fullName} className="break-all font-mono text-label-mono text-on-surface">
                {repo.fullName}
              </li>
            ))}
          </ul>
        )}
        {github.connected && github.lastSyncedAt && <p className={MUTED}>Synced {ageLabel(github.lastSyncedAt)}</p>}
        {!isViewer && (
          <Link href={tabHref(id, "github")} className={LINK}>
            {!github.connected && role === "owner" ? "Connect GitHub" : "Open GitHub"}
          </Link>
        )}
      </section>
    </div>
  );
};

export default OverviewTab;
