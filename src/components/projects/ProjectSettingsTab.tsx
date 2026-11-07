/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { LoadError } from "@/components/ui/load-error";
import {
  deleteProject,
  listMembers,
  transferOwnership,
  updateProject,
} from "@/lib/project-client";
import {
  PROJECT_COLORS,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_ICONS,
  PROJECT_NAME_MAX,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
  type ProjectColor,
  type ProjectFull,
  type ProjectIcon,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/project-types";
import { PROJECT_COLOR_CLASSES, PROJECT_ICON_MAP } from "./project-visuals";
import { useCardLoad } from "./useCardLoad";

type Props = {
  project: ProjectFull;
  onProjectChanged: () => void;
};

const CARD = "flex flex-col gap-4 rounded-lg border border-surface-variant bg-surface-container-lowest p-5";
const FIELD = "rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface disabled:opacity-60";
const LABEL = "text-label-caps uppercase tracking-wider text-on-surface-variant";
const MUTED = "text-body-md text-on-surface-variant";
const PRIMARY_BUTTON =
  "self-start rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const OUTLINE_BUTTON =
  "rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const DANGER_BUTTON = "rounded-lg bg-error px-4 py-2 text-body-md text-on-primary hover:opacity-90 disabled:opacity-50";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const DetailsCard = ({ project, onProjectChanged }: Props) => {
  const canEdit = project.role === "owner";
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [projectType, setProjectType] = useState<ProjectType>(project.projectType);
  const [icon, setIcon] = useState<ProjectIcon>(project.icon);
  const [color, setColor] = useState<ProjectColor>(project.color);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProject(project.id, {
        name,
        description: description.trim() || null,
        status,
        projectType,
        icon,
        color,
      });
      toast.success("Project saved");
      onProjectChanged();
    } catch (err) {
      toast.error(errorText(err, "Failed to save the project"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className={CARD} aria-label="Project details">
      <h2 className="text-headline-sm text-on-surface">Project details</h2>
      {!canEdit && <p className={MUTED}>Only the Owner changes these.</p>}

      <label className="flex flex-col gap-2">
        <span className={LABEL}>Name</span>
        <input
          type="text"
          value={name}
          maxLength={PROJECT_NAME_MAX}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={LABEL}>Description</span>
        <textarea
          value={description}
          rows={3}
          maxLength={PROJECT_DESCRIPTION_MAX}
          disabled={!canEdit}
          onChange={(e) => setDescription(e.target.value)}
          className={FIELD}
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Status</span>
          <select
            value={status}
            disabled={!canEdit}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            className={FIELD}
          >
            {PROJECT_STATUSES.map((key) => (
              <option key={key} value={key}>
                {PROJECT_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL}>Type</span>
          <select
            value={projectType}
            disabled={!canEdit}
            onChange={(e) => setProjectType(e.target.value as ProjectType)}
            className={FIELD}
          >
            {PROJECT_TYPES.map((key) => (
              <option key={key} value={key}>
                {PROJECT_TYPE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Icon</span>
          <div className="flex flex-wrap gap-2">
            {PROJECT_ICONS.map((key) => {
              const Icon = PROJECT_ICON_MAP[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`Icon ${key}`}
                  aria-pressed={icon === key}
                  disabled={!canEdit}
                  onClick={() => setIcon(key)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg border text-on-surface disabled:opacity-60",
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
          <span className={LABEL}>Color</span>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((key) => (
              <button
                key={key}
                type="button"
                aria-label={`Color ${key}`}
                aria-pressed={color === key}
                disabled={!canEdit}
                onClick={() => setColor(key)}
                className={cn(
                  "h-9 w-9 rounded-full border-2 disabled:opacity-60",
                  PROJECT_COLOR_CLASSES[key],
                  color === key ? "border-on-surface" : "border-transparent",
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {canEdit && (
        <button type="submit" disabled={saving || name.trim().length === 0} className={PRIMARY_BUTTON}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      )}
    </form>
  );
};

const TransferCard = ({ project, onProjectChanged }: Props) => {
  const load = useCardLoad(useCallback((signal: AbortSignal) => listMembers(project.id, signal), [project.id]));
  const [transferTo, setTransferTo] = useState("");

  const transfer = async () => {
    if (!transferTo) return;
    try {
      await transferOwnership(project.id, transferTo);
      toast.success("Ownership transferred. You are now an Admin.");
      setTransferTo("");
      onProjectChanged();
    } catch (err) {
      toast.error(errorText(err, "Failed to transfer ownership"));
    }
  };

  const admins = load.data ? load.data.members.filter((m) => m.role === "admin" && m.userId !== load.data?.me) : [];

  return (
    <section className={CARD} aria-label="Transfer ownership">
      <h2 className="text-headline-sm text-on-surface">Transfer ownership</h2>
      <p className={MUTED}>Choose an Admin. They become the Owner and you become an Admin.</p>
      {load.failed ? (
        <LoadError compact message="We couldn't load the members." onRetry={load.retry} />
      ) : !load.data ? (
        <p className={MUTED}>Loading...</p>
      ) : admins.length === 0 ? (
        <p className={MUTED}>Make someone an Admin first.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="New owner"
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            className={FIELD}
          >
            <option value="">Choose an Admin</option>
            {admins.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={!transferTo} onClick={transfer} className={OUTLINE_BUTTON}>
            Transfer ownership
          </button>
        </div>
      )}
    </section>
  );
};

const DeleteCard = ({ project }: { project: ProjectFull }) => {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteProject(project.id, confirmName);
      toast.success("Project deleted");
      router.push("/projects");
    } catch (err) {
      toast.error(errorText(err, "Failed to delete project"));
      setDeleting(false);
    }
  };

  return (
    <section
      aria-label="Delete project"
      className="flex flex-col gap-4 rounded-lg border border-error-container bg-error-container/20 p-5"
    >
      <h2 className="text-headline-sm text-on-surface">Delete project</h2>
      <p className={MUTED}>
        This deletes the project and all {project.meetingCount} of its meetings, with their transcripts, insights, and
        ledger. Type <span className="font-medium text-on-surface">{project.name}</span> to confirm.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          aria-label="Type the project name to confirm"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          className={`${FIELD} min-w-0 flex-1`}
        />
        <button
          type="button"
          disabled={confirmName !== project.name || deleting}
          onClick={remove}
          className={DANGER_BUTTON}
        >
          {deleting ? "Deleting..." : "Delete project"}
        </button>
      </div>
    </section>
  );
};

// AC-70e: Owner only through the existing routes. An Admin reads the details.
const ProjectSettingsTab = ({ project, onProjectChanged }: Props) => (
  <div className="flex flex-col gap-6">
    <DetailsCard project={project} onProjectChanged={onProjectChanged} />
    {project.role === "owner" && (
      <>
        <TransferCard project={project} onProjectChanged={onProjectChanged} />
        <DeleteCard project={project} />
      </>
    )}
  </div>
);

export default ProjectSettingsTab;
