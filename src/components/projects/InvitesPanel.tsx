/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { UserPlus } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import InviteDialog from "@/components/projects/InviteDialog";
import {
  decideJoinRequest,
  listInvitations,
  listJoinRequests,
  revokeInvitation,
} from "@/lib/project-client";
import {
  ROLE_LABELS,
  type InvitationSummary,
  type JoinRequestSummary,
  type ProjectRole,
} from "@/lib/project-types";

type Props = {
  projectId: string;
  myRole: ProjectRole;
  /** Reload the members list after someone is approved. */
  onMembersChanged: () => void;
};

const secondaryButton =
  "rounded-lg border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const primaryButton =
  "inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const cardClass = "flex flex-col gap-4 rounded-xl border border-surface-variant bg-surface-container-lowest p-5";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const dateOf = (iso: string) => new Date(iso).toLocaleDateString();

// Owner and Admin only (the parent decides). Invite button, active invites
// with Revoke, and pending join requests with Approve and Deny.
const InvitesPanel = ({ projectId, myRole, onMembersChanged }: Props) => {
  const [invites, setInvites] = useState<InvitationSummary[]>([]);
  const [requests, setRequests] = useState<JoinRequestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyRequest, setBusyRequest] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        const [inv, req] = await Promise.all([
          listInvitations(projectId, controller.signal),
          listJoinRequests(projectId, controller.signal),
        ]);
        setInvites(inv.invitations);
        setRequests(req.requests);
        setLoaded(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load invites:", err);
        toast.error(errorText(err, "Failed to load invites"));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [projectId, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  const reload = () => setRetryNonce((k) => k + 1);

  const handleRevoke = async (invite: InvitationSummary) => {
    try {
      await revokeInvitation(projectId, invite.id);
      toast.success("Invite revoked");
      reload();
    } catch (err) {
      toast.error(errorText(err, "Failed to revoke invite"));
    }
  };

  const handleDecide = async (req: JoinRequestSummary, decision: "approve" | "deny") => {
    setBusyRequest(req.id);
    try {
      await decideJoinRequest(projectId, req.id, decision);
      toast.success(decision === "approve" ? `${req.displayName} joined` : "Request denied");
      reload();
      if (decision === "approve") onMembersChanged();
    } catch (err) {
      toast.error(errorText(err, "Failed to decide request"));
      reload();
    } finally {
      setBusyRequest(null);
    }
  };

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load the invites."
        onRetry={reload}
        listHref="/projects"
        listLabel="Back to projects"
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <button type="button" onClick={() => setDialogOpen(true)} className={primaryButton}>
          <UserPlus className="h-4 w-4" />
          Invite
        </button>
      </div>

      {isLoading && !loaded ? (
        <LoaderOne />
      ) : (
        <>
          <section className={cardClass} aria-labelledby="join-requests-title">
            <h2 id="join-requests-title" className="text-headline-sm text-on-surface">
              Join requests
            </h2>
            {requests.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No one is waiting.</p>
            ) : (
              <ul className="divide-y divide-surface-variant">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-body-md font-medium text-on-surface">{r.displayName}</span>
                      <span className="truncate text-body-md text-on-surface-variant">
                        {r.email ? `${r.email} · ` : ""}
                        {ROLE_LABELS[r.role]} · asked {dateOf(r.createdAt)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyRequest === r.id}
                        onClick={() => handleDecide(r, "approve")}
                        className={secondaryButton}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyRequest === r.id}
                        onClick={() => handleDecide(r, "deny")}
                        className={secondaryButton}
                      >
                        Deny
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cardClass} aria-labelledby="active-invites-title">
            <h2 id="active-invites-title" className="text-headline-sm text-on-surface">
              Active invites
            </h2>
            {invites.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No active invites.</p>
            ) : (
              <ul className="divide-y divide-surface-variant">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-body-md font-medium text-on-surface">
                        {i.kind === "email" ? i.email : "Link"}
                      </span>
                      <span className="truncate text-body-md text-on-surface-variant">
                        {ROLE_LABELS[i.role]} · expires {dateOf(i.expiresAt)} · by {i.createdByName}
                      </span>
                    </div>
                    <ConfirmDelete
                      size="sm"
                      label="Revoke invite"
                      confirmLabel="Revoke"
                      warning={i.kind === "link" ? "Waiting requests from this link are denied" : undefined}
                      onConfirm={() => handleRevoke(i)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {dialogOpen && (
        <InviteDialog
          projectId={projectId}
          myRole={myRole}
          onClose={() => setDialogOpen(false)}
          onCreated={reload}
        />
      )}
    </div>
  );
};

export default InvitesPanel;
