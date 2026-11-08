/* eslint-disable prettier/prettier */
"use client";

import { SkeletonCard } from "@/components/ui/skeleton";
import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { LoadError } from "@/components/ui/load-error";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { relativeTime } from "@/lib/chatHistory";
import {
  decideJoinRequest,
  listInvitations,
  listJoinRequests,
  resendInvitation,
  revokeInvitation,
} from "@/lib/project-client";
import {
  ROLE_LABELS,
  type InvitationSummary,
  type JoinRequestSummary,
} from "@/lib/project-types";

type Props = {
  projectId: string;
  /** Bumped by the parent after Add Members creates or disables an invite. */
  reloadNonce?: number;
  /** Reload the members list after someone is approved. */
  onMembersChanged: () => void;
};

type ResentLink = { invitationId: string; link: string };

const SECONDARY =
  "rounded-lg border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const CARD = "flex flex-col gap-4 rounded-lg border border-surface-variant bg-surface-container-lowest p-5";
const CHIP = "rounded-full bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface-variant";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const dateOf = (iso: string) => new Date(iso).toLocaleDateString();

const ageOf = (iso: string) => {
  const age = relativeTime(new Date(iso).getTime());
  return age === "now" ? "just now" : `${age} ago`;
};

const copyLink = async (link: string) => {
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy, select the link and copy it");
  }
};

// Owner and Admin only (the parent decides). Pending invitations with Resend and
// Revoke, and waiting join requests with Approve and Reject (AC-70j).
const InvitesPanel = ({ projectId, reloadNonce = 0, onMembersChanged }: Props) => {
  const [invites, setInvites] = useState<InvitationSummary[]>([]);
  const [requests, setRequests] = useState<JoinRequestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [busyRequest, setBusyRequest] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [resent, setResent] = useState<ResentLink | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        setFailed(false);
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
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [projectId, retryNonce, reloadNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  const reload = () => setRetryNonce((k) => k + 1);

  const handleResend = async (invite: InvitationSummary) => {
    setBusyInvite(invite.id);
    setResent(null);
    try {
      const { link, emailed } = await resendInvitation(projectId, invite.id);
      if (emailed) toast.success(`Invite sent again to ${invite.email}`);
      else setResent({ invitationId: invite.id, link });
      reload();
    } catch (err) {
      toast.error(errorText(err, "Failed to resend invite"));
      reload();
    } finally {
      setBusyInvite(null);
    }
  };

  const handleRevoke = async (invite: InvitationSummary) => {
    try {
      await revokeInvitation(projectId, invite.id);
      toast.success("Invite revoked");
      if (resent?.invitationId === invite.id) setResent(null);
      reload();
    } catch (err) {
      toast.error(errorText(err, "Failed to revoke invite"));
    }
  };

  const handleDecide = async (req: JoinRequestSummary, decision: "approve" | "deny") => {
    setBusyRequest(req.id);
    try {
      await decideJoinRequest(projectId, req.id, decision);
      toast.success(decision === "approve" ? `${req.displayName} joined` : "Request rejected");
      reload();
      if (decision === "approve") onMembersChanged();
    } catch (err) {
      toast.error(errorText(err, "Failed to decide request"));
      reload();
    } finally {
      setBusyRequest(null);
    }
  };

  if (timedOut || (failed && !loaded)) {
    return (
      <LoadError
        compact
        message="We couldn't load the invites."
        onRetry={reload}
        listHref="/projects"
        listLabel="Back to projects"
      />
    );
  }

  if (!loaded) return <SkeletonCard />;

  return (
    <div className="flex flex-col gap-6">
      {requests.length > 0 && (
        <section className={CARD} aria-labelledby="join-requests-title">
          <h2 id="join-requests-title" className="flex items-center gap-2 text-headline-sm text-on-surface">
            Join requests
            <span className={CHIP}>{requests.length}</span>
          </h2>
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
                    className={SECONDARY}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyRequest === r.id}
                    onClick={() => handleDecide(r, "deny")}
                    className={SECONDARY}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD} aria-labelledby="pending-invites-title">
        <h2 id="pending-invites-title" className="flex items-center gap-2 text-headline-sm text-on-surface">
          Pending invitations
          <span className={CHIP}>{invites.length}</span>
        </h2>
        {invites.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No pending invitations.</p>
        ) : (
          <ul className="divide-y divide-surface-variant">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-body-md font-medium text-on-surface">
                        {i.kind === "email" ? i.email : "Link"}
                      </span>
                      <span className={CHIP}>{ROLE_LABELS[i.role]}</span>
                      <span className={CHIP}>{i.kind === "email" ? "Invited by email" : "Invitation link"}</span>
                    </div>
                    <span className="text-body-md text-on-surface-variant">
                      Invited by {i.createdByName} {ageOf(i.createdAt)} · Expires {dateOf(i.expiresAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {i.kind === "email" && (
                      <button
                        type="button"
                        disabled={busyInvite === i.id}
                        aria-label={`Resend invite to ${i.email}`}
                        onClick={() => handleResend(i)}
                        className={SECONDARY}
                      >
                        Resend
                      </button>
                    )}
                    <ConfirmDelete
                      size="sm"
                      label="Revoke invite"
                      confirmLabel="Revoke"
                      warning={i.kind === "link" ? "Waiting requests from this link are denied" : undefined}
                      onConfirm={() => handleRevoke(i)}
                    />
                  </div>
                </div>
                {resent?.invitationId === i.id && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-container p-3 text-body-md text-on-warning-container">
                    <span>Email not sent, copy the link. It shows only once.</span>
                    <button type="button" onClick={() => copyLink(resent.link)} className="underline">
                      Copy link
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default InvitesPanel;
