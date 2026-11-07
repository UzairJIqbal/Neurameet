/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Github, MoreHorizontal } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import InvitesPanel from "@/components/projects/InvitesPanel";
import { MemberAvatar } from "@/components/projects/project-visuals";
import {
  changeMemberRole,
  listMembers,
  removeMember,
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
import { cn } from "@/lib/utils";

type Props = {
  project: ProjectDetail;
  onProjectChanged: () => void;
  onAddMember?: () => void;
  /** Bumped by the parent after Add Members creates an invite. */
  invitesNonce?: number;
};

type RoleFilter = "all" | ProjectRole;
type PendingAction = { kind: "remove"; member: ProjectMember } | { kind: "leave" };

const ROLE_CHIPS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admins" },
  { value: "developer", label: "Developers" },
  { value: "viewer", label: "Viewers" },
];

const HEAD = "px-3 py-2 text-left text-label-caps uppercase tracking-wider text-on-surface-variant";
const CELL = "px-3 py-2 align-middle text-body-md text-on-surface-variant";
const INPUT =
  "w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none sm:max-w-xs";
const SELECT =
  "rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface";
const PRIMARY =
  "rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const SECONDARY =
  "rounded-lg border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const matchesSearch = (member: ProjectMember, query: string) =>
  member.name.toLowerCase().includes(query) ||
  (member.email ?? "").toLowerCase().includes(query);

const ConfirmActionDialog = ({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: PendingAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const isLeave = action.kind === "leave";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isLeave ? "Leave project" : `Remove ${action.member.name}`}
        className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-surface-container-lowest p-5"
      >
        <h2 className="text-headline-sm text-on-surface">
          {isLeave ? "Leave this project?" : `Remove ${action.member.name}?`}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {isLeave
            ? "You lose access to this project and its meetings right away."
            : "They lose access to this project and its meetings right away. Their open tasks go Unassigned."}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className={SECONDARY}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={PRIMARY}>
            {isLeave ? "Leave project" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Every control here is a convenience: it shows only where your role allows,
// and the server checks the same rule again on each call.
const MembersTab = ({ project, onProjectChanged, onAddMember, invitesNonce = 0 }: Props) => {
  const router = useRouter();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [myRole, setMyRole] = useState<ProjectRole>(project.role);
  const [me, setMe] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [acting, setActing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        setFailed(false);
        const data = await listMembers(project.id, controller.signal);
        setMembers(data.members);
        setMyRole(data.myRole);
        setMe(data.me);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load members:", err);
        setFailed(true);
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

  const counts = useMemo(() => {
    const byRole: Record<RoleFilter, number> = {
      all: members.length,
      owner: 0,
      admin: 0,
      developer: 0,
      viewer: 0,
    };
    for (const member of members) byRole[member.role] += 1;
    return byRole;
  }, [members]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter(
      (m) => (roleFilter === "all" || m.role === roleFilter) && (!query || matchesSearch(m, query)),
    );
  }, [members, roleFilter, search]);

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

  const confirmPending = async () => {
    if (!pending) return;
    setActing(true);
    try {
      if (pending.kind === "leave") {
        await removeMember(project.id, me);
        toast.success("You left the project");
        router.push("/projects");
        return;
      }
      await removeMember(project.id, pending.member.userId);
      toast.success(`${pending.member.name} was removed`);
      refresh();
      setPending(null);
    } catch (err) {
      const fallback = pending.kind === "leave" ? "Failed to leave project" : "Failed to remove member";
      toast.error(errorText(err, fallback));
    } finally {
      setActing(false);
    }
  };

  if (timedOut || (failed && members.length === 0)) {
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

  return (
    <div className="flex flex-col gap-6">
      {members.length === 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-variant bg-surface-container-lowest p-5">
          <p className="text-body-md text-on-surface-variant">Only you are here so far.</p>
          {canManageInvites(myRole) && onAddMember && (
            <button type="button" onClick={onAddMember} className={PRIMARY}>
              Add Member
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Search members"
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={INPUT}
        />
        <div className="flex flex-wrap gap-1">
          {ROLE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              aria-pressed={roleFilter === chip.value}
              onClick={() => setRoleFilter(chip.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                roleFilter === chip.value
                  ? "bg-primary-container text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-low",
              )}
            >
              {chip.label} ({counts[chip.value]})
            </button>
          ))}
        </div>
        {canManageInvites(myRole) && onAddMember && members.length > 1 && (
          <button type="button" onClick={onAddMember} className={cn(PRIMARY, "ml-auto")}>
            Add Members
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-surface-variant bg-surface-container-lowest p-5 text-body-md text-on-surface-variant">
          No members match your search.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-variant bg-surface-container-lowest">
          <table className="w-full min-w-[48rem]">
            <thead className="border-b border-surface-variant">
              <tr>
                <th className={HEAD}>Member</th>
                <th className={HEAD}>Role</th>
                <th className={HEAD}>GitHub</th>
                <th className={HEAD}>Open tasks</th>
                <th className={HEAD}>Joined</th>
                <th className={HEAD}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-variant">
              {visible.map((m) => {
                const isMe = m.userId === me;
                const roles = isMe ? [] : assignableRoles(myRole, m.role);
                const removable = !isMe && canRemoveMember(myRole, m.role);
                const canLeave = isMe && myRole !== "owner";
                return (
                  <tr key={m.userId}>
                    <td className={CELL}>
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar name={m.name} imageUrl={m.imageUrl} className="h-8 w-8" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-on-surface">
                            {m.name}
                            {isMe && <span className="text-on-surface-variant"> (you)</span>}
                          </span>
                          {m.email && <span className="truncate">{m.email}</span>}
                        </div>
                      </div>
                    </td>
                    <td className={CELL}>
                      {roles.length > 0 ? (
                        <select
                          aria-label={`Role for ${m.name}`}
                          value={m.role}
                          disabled={busyUser === m.userId}
                          onChange={(e) => handleRole(m, e.target.value as ProjectRole)}
                          className={SELECT}
                        >
                          {!roles.includes(m.role) && <option value={m.role}>{ROLE_LABELS[m.role]}</option>}
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                          {ROLE_LABELS[m.role]}
                        </span>
                      )}
                    </td>
                    <td className={CELL}>
                      {m.githubLogin && (
                        <span className="inline-flex items-center gap-1 font-label-mono text-label-mono">
                          <Github className="h-4 w-4" aria-hidden="true" />
                          {m.githubLogin}
                        </span>
                      )}
                    </td>
                    <td className={`${CELL} font-mono`}>{m.openTaskCount}</td>
                    <td className={CELL}>{new Date(m.joinedAt).toLocaleDateString()}</td>
                    <td className={`${CELL} text-right`}>
                      {(removable || canLeave) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Actions for ${m.name}`}
                            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-low"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() =>
                                setPending(canLeave ? { kind: "leave" } : { kind: "remove", member: m })
                              }
                            >
                              {canLeave ? "Leave project" : "Remove"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManageInvites(myRole) && (
        <InvitesPanel projectId={project.id} reloadNonce={invitesNonce} onMembersChanged={refresh} />
      )}

      {pending && (
        <ConfirmActionDialog
          action={pending}
          busy={acting}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
};

export default MembersTab;
