/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Github, MoreHorizontal, UserPlus, CalendarPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/chatHistory";
import { listMembers, removeMember, syncGitHub } from "@/lib/project-client";
import { syncSummary } from "@/lib/github-types";
import { canManageInvites, type ProjectFull } from "@/lib/project-types";
import {
  AvatarStack,
  CHIP_CLASS,
  ProjectIconTile,
  ProjectRoleChip,
  ProjectStatusChip,
} from "./project-visuals";

type Props = {
  project: ProjectFull;
  onAddMember: () => void;
  onSchedule: () => void;
  onOpenSettings: () => void;
  /** After a Sync, so the header and the open tab show fresh numbers. */
  onChanged: () => void;
};

const outlineButton =
  "inline-flex items-center gap-2 rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const primaryButton =
  "inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

/** "5h ago", or "just now" for the bare "now" relativeTime returns. */
export const ageLabel = (iso: string): string => {
  const age = relativeTime(new Date(iso).getTime());
  return age === "now" ? "just now" : `${age} ago`;
};

// A Viewer gets public repos only (AC-70g), so `connected` with no repo name
// means a private repo they may not see named.
const GitHubStatus = ({ github }: { github: ProjectFull["github"] }) => {
  if (!github.connected) {
    return <span className="text-body-md text-on-surface-variant">GitHub not connected</span>;
  }
  const first = github.repos[0];
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-body-md text-on-surface-variant">
      <Github className="h-4 w-4" aria-hidden />
      {first ? (
        <>
          <span className="break-all font-mono text-label-mono text-on-surface">{first.fullName}</span>
          {github.repos.length > 1 && <span>+{github.repos.length - 1}</span>}
          {github.lastSyncedAt && (
            <span className={`${CHIP_CLASS} bg-success-container text-on-success-container`}>
              Synced {ageLabel(github.lastSyncedAt)}
            </span>
          )}
        </>
      ) : (
        "Repository connected"
      )}
    </span>
  );
};

const LeaveDialog = ({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-project-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-lg"
      >
        <h2 id="leave-project-title" className="text-headline-sm text-on-surface">
          Leave this project?
        </h2>
        <p className="text-body-md text-on-surface-variant">
          You lose access to this project and its meetings right away.
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className={outlineButton}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-error px-4 py-2 text-body-md text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Leaving..." : "Leave project"}
          </button>
        </div>
      </div>
    </div>
  );
};

// The header on every tab (AC-70g). Each control shows only where your role
// allows it; the server checks the same rule again on each call.
const ProjectHeader = ({ project, onAddMember, onSchedule, onOpenSettings, onChanged }: Props) => {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busyLeave, setBusyLeave] = useState(false);

  const { role, github } = project;
  const canManage = canManageInvites(role);
  const canSchedule = role !== "viewer";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/projects/${project.id}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      toast.success(syncSummary(await syncGitHub(project.id)));
      onChanged();
    } catch (err) {
      toast.error(errorText(err, "Failed to sync with GitHub"));
    } finally {
      setSyncing(false);
    }
  };

  const leave = async () => {
    setBusyLeave(true);
    try {
      const { me } = await listMembers(project.id);
      await removeMember(project.id, me);
      toast.success("You left the project");
      router.push("/projects");
    } catch (err) {
      toast.error(errorText(err, "Failed to leave project"));
      setBusyLeave(false);
    }
  };

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <ProjectIconTile icon={project.icon} color={project.color} size="lg" />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-headline-md text-on-surface">{project.name}</h1>
            <ProjectStatusChip status={project.status} />
            <ProjectRoleChip role={role} />
          </div>
          {project.description && (
            <p className="break-words text-body-md text-on-surface-variant">{project.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-md text-on-surface-variant">
            {project.ownerName && <span>Owner {project.ownerName}</span>}
            {project.avatars.length > 0 && (
              <span className="inline-flex items-center gap-2">
                <AvatarStack avatars={project.avatars} total={project.memberCount} />
                {project.memberCount} member{project.memberCount === 1 ? "" : "s"}
              </span>
            )}
            <GitHubStatus github={github} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <button type="button" onClick={onAddMember} className={outlineButton}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Add Member
          </button>
        )}
        {canSchedule && (
          <button type="button" onClick={onSchedule} className={primaryButton}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Schedule Meeting
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More" className={outlineButton}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canManage && <DropdownMenuItem onSelect={onOpenSettings}>Project settings</DropdownMenuItem>}
            <DropdownMenuItem onSelect={copyLink}>Copy link</DropdownMenuItem>
            {canManage && github.connected && (
              <DropdownMenuItem disabled={syncing} onSelect={runSync}>
                {syncing ? "Syncing..." : "Sync GitHub"}
              </DropdownMenuItem>
            )}
            {role !== "owner" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setLeaving(true)}>Leave project</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {leaving && <LeaveDialog busy={busyLeave} onCancel={() => setLeaving(false)} onConfirm={leave} />}
    </header>
  );
};

export default ProjectHeader;
