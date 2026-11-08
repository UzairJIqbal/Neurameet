/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  FolderKanban,
  Github,
  LayoutGrid,
  List,
  MailOpen,
  Plus,
  Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { relativeTime } from "@/lib/chatHistory";
import { listMyInvitations, listProjects } from "@/lib/project-client";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type ProjectCard,
  type ProjectStatus,
} from "@/lib/project-types";
import {
  readStoredView,
  writeStoredView,
  type ListView,
} from "@/lib/user-prefs";
import CreateProjectDialog from "./CreateProjectDialog";
import InvitationReviewDialog from "./InvitationReviewDialog";
import {
  AvatarStack,
  ProjectIconTile,
  ProjectRoleChip,
  ProjectStatusChip,
} from "./project-visuals";
import { useCardLoad } from "./useCardLoad";

const VIEW_KEY = "neurameet:projects-view";
const VIEWS: readonly ListView[] = ["grid", "list"];

type StatusFilter = ProjectStatus | "all";

const formatNext = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const repoLabel = (p: ProjectCard) =>
  !p.repo.connected ? "No repository" : (p.repo.name ?? "Repository connected");

const percentDone = (p: ProjectCard) =>
  p.taskTotal === 0 ? 0 : Math.round((p.taskCompleted / p.taskTotal) * 100);

const Progress = ({ project }: { project: ProjectCard }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between text-body-md text-on-surface-variant">
      <span>
        {project.taskCompleted} of {project.taskTotal} tasks complete
      </span>
      <span>{percentDone(project)}%</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-container">
      <div
        className="h-full rounded-full bg-primary-container"
        style={{ width: `${percentDone(project)}%` }}
      />
    </div>
  </div>
);

const RepoLine = ({ project }: { project: ProjectCard }) => (
  <p className="flex min-w-0 items-center gap-2 text-body-md text-on-surface-variant">
    <Github className="h-4 w-4 shrink-0" aria-hidden />
    <span
      className={cn(
        "truncate",
        project.repo.name && "font-label-mono text-label-mono",
      )}
    >
      {repoLabel(project)}
    </span>
  </p>
);

const NextMeetingLine = ({ project }: { project: ProjectCard }) => (
  <p className="flex min-w-0 items-center gap-2 text-body-md text-on-surface-variant">
    <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
    <span className="truncate">
      {project.nextMeeting
        ? `${project.nextMeeting.title} · ${formatNext(project.nextMeeting.startedAt)}`
        : "No meeting scheduled"}
    </span>
  </p>
);

const updatedLabel = (p: ProjectCard) => {
  const age = relativeTime(new Date(p.updatedAt).getTime());
  return age === "now" ? "Updated just now" : `Updated ${age} ago`;
};

const GridCard = ({ project }: { project: ProjectCard }) => (
  <Link
    href={`/projects/${project.id}`}
    className="flex flex-col gap-3 rounded-card bg-surface-container-lowest p-5 transition-colors hover:border-primary shadow-card"
  >
    <div className="flex items-start justify-between gap-3">
      <ProjectIconTile icon={project.icon} color={project.color} />
      <div className="flex flex-wrap justify-end gap-1">
        <ProjectRoleChip role={project.role} />
        <ProjectStatusChip status={project.status} />
      </div>
    </div>
    <div className="flex min-w-0 flex-col gap-1">
      <span className="break-words text-headline-sm text-on-surface">
        {project.name}
      </span>
      {project.description && (
        <span className="line-clamp-2 break-words text-body-md text-on-surface-variant">
          {project.description}
        </span>
      )}
    </div>
    <p className="text-body-md text-on-surface-variant">
      Owner {project.ownerName}
    </p>
    <RepoLine project={project} />
    <Progress project={project} />
    <NextMeetingLine project={project} />
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-surface-variant pt-3">
      <AvatarStack avatars={project.avatars} total={project.memberCount} />
      <span className="text-xs text-on-surface-variant">
        {updatedLabel(project)}
      </span>
    </div>
  </Link>
);

const ListRow = ({ project }: { project: ProjectCard }) => (
  <Link
    href={`/projects/${project.id}`}
    className="grid grid-cols-1 items-center gap-3 rounded-card bg-surface-container-lowest p-4 transition-colors hover:border-primary lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] shadow-card"
  >
    <div className="flex min-w-0 items-center gap-3">
      <ProjectIconTile icon={project.icon} color={project.color} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-medium text-on-surface">
          {project.name}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <ProjectRoleChip role={project.role} />
          <ProjectStatusChip status={project.status} />
          <span className="text-xs text-on-surface-variant">
            Owner {project.ownerName}
          </span>
        </div>
      </div>
    </div>
    <div className="flex min-w-0 flex-col gap-1">
      <RepoLine project={project} />
      <NextMeetingLine project={project} />
    </div>
    <Progress project={project} />
    <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
      <AvatarStack avatars={project.avatars} total={project.memberCount} />
      <span className="text-xs text-on-surface-variant">
        {updatedLabel(project)}
      </span>
    </div>
  </Link>
);

// AC-77d: My Projects, filtered in the browser over the loaded list.
const ProjectList = () => {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [view, setView] = useState<ListView>("grid");
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });
  const myInvitations = useCardLoad(listMyInvitations);
  const [decidedIds, setDecidedIds] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const pendingInvitations = (myInvitations.data?.invitations ?? []).filter(
    (i) => !decidedIds.includes(i.id),
  );

  // Read after mount so the server and browser render the same first frame.
  useEffect(() => {
    setView(readStoredView(VIEW_KEY, VIEWS, "grid"));
  }, []);

  // The GitHub callback lands here when its link has no project it can trust
  // (AC-43a). Read from window: this page has no Suspense for useSearchParams.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("github") !== "expired") return;
    toast.error(
      "That GitHub link expired. Open your project's GitHub tab and try again.",
    );
    url.searchParams.delete("github");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        setFailed(false);
        const data = await listProjects(controller.signal);
        setProjects(data.projects ?? []);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load projects:", err);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) =>
      `${p.name} ${p.description ?? ""}`.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  const shown =
    status === "all" ? searched : searched.filter((p) => p.status === status);

  const countOf = (key: StatusFilter) =>
    key === "all"
      ? searched.length
      : searched.filter((p) => p.status === key).length;

  const chooseView = (next: ListView) => {
    setView(next);
    writeStoredView(VIEW_KEY, next);
  };

  if (timedOut || failed) {
    return (
      <LoadError
        message="We couldn't load your projects."
        onRetry={() => setRetryNonce((k) => k + 1)}
      />
    );
  }

  if (isLoading) return <LoaderOne />;

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
            My Projects
          </h1>
          <p className="text-body-md text-on-surface-variant">
            Projects you own or have joined. Only you and project members can
            see them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </header>

      {pendingInvitations.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary bg-surface-container-low px-4 py-3">
          <p className="flex items-center gap-2 text-body-md text-on-surface">
            <MailOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            {pendingInvitations.length === 1
              ? "You have 1 project invitation."
              : `You have ${pendingInvitations.length} project invitations.`}
          </p>
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="rounded-full bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary"
          >
            Review invitation
          </button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <FolderKanban className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            No projects yet.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-[200px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                aria-label="Search projects"
                className="w-full rounded-xl border border-surface-variant bg-surface-container-lowest py-2 pl-9 pr-3 text-body-md text-on-surface focus:border-primary focus:outline-none"
              />
            </label>
            <div
              className="flex rounded-lg border border-surface-variant"
              role="group"
              aria-label="Layout"
            >
              {VIEWS.map((key) => {
                const Icon = key === "grid" ? LayoutGrid : List;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={key === "grid" ? "Grid view" : "List view"}
                    aria-pressed={view === key}
                    onClick={() => chooseView(key)}
                    className={cn(
                      "p-2 text-on-surface-variant first:rounded-l-lg last:rounded-r-lg",
                      view === key && "bg-surface-container text-on-surface",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", ...PROJECT_STATUSES] as StatusFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={status === key}
                onClick={() => setStatus(key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-body-md",
                  status === key
                    ? "border-primary bg-surface-container-low text-primary"
                    : "border-surface-variant text-on-surface-variant hover:bg-surface-container-low",
                )}
              >
                {key === "all" ? "All" : PROJECT_STATUS_LABELS[key]} (
                {countOf(key)})
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="py-10 text-center text-body-md text-on-surface-variant">
              No projects match.
            </p>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((p) => (
                <GridCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {shown.map((p) => (
                <ListRow key={p.id} project={p} />
              ))}
            </div>
          )}
        </>
      )}

      {creating && (
        <CreateProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => setProjects((prev) => [project, ...prev])}
        />
      )}

      {reviewing && pendingInvitations.length > 0 && (
        <InvitationReviewDialog
          invitations={pendingInvitations}
          onClose={() => setReviewing(false)}
          onDecided={(id) => setDecidedIds((prev) => [...prev, id])}
        />
      )}
    </section>
  );
};

export default ProjectList;
