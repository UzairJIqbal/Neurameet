/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { listMembers, listProjectMeetings } from "@/lib/project-client";
import { MEETING_TYPE_LABELS, type MeetingListItem } from "@/lib/meeting-types";
import type { ProjectAvatar, ProjectFull } from "@/lib/project-types";
import { AvatarStack } from "./project-visuals";
import { useCardLoad } from "./useCardLoad";

type Props = {
  project: ProjectFull;
  onSchedule: () => void;
};

type StatusFilter = "all" | "scheduled" | "ended";
type DateFilter = "any" | "next7" | "last7" | "last30";

const DAY_MS = 86_400_000;
const SUMMARY_LIMIT = 5;
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "ended", label: "Ended" },
];
const CHIP = "rounded-full px-2 py-0.5 text-xs font-medium";
const OUTLINE_BUTTON =
  "rounded-lg border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low";

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

// Only when both ends are known: the real end once ended, the planned end before.
const durationLabel = (meeting: MeetingListItem): string | null => {
  const end = meeting.status === "scheduled" ? meeting.scheduledEndAt : meeting.endedAt;
  if (!meeting.startedAt || !end) return null;
  const minutes = Math.round((new Date(end).getTime() - new Date(meeting.startedAt).getTime()) / 60_000);
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes % 60 === 0 ? `${hours} hr` : `${hours} hr ${minutes % 60} min`;
};

const matchesDate = (startedAt: string | null, filter: DateFilter, now: number) => {
  if (filter === "any") return true;
  if (!startedAt) return false;
  const at = new Date(startedAt).getTime();
  if (filter === "next7") return at >= now && at <= now + 7 * DAY_MS;
  return at <= now && at >= now - (filter === "last7" ? 7 : 30) * DAY_MS;
};

const DateBlock = ({ iso }: { iso: string | null }) => (
  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-container-low">
    {iso ? (
      <>
        <span className="text-label-caps uppercase text-on-surface-variant">
          {new Date(iso).toLocaleDateString(undefined, { month: "short" })}
        </span>
        <span className="text-headline-sm text-on-surface">{new Date(iso).getDate()}</span>
      </>
    ) : (
      <span className="text-xs text-on-surface-variant">No date</span>
    )}
  </div>
);

const MeetingRow = ({
  meeting,
  avatars,
  now,
}: {
  meeting: MeetingListItem;
  avatars: Map<string, ProjectAvatar>;
  now: number;
}) => {
  const upcoming = meeting.status === "scheduled";
  const invited = (meeting.invitedUserIds ?? []).flatMap((id) => avatars.get(id) ?? []);
  const duration = durationLabel(meeting);
  const passed = upcoming && meeting.startedAt !== null && new Date(meeting.startedAt).getTime() < now;
  const toReview = meeting.proposalCount ?? 0;

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-lg border border-surface-variant bg-surface-container-lowest p-4">
      <DateBlock iso={meeting.startedAt} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words text-body-md font-medium text-on-surface">{meeting.title}</span>
          <span className={`${CHIP} ${upcoming ? "bg-primary-container/15 text-primary-container" : "bg-surface-container-low text-on-surface-variant"}`}>
            {upcoming ? "Scheduled" : "Ended"}
          </span>
          {passed && <span className={`${CHIP} bg-warning-container text-on-warning-container`}>Time passed</span>}
          {toReview > 0 && (
            <span className={`${CHIP} bg-warning-container text-on-warning-container`}>
              {toReview} {toReview === 1 ? "task" : "tasks"} to review
            </span>
          )}
        </div>
        <p className="text-body-md text-on-surface-variant">
          {meeting.startedAt ? `${dateOf(meeting.startedAt)}, ${timeOf(meeting.startedAt)}` : "No date"}
          {duration ? ` · ${duration}` : ""}
          {meeting.organizerName ? ` · Organizer: ${meeting.organizerName}` : ""}
        </p>
        {meeting.meetingType && (
          <span className={`${CHIP} self-start bg-secondary-container text-on-secondary-container`}>
            {MEETING_TYPE_LABELS[meeting.meetingType]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {invited.length > 0 && <AvatarStack avatars={invited} total={invited.length} />}
        {upcoming ? (
          <Link
            href={`/meeting/${meeting.streamCallId}`}
            className="rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary"
          >
            Join
          </Link>
        ) : (
          <Link href={`/meeting-intelligence/${meeting.id}`} className={OUTLINE_BUTTON}>
            View Details
          </Link>
        )}
      </div>
    </li>
  );
};

const MeetingSection = ({
  title,
  meetings,
  avatars,
  now,
}: {
  title: string;
  meetings: MeetingListItem[];
  avatars: Map<string, ProjectAvatar>;
  now: number;
}) =>
  meetings.length === 0 ? null : (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">
        {title} · {meetings.length}
      </h3>
      <ul className="flex flex-col gap-2">
        {meetings.map((meeting) => (
          <MeetingRow key={meeting.id} meeting={meeting} avatars={avatars} now={now} />
        ))}
      </ul>
    </section>
  );

const SummaryCard = ({ meeting }: { meeting: MeetingListItem }) => {
  const reviewCount = meeting.proposalCount ?? 0;
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-surface-variant bg-surface-container-lowest p-4">
      <Link href={`/meeting-intelligence/${meeting.id}`} className="break-words text-body-md font-medium text-on-surface hover:underline">
        {meeting.title}
      </Link>
      {meeting.startedAt && <span className="text-xs text-on-surface-variant">{dateOf(meeting.startedAt)}</span>}
      <p className="break-words text-body-md text-on-surface-variant">{meeting.summaryExcerpt}</p>
      <p className="flex flex-wrap gap-x-3 text-xs text-on-surface-variant">
        <span>{meeting.decisionCount ?? 0} decisions</span>
        <span>{meeting.actionItemCount ?? 0} action items</span>
        {reviewCount > 0 && <span className="text-on-warning-container">{reviewCount} awaiting review</span>}
      </p>
    </li>
  );
};

// AC-70d: every filter runs on the loaded list.
const ProjectMeetingsTab = ({ project, onSchedule }: Props) => {
  const load = useCardLoad(
    useCallback((signal: AbortSignal) => listProjectMeetings(project.id, signal), [project.id]),
  );
  const members = useCardLoad(
    useCallback((signal: AbortSignal) => listMembers(project.id, signal), [project.id]),
  );
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [now] = useState(() => Date.now());

  const avatars = useMemo(
    () =>
      new Map(
        (members.data?.members ?? []).map((member): [string, ProjectAvatar] => [
          member.userId,
          { name: member.name, imageUrl: member.imageUrl },
        ]),
      ),
    [members.data],
  );

  const all = useMemo(() => load.data?.meetings ?? [], [load.data]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((meeting) => {
      const isScheduled = meeting.status === "scheduled";
      if (statusFilter === "scheduled" && !isScheduled) return false;
      if (statusFilter === "ended" && isScheduled) return false;
      if (needle && !meeting.title.toLowerCase().includes(needle)) return false;
      return matchesDate(meeting.startedAt, dateFilter, now);
    });
  }, [all, query, statusFilter, dateFilter, now]);

  if (load.failed) return <LoadError message="We couldn't load the meetings." onRetry={load.retry} />;
  if (!load.data) return <LoaderOne />;

  const scheduleButton = project.role !== "viewer" && (
    <button
      type="button"
      onClick={onSchedule}
      className="rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary"
    >
      Schedule Meeting
    </button>
  );

  if (all.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-variant bg-surface-container-lowest p-5">
        <p className="text-body-md text-on-surface-variant">No project meetings yet.</p>
        {scheduleButton}
      </div>
    );
  }

  const startOf = (meeting: MeetingListItem) =>
    meeting.startedAt ? new Date(meeting.startedAt).getTime() : Number.MAX_SAFE_INTEGER;
  const upcoming = filtered
    .filter((meeting) => meeting.status === "scheduled")
    .sort((a, b) => startOf(a) - startOf(b));
  const history = filtered.filter((meeting) => meeting.status !== "scheduled");
  const summaries = all.filter((meeting) => meeting.summaryExcerpt).slice(0, SUMMARY_LIMIT);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings"
            aria-label="Search meetings"
            className="min-w-0 flex-1 rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none"
          />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            aria-label="Date"
            className="rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="any">Any date</option>
            <option value="next7">Next 7 days</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
          </select>
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
              className={`rounded-full border border-surface-variant px-3 py-1 text-body-md ${
                statusFilter === value
                  ? "bg-primary-container text-on-primary"
                  : "text-on-surface hover:bg-surface-container-low"
              }`}
            >
              {label}
            </button>
          ))}
          {scheduleButton}
        </div>
        {filtered.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No meetings match these filters.</p>
        ) : (
          <>
            <MeetingSection title="Upcoming" meetings={upcoming} avatars={avatars} now={now} />
            <MeetingSection title="Meeting History" meetings={history} avatars={avatars} now={now} />
          </>
        )}
      </div>
      {summaries.length > 0 && (
        <aside className="flex min-w-0 flex-col gap-2" aria-label="AI Meeting Summaries">
          <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">AI Meeting Summaries</h3>
          <ul className="flex flex-col gap-2">
            {summaries.map((meeting) => (
              <SummaryCard key={meeting.id} meeting={meeting} />
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
};

export default ProjectMeetingsTab;
