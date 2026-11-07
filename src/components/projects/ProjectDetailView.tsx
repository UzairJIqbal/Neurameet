/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { getProject, ProjectClientError } from "@/lib/project-client";
import { ROLE_LABELS, type ProjectDetail } from "@/lib/project-types";
import MembersTab from "./MembersTab";
import TasksBoard from "./TasksBoard";
import ProposalsPanel from "./ProposalsPanel";
import GitHubTab from "./GitHubTab";
import DecisionsTab from "./DecisionsTab";
import ActivityTab from "./ActivityTab";
import AssistantTab from "./AssistantTab";

type TabKey = "members" | "tasks" | "promises" | "proposals" | "activity" | "assistant" | "github";

const TAB_LABELS: Record<TabKey, string> = {
  members: "Members",
  tasks: "Tasks",
  promises: "Decisions and Promises",
  proposals: "Proposals",
  activity: "Activity",
  assistant: "AI Assistant",
  github: "GitHub",
};

// Proposals and the assistant are hidden for Viewers (AC-37, AC-63). GitHub is
// the Owner's alone (AC-47).
const tabsFor = (project: ProjectDetail): TabKey[] => {
  if (project.role === "viewer") return ["members", "tasks", "promises", "activity"];
  const tabs: TabKey[] = ["members", "tasks", "promises", "proposals", "activity", "assistant"];
  return project.role === "owner" ? [...tabs, "github"] : tabs;
};

// Page shell: header plus tabs, the selected tab kept in ?tab=.
const ProjectDetailView = ({ id }: { id: string }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

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

  const tabs = tabsFor(project);
  const requested = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = requested && tabs.includes(requested) ? requested : "members";
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

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-words text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
            {project.name}
          </h1>
          <span className="rounded-md bg-surface-container px-2 py-1 font-mono text-label-mono text-on-surface-variant">
            {project.taskPrefix}
          </span>
          <span className="inline-flex items-center rounded-full bg-primary-container/15 px-3 py-1 text-label-caps uppercase tracking-wider text-primary-container">
            {ROLE_LABELS[project.role]}
          </span>
        </div>
        <p className="text-body-md text-on-surface-variant">
          {project.memberCount} member{project.memberCount === 1 ? "" : "s"} · {project.meetingCount} meeting
          {project.meetingCount === 1 ? "" : "s"}
        </p>
      </header>

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

      {tab === "members" && <MembersTab project={project} onProjectChanged={reload} />}
      {tab === "tasks" && <TasksBoard project={project} />}
      {tab === "proposals" && <ProposalsPanel project={project} />}
      {tab === "github" && <GitHubTab project={project} />}
      {tab === "promises" && <DecisionsTab project={project} />}
      {tab === "activity" && <ActivityTab project={project} />}
      {tab === "assistant" && <AssistantTab projectId={project.id} />}
    </section>
  );
};

export default ProjectDetailView;
