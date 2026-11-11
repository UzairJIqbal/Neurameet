/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { ModalProvider } from "@/components/ui/animated-modal";
import MeetingModel from "@/components/MeetingModel";
import { useShellDetail } from "@/components/shell/ShellContext";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { getProject, ProjectClientError } from "@/lib/project-client";
import type { ProjectFull, ProjectRole } from "@/lib/project-types";
import ProjectHeader from "./ProjectHeader";
import OverviewTab from "./OverviewTab";
import ProjectMeetingsTab from "./ProjectMeetingsTab";
import AddMembersDialog from "./AddMembersDialog";
import MembersStrip from "./MembersStrip";
import TasksBoard from "./TasksBoard";
import ProposalsPanel from "./ProposalsPanel";
import GitHubPanel from "./GitHubPanel";
import ActivityTab from "./ActivityTab";
import ProjectAssistant from "./ProjectAssistant";

// Confirming or merging a proposal changes the board, so the tab owns the key
// that reloads it (AC-70c).
const TasksTab = ({
  project,
  onProjectChanged,
  onAddMember,
  invitesNonce,
}: {
  project: ProjectFull;
  onProjectChanged: () => void;
  onAddMember: () => void;
  invitesNonce: number;
}) => {
  const [reloadKey, setReloadKey] = useState(0);
  const bump = useCallback(() => setReloadKey((k) => k + 1), []);
  return (
    <div className="flex flex-col gap-6">
      <MembersStrip
        project={project}
        onProjectChanged={onProjectChanged}
        onAddMember={onAddMember}
        invitesNonce={invitesNonce}
      />
      {project.role !== "viewer" && <ProposalsPanel project={project} onChanged={bump} />}
      <TasksBoard project={project} reloadKey={reloadKey} />
    </div>
  );
};

type TabKey =
  | "overview"
  | "meetings"
  | "tasks"
  | "github"
  | "activity"
  | "assistant";

const TAB_ORDER: TabKey[] = [
  "overview",
  "meetings",
  "tasks",
  "github",
  "activity",
  "assistant",
];

const TAB_LABELS: Record<TabKey, string> = {
  overview: "Overview",
  meetings: "Meetings",
  tasks: "Tasks",
  github: "GitHub",
  activity: "Development Activity",
  assistant: "AI Assistant",
};

// Owner, Admin and Developer see every tab, a Viewer all but GitHub and AI
// Assistant. Members live on the Tasks tab; Settings and Decisions and
// Promises are gone from the page.
const HIDDEN_TABS: Record<ProjectRole, TabKey[]> = {
  owner: [],
  admin: [],
  developer: [],
  viewer: ["github", "assistant"],
};

export const tabsForRole = (role: ProjectRole): TabKey[] =>
  TAB_ORDER.filter((key) => !HIDDEN_TABS[role].includes(key));

// AC-70a: old links keep working. Anything unknown or not allowed is Overview.
const TAB_ALIASES: Record<string, TabKey> = { board: "tasks", proposals: "tasks", members: "tasks" };

export const resolveTab = (requested: string | null, role: ProjectRole): TabKey => {
  const key = (requested && TAB_ALIASES[requested]) || requested;
  return tabsForRole(role).find((tab) => tab === key) ?? "overview";
};

// Page shell: header plus tabs, the selected tab kept in ?tab=.
const ProjectDetailView = ({ id }: { id: string }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [project, setProject] = useState<ProjectFull | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [dialog, setDialog] = useState<"schedule" | "invite" | null>(null);
  const [inviteNonce, setInviteNonce] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

  useShellDetail(project?.name ?? null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await getProject(id, controller.signal);
        setProject(data.project);
        setNotFound(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ProjectClientError && err.status === 404) {
          setNotFound(true);
        } else {
          console.error("Failed to load project:", err);
          toast.error("Failed to load project");
        }
        setProject(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [id, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  const reload = useCallback(() => setRetryNonce((k) => k + 1), []);
  const closeDialog = useCallback(() => {
    setDialog(null);
    reload();
  }, [reload]);
  const openSchedule = useCallback(() => setDialog("schedule"), []);
  const openInvite = useCallback(() => setDialog("invite"), []);

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load this project."
        onRetry={reload}
        listHref="/projects"
        listLabel="Back to projects"
      />
    );
  }

  if (isLoading && !project) return <LoaderOne />;

  if (!project) {
    return (
      <div className="px-6 py-8">
        <LoadError
          message={notFound ? "This project doesn't exist or you're not a member." : "We couldn't load this project."}
          onRetry={notFound ? undefined : reload}
          listHref="/projects"
          listLabel="Back to projects"
        />
      </div>
    );
  }

  const tabs = tabsForRole(project.role);
  const tab = resolveTab(searchParams.get("tab"), project.role);
  const selectTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <Link
        href="/projects"
        className="inline-flex w-fit items-center gap-2 text-body-md text-on-surface-variant hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Projects
      </Link>

      <ProjectHeader
        project={project}
        onAddMember={openInvite}
        onSchedule={openSchedule}
        onChanged={reload}
      />

      <nav role="tablist" className="flex gap-2 overflow-x-auto border-b border-surface-variant">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === tab}
            onClick={() => selectTab(key)}
            className={
              key === tab
                ? "whitespace-nowrap border-b-2 border-primary px-3 py-2 text-body-md font-medium text-primary"
                : "whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-body-md text-on-surface-variant hover:text-on-surface"
            }
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </nav>

      {/* The key reloads a data tab's cards after a change made in the header. */}
      {tab === "overview" && (
        <OverviewTab key={retryNonce} project={project} onSchedule={openSchedule} onAddMember={openInvite} />
      )}
      {tab === "meetings" && <ProjectMeetingsTab key={retryNonce} project={project} onSchedule={openSchedule} />}
      {tab === "tasks" && (
        <TasksTab project={project} onProjectChanged={reload} onAddMember={openInvite} invitesNonce={inviteNonce} />
      )}
      {tab === "github" && <GitHubPanel project={project} reloadKey={retryNonce} onChanged={reload} />}
      {tab === "activity" && <ActivityTab project={project} />}
      {tab === "assistant" &&
        (project.processedMeetingCount === 0 ? (
          <p className="text-body-md text-on-surface-variant">
            The assistant answers from processed meetings. Process one first.
          </p>
        ) : (
          <ProjectAssistant project={project} />
        ))}

      {dialog === "schedule" && (
        <ModalProvider>
          <MeetingModel type="isScheduleMeeting" initialProjectId={project.id} onClose={closeDialog} />
        </ModalProvider>
      )}
      {dialog === "invite" && (
        <AddMembersDialog
          projectId={project.id}
          projectName={project.name}
          myRole={project.role}
          onClose={closeDialog}
          onCreated={() => setInviteNonce((n) => n + 1)}
        />
      )}
    </section>
  );
};

export default ProjectDetailView;
