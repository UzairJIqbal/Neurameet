/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { createProject, ProjectClientError } from "@/lib/project-client";
import {
  PROJECT_NAME_MAX,
  suggestTaskPrefix,
  type ProjectSummary,
} from "@/lib/project-types";

type Props = {
  onClose: () => void;
  onCreated: (project: ProjectSummary) => void;
};

const inputClass =
  "w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";

// Name and prefix form. The prefix follows the name until you edit it; the
// server checks both again and its 422 message shows under the field.
const CreateProjectDialog = ({ onClose, onCreated }: Props) => {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixEdited, setPrefixEdited] = useState(false);
  const [error, setError] = useState<{ field: "name" | "prefix"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const handleName = (value: string) => {
    setName(value);
    if (!prefixEdited) setPrefix(suggestTaskPrefix(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { project } = await createProject(name, prefix);
      toast.success("Project created");
      onCreated(project);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create project";
      if (err instanceof ProjectClientError && err.status === 422) {
        setError({ field: /prefix/i.test(message) ? "prefix" : "name", message });
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 id="create-project-title" className="text-headline-sm text-on-surface">
            New project
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

        <label className="flex flex-col gap-2">
          <span className="text-label-caps uppercase tracking-wider text-on-surface-variant">Name</span>
          <input
            type="text"
            value={name}
            maxLength={PROJECT_NAME_MAX}
            onChange={(e) => handleName(e.target.value)}
            placeholder="e.g. NeuraMeet Core"
            className={inputClass}
            autoFocus
          />
          {error?.field === "name" && (
            <span role="alert" className="text-body-md text-error">{error.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-label-caps uppercase tracking-wider text-on-surface-variant">Task prefix</span>
          <input
            type="text"
            value={prefix}
            maxLength={5}
            onChange={(e) => {
              setPrefixEdited(true);
              setPrefix(e.target.value);
            }}
            placeholder="NM"
            className={`${inputClass} font-mono uppercase`}
          />
          <span className="text-body-md text-on-surface-variant">
            2 to 5 capital letters. Task keys look like {prefix || "NM"}-1. You can&apos;t change it later.
          </span>
          {error?.field === "prefix" && (
            <span role="alert" className="text-body-md text-error">{error.message}</span>
          )}
        </label>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || name.trim().length === 0}
            className="rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateProjectDialog;
