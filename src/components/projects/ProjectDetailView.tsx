/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { getProject, ProjectClientError } from "@/lib/project-client";
import { ROLE_LABELS, type ProjectDetail } from "@/lib/project-types";
import MembersTab from "./MembersTab";

// Page shell: header plus tabs. Only Members exists in W1; the other tabs
// arrive with their steps.
const ProjectDetailView = ({ id }: { id: string }) => {
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

      <nav role="tablist" className="flex gap-2 border-b border-surface-variant">
        <span
          role="tab"
          aria-selected="true"
          className="border-b-2 border-primary px-3 py-2 text-body-md font-medium text-primary"
        >
          Members
        </span>
      </nav>

      <MembersTab project={project} onProjectChanged={reload} />
    </section>
  );
};

export default ProjectDetailView;
