/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import InvitesPanel from "@/components/projects/InvitesPanel";
import {
  changeMemberRole,
  deleteProject,
  listMembers,
  removeMember,
  transferOwnership,
} from "@/lib/project-client";
import {
  assignableRoles,
  canManageInvites,
  canRemoveMember,
  ROLE_LABELS,
  type ProjectDetail,
  type ProjectMember,
  type ProjectRole,
} from "@/lib/project-types";

type Props = {
  project: ProjectDetail;
  onProjectChanged: () => void;
};

const selectClass =
  "rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface";
const secondaryButton =
  "rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const dangerButton =
  "rounded-lg bg-error px-4 py-2 text-body-md text-on-primary hover:opacity-90 disabled:opacity-50";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

// Every control here is a convenience: it shows only where your role allows,
// and the server checks the same rule again on each call.
const MembersTab = ({ project, onProjectChanged }: Props) => {
  const router = useRouter();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [myRole, setMyRole] = useState<ProjectRole>(project.role);
  const [me, setMe] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await listMembers(project.id, controller.signal);
        setMembers(data.members);
        setMyRole(data.myRole);
        setMe(data.me);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load members:", err);
        toast.error(errorText(err, "Failed to load members"));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [project.id, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  const refresh = () => {
    setRetryNonce((k) => k + 1);
    onProjectChanged();
  };

  const handleRole = async (member: ProjectMember, role: ProjectRole) => {
    setBusyUser(member.userId);
    try {
      await changeMemberRole(project.id, member.userId, role);
      setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, role } : m)));
      toast.success(`${member.name} is now ${ROLE_LABELS[role]}`);
    } catch (err) {
      toast.error(errorText(err, "Failed to change role"));
    } finally {
      setBusyUser(null);
    }
  };

  const handleRemove = async (member: ProjectMember) => {
    try {
      await removeMember(project.id, member.userId);
      toast.success(`${member.name} was removed`);
      refresh();
    } catch (err) {
      toast.error(errorText(err, "Failed to remove member"));
    }
  };

  const handleLeave = async () => {
    try {
      await removeMember(project.id, me);
      toast.success("You left the project");
      router.push("/projects");
    } catch (err) {
      toast.error(errorText(err, "Failed to leave project"));
    }
  };

  const handleTransfer = async () => {
    if (!transferTo) return;
    try {
      await transferOwnership(project.id, transferTo);
      toast.success("Ownership transferred. You are now an Admin.");
      setTransferTo("");
      refresh();
    } catch (err) {
      toast.error(errorText(err, "Failed to transfer ownership"));
    }
  };

  const handleDelete = async () => {
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

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load the members."
        onRetry={() => setRetryNonce((k) => k + 1)}
        listHref="/projects"
        listLabel="Back to projects"
      />
    );
  }

  if (isLoading && members.length === 0) return <LoaderOne />;

  const admins = members.filter((m) => m.role === "admin" && m.userId !== me);

  return (
    <div className="flex flex-col gap-8">
      <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest">
        <div className="hidden grid-cols-12 gap-4 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant md:grid">
          <div className="col-span-5">Member</div>
          <div className="col-span-3">Role</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <ul className="divide-y divide-surface-variant">
          {members.map((m) => {
            const isMe = m.userId === me;
            const roles = isMe ? [] : assignableRoles(myRole, m.role);
            const removable = !isMe && canRemoveMember(myRole, m.role);
            return (
              <li key={m.userId} className="grid grid-cols-12 items-center gap-4 px-6 py-4">
                <div className="col-span-12 flex min-w-0 flex-col md:col-span-5">
                  <span className="truncate text-body-md font-medium text-on-surface">
                    {m.name}
                    {isMe && <span className="text-on-surface-variant"> (you)</span>}
                  </span>
                  {m.email && <span className="truncate text-body-md text-on-surface-variant">{m.email}</span>}
                </div>
                <div className="col-span-6 md:col-span-3">
                  {roles.length > 0 ? (
                    <select
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      disabled={busyUser === m.userId}
                      onChange={(e) => handleRole(m, e.target.value as ProjectRole)}
                      className={selectClass}
                    >
                      {!roles.includes(m.role) && <option value={m.role}>{ROLE_LABELS[m.role]}</option>}
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-surface-container px-3 py-1 text-label-caps uppercase tracking-wider text-on-surface-variant">
                      {ROLE_LABELS[m.role]}
                    </span>
                  )}
                </div>
                <div className="col-span-6 text-body-md text-on-surface-variant md:col-span-2">
                  {new Date(m.joinedAt).toLocaleDateString()}
                </div>
                <div className="col-span-12 flex justify-end md:col-span-2">
                  {removable && (
                    <ConfirmDelete
                      size="sm"
                      label={`Remove ${m.name}`}
                      confirmLabel="Remove"
                      onConfirm={() => handleRemove(m)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {canManageInvites(myRole) && (
        <InvitesPanel projectId={project.id} myRole={myRole} onMembersChanged={refresh} />
      )}

      {myRole !== "owner" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-5">
          <p className="text-body-md text-on-surface-variant">You lose access to this project and its meetings right away.</p>
          <ConfirmDelete label="Leave project" confirmLabel="Leave project" onConfirm={handleLeave} />
        </div>
      )}

      {myRole === "owner" && (
        <div className="flex flex-col gap-4 rounded-xl border border-surface-variant bg-surface-container-lowest p-5">
          <h2 className="text-headline-sm text-on-surface">Transfer ownership</h2>
          <p className="text-body-md text-on-surface-variant">
            Choose an Admin. They become the Owner and you become an Admin.
          </p>
          {admins.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Make someone an Admin first.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="New owner"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                className={selectClass}
              >
                <option value="">Choose an Admin</option>
                {admins.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!transferTo} onClick={handleTransfer} className={secondaryButton}>
                Transfer ownership
              </button>
            </div>
          )}
        </div>
      )}

      {myRole === "owner" && (
        <div className="flex flex-col gap-4 rounded-xl border border-error-container bg-error-container/20 p-5">
          <h2 className="text-headline-sm text-on-surface">Delete project</h2>
          <p className="text-body-md text-on-surface-variant">
            This deletes the project and all {project.meetingCount} of its meetings, with their transcripts, insights, and
            ledger. Type <span className="font-medium text-on-surface">{project.name}</span> to confirm.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              aria-label="Type the project name to confirm"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className={`${selectClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              disabled={confirmName !== project.name || deleting}
              onClick={handleDelete}
              className={dangerButton}
            >
              {deleting ? "Deleting..." : "Delete project"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MembersTab;
