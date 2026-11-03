"use client";

import { useCallback, useEffect, useState } from "react";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import { listProjects } from "@/lib/project-client";
import type { ProjectRole, ProjectSummary } from "@/lib/project-types";

// Roles that may create a meeting in a project (spec 0004, NEED_ROLES.content).
const CREATOR_ROLES: readonly ProjectRole[] = ["owner", "admin", "developer"];

type ProjectPickerProps = {
  value: string | null;
  onChange: (projectId: string | null) => void;
  disabled?: boolean;
};

/**
 * The "Project" select in the New Meeting and Schedule Meeting forms (W3).
 * "Personal" is always there, so a failed load still lets you create a
 * personal meeting; the load error shows inline with a retry.
 */
export function ProjectPicker({
  value,
  onChange,
  disabled,
}: ProjectPickerProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const { timedOut } = useLoadingTimeout(loading, { retryNonce });

  const load = useCallback((signal: AbortSignal) => {
    setLoading(true);
    setFailed(false);
    listProjects(signal)
      .then((res) =>
        setProjects(res.projects.filter((p) => CREATOR_ROLES.includes(p.role))),
      )
      .catch((err: unknown) => {
        if (signal.aborted) return;
        console.error("[ProjectPicker] project list failed:", err);
        setFailed(true);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, retryNonce]);

  const showError = failed || (loading && timedOut);

  return (
    <div className="flex flex-col gap-2.5">
      <label
        htmlFor="meeting-project"
        className="text-base font-normal leading-[22.4px] text-on-surface-variant"
      >
        Project
      </label>
      <select
        id="meeting-project"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-on-surface focus:outline-none disabled:opacity-60"
      >
        <option value="">Personal</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {loading && !timedOut && (
        <p className="text-xs text-on-surface-variant">
          Loading your projects…
        </p>
      )}
      {showError && (
        <LoadError
          message="Couldn't load your projects. You can still create a personal meeting."
          onRetry={() => setRetryNonce((n) => n + 1)}
        />
      )}
    </div>
  );
}
