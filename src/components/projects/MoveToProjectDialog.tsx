/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { listProjects, moveMeetingToProject } from "@/lib/project-client";
import type { ProjectSummary } from "@/lib/project-types";

type Props = {
  meetingId: string;
  onClose: () => void;
  onMoved: () => void;
};

const inputClass =
  "w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";
const primaryButton =
  "rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";

// AC-24, AC-25: the creator moves a personal meeting into a project where they
// are Developer or higher. It never moves back out.
const MoveToProjectDialog = ({ meetingId, onClose, onMoved }: Props) => {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await listProjects(controller.signal);
        const eligible = data.projects.filter((p) => p.role !== "viewer");
        setProjects(eligible);
        setProjectId(eligible[0]?.id ?? "");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load projects:", err);
        setProjects(null);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const reload = useCallback(() => setRetryNonce((k) => k + 1), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setError(null);
    setBusy(true);
    try {
      await moveMeetingToProject(meetingId, projectId);
      toast.success("Meeting moved to the project");
      onMoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move the meeting");
    } finally {
      setBusy(false);
    }
  };

  const body = () => {
    if (timedOut || (!isLoading && projects === null)) {
      return <LoadError message="We couldn't load your projects." onRetry={reload} />;
    }
    if (isLoading || projects === null) return <LoaderOne />;
    if (projects.length === 0) {
      return (
        <p className="text-body-md text-on-surface-variant">
          You need Developer access or higher in a project to move a meeting into it.
        </p>
      );
    }
    return (
      <>
        <label className="flex flex-col gap-1 text-body-md text-on-surface">
          Project
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-body-md text-on-surface-variant">
          Project members will see this meeting. Its follow ups become proposals for an Owner or Admin to review,
          and the meeting can&apos;t move back out.
        </p>
        {error && (
          <p role="alert" className="text-body-md text-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !projectId} className={primaryButton}>
          {busy ? "Moving..." : "Move meeting"}
        </button>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-meeting-title"
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 id="move-meeting-title" className="text-headline-sm text-on-surface">
            Move to project
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-low"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {body()}
      </form>
    </div>
  );
};

export default MoveToProjectDialog;
