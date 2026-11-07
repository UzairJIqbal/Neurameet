/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle2, Github, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createProject, ProjectClientError } from "@/lib/project-client";
import {
  PROJECT_COLORS,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_ICONS,
  PROJECT_NAME_MAX,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
  suggestTaskPrefix,
  type ProjectCard,
  type ProjectColor,
  type ProjectIcon,
  type ProjectType,
} from "@/lib/project-types";
import { PROJECT_COLOR_CLASSES, PROJECT_ICON_MAP, ProjectIconTile, ProjectRoleChip } from "./project-visuals";

type Props = {
  onClose: () => void;
  /** Fires when the project exists, before the success screen closes. */
  onCreated: (project: ProjectCard) => void;
};

const inputClass =
  "w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";
const labelClass = "text-label-caps uppercase tracking-wider text-on-surface-variant";
const primaryButton =
  "rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const outlineButton =
  "rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";

const SuccessScreen = ({
  project,
  connectGitHub,
  onClose,
}: {
  project: ProjectCard;
  connectGitHub: boolean;
  onClose: () => void;
}) => {
  const router = useRouter();
  const open = (query: string) => {
    onClose();
    router.push(`/projects/${project.id}${query}`);
  };
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
      <h2 id="create-project-title" className="text-headline-sm text-on-surface">
        {project.name} is ready
      </h2>
      <p className="text-body-md text-on-surface-variant">
        You&apos;re the Owner. Add members from the project page.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => open("")} className={connectGitHub ? outlineButton : primaryButton}>
          Open project
        </button>
        {connectGitHub && (
          <button
            type="button"
            onClick={() => open("?tab=github")}
            className={cn(primaryButton, "inline-flex items-center gap-2")}
          >
            <Github className="h-4 w-4" aria-hidden />
            Connect GitHub
          </button>
        )}
      </div>
    </div>
  );
};

// AC-70h: details with a live preview. The prefix follows the name until you
// edit it; the server checks everything again and its 422 shows by the field.
const CreateProjectDialog = ({ onClose, onCreated }: Props) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("other");
  const [icon, setIcon] = useState<ProjectIcon>("folder");
  const [color, setColor] = useState<ProjectColor>("primary");
  const [prefix, setPrefix] = useState("");
  const [prefixEdited, setPrefixEdited] = useState(false);
  const [connectGitHub, setConnectGitHub] = useState(false);
  const [created, setCreated] = useState<ProjectCard | null>(null);
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
      const { project } = await createProject({
        name,
        taskPrefix: prefix,
        description: description.trim() || undefined,
        projectType,
        icon,
        color,
      });
      setCreated(project);
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

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
          className="w-full max-w-md rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-lg"
        >
          <SuccessScreen project={created} connectGitHub={connectGitHub} onClose={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4 py-6">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        onSubmit={handleSubmit}
        className="flex max-h-full w-full max-w-4xl flex-col gap-5 overflow-y-auto rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 id="create-project-title" className="text-headline-sm text-on-surface">
            New Project
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <div className="flex min-w-0 flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Name</span>
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
              <span className={labelClass}>Description (optional)</span>
              <textarea
                value={description}
                rows={3}
                maxLength={PROJECT_DESCRIPTION_MAX}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this project is for"
                className={inputClass}
              />
              <span className="text-right text-xs text-on-surface-variant">
                {description.length} of {PROJECT_DESCRIPTION_MAX}
              </span>
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className={cn(labelClass, "mb-2")}>Project type</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PROJECT_TYPES.map((type) => (
                  <label
                    key={type}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-body-md text-on-surface",
                      projectType === type ? "border-primary bg-surface-container-low" : "border-surface-variant",
                    )}
                  >
                    <input
                      type="radio"
                      name="project-type"
                      checked={projectType === type}
                      onChange={() => setProjectType(type)}
                      className="accent-primary"
                    />
                    {PROJECT_TYPE_LABELS[type]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col gap-2">
                <span className={labelClass}>Icon</span>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_ICONS.map((key) => {
                    const Icon = PROJECT_ICON_MAP[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-label={`Icon ${key}`}
                        aria-pressed={icon === key}
                        onClick={() => setIcon(key)}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg border text-on-surface",
                          icon === key ? "border-primary bg-surface-container-low" : "border-surface-variant",
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className={labelClass}>Color</span>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_COLORS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={`Color ${key}`}
                      aria-pressed={color === key}
                      onClick={() => setColor(key)}
                      className={cn(
                        "h-9 w-9 rounded-full border-2",
                        PROJECT_COLOR_CLASSES[key],
                        color === key ? "border-on-surface" : "border-transparent",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <span className={labelClass}>Preview</span>
            <div className="flex flex-col gap-3 rounded-lg border border-surface-variant p-4">
              <ProjectIconTile icon={icon} color={color} />
              <p className="break-words font-medium text-on-surface">{name.trim() || "Untitled project"}</p>
              <p className="break-words text-body-md text-on-surface-variant">
                {description.trim() || "Your description will appear here."}
              </p>
              <p className="text-body-md text-on-surface-variant">{PROJECT_TYPE_LABELS[projectType]}</p>
              <div className="flex items-center gap-2">
                <ProjectRoleChip role="owner" />
                <span className="text-body-md text-on-surface-variant">You</span>
              </div>
              <p className="inline-flex items-center gap-2 text-body-md text-on-surface-variant">
                <Github className="h-4 w-4" aria-hidden />
                No repository
              </p>
            </div>

            <label className="flex flex-col gap-2">
              <span className={labelClass}>Task prefix</span>
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

            <label className="flex items-start gap-2 text-body-md text-on-surface">
              <input
                type="checkbox"
                checked={connectGitHub}
                onChange={(e) => setConnectGitHub(e.target.checked)}
                className="mt-1 accent-primary"
              />
              Connect GitHub next
            </label>
          </aside>
        </div>

        <p className="text-body-md text-on-surface-variant">
          Members are added after creation. You&apos;ll be the project Owner.
        </p>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className={outlineButton}>
            Cancel
          </button>
          <button type="submit" disabled={busy || name.trim().length === 0} className={primaryButton}>
            {busy ? "Creating..." : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateProjectDialog;
