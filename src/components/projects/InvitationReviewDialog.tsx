/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { relativeTime } from "@/lib/chatHistory";
import { decideMyInvitation, ProjectClientError } from "@/lib/project-client";
import type { MyInvitation, MyInvitationDecision } from "@/lib/project-types";
import { ProjectIconTile, ProjectRoleChip } from "./project-visuals";

type Props = {
  invitations: MyInvitation[];
  onClose: () => void;
  onDecided: (id: string) => void;
};

const ageLabel = (iso: string) => {
  const age = relativeTime(new Date(iso).getTime());
  return age === "now" ? "just now" : `${age} ago`;
};

// AC-70t: review your email invites from My Projects, without the token.
const InvitationReviewDialog = ({ invitations, onClose, onDecided }: Props) => {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const decide = async (invitation: MyInvitation, decision: MyInvitationDecision) => {
    setBusyId(invitation.id);
    try {
      const res = await decideMyInvitation(invitation.id, decision);
      onDecided(invitation.id);
      if (res.status === "joined") {
        toast.success("You joined the project");
        router.push(`/projects/${res.projectId}`);
        return;
      }
      toast.success("Invitation declined");
    } catch (err) {
      // Revoked, expired, or no longer yours: the row can't be acted on again.
      if (err instanceof ProjectClientError && [404, 410].includes(err.status)) {
        toast.error("This invite is no longer valid");
        onDecided(invitation.id);
        return;
      }
      toast.error("We couldn't update that invitation. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Project invitations"
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border border-surface-variant bg-surface-container-lowest p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-headline-sm text-on-surface">Project invitations</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low"
          >
            Close
          </button>
        </div>
        <ul className="flex flex-col divide-y divide-surface-variant">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex flex-col gap-3 py-3">
              <div className="flex items-start gap-3">
                <ProjectIconTile icon={invitation.icon} color={invitation.color} />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="break-words font-medium text-on-surface">{invitation.projectName}</span>
                  <span className="text-xs text-on-surface-variant">
                    {invitation.inviterName} invited you {ageLabel(invitation.invitedAt)}
                  </span>
                  <ProjectRoleChip role={invitation.role} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => decide(invitation, "decline")}
                  aria-label={`Decline ${invitation.projectName}`}
                  className="rounded-lg border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => decide(invitation, "accept")}
                  aria-label={`Accept ${invitation.projectName}`}
                  className="rounded-lg bg-primary-container px-3 py-1.5 text-body-md text-on-primary hover:bg-primary disabled:opacity-50"
                >
                  Accept
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default InvitationReviewDialog;
