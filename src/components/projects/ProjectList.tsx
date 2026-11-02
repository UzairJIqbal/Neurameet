/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus, Users } from "lucide-react";
import toast from "react-hot-toast";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { listProjects } from "@/lib/project-client";
import { ROLE_LABELS, type ProjectSummary } from "@/lib/project-types";
import CreateProjectDialog from "./CreateProjectDialog";

const ProjectList = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [creating, setCreating] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await listProjects(controller.signal);
        setProjects(data.projects ?? []);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load projects:", err);
        toast.error("Failed to load projects");
        setProjects([]);
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

  if (timedOut) {
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
            Projects
          </h1>
          <p className="text-body-md text-on-surface-variant">
            {projects.length} project{projects.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary"
        >
          <Plus className="h-4 w-4" />
          New project
        </button>
      </header>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <FolderKanban className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">No projects yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-5 transition-colors hover:border-primary hover:bg-surface-container-low"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="break-words text-headline-sm text-on-surface">{p.name}</span>
                <span className="rounded-md bg-surface-container px-2 py-1 font-mono text-label-mono text-on-surface-variant">
                  {p.taskPrefix}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex w-fit items-center rounded-full bg-primary-container/15 px-3 py-1 text-label-caps uppercase tracking-wider text-primary-container">
                  {ROLE_LABELS[p.role]}
                </span>
                <span className="inline-flex items-center gap-1 text-body-md text-on-surface-variant">
                  <Users className="h-4 w-4" />
                  {p.memberCount} member{p.memberCount === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <CreateProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false);
            setProjects((prev) => [project, ...prev]);
          }}
        />
      )}
    </section>
  );
};

export default ProjectList;
