/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { MemberAvatar } from "@/components/projects/project-visuals";
import MembersTab from "@/components/projects/MembersTab";
import { listMembers } from "@/lib/project-client";
import { ROLE_LABELS, type ProjectFull, type ProjectMember } from "@/lib/project-types";

type Props = {
  project: ProjectFull;
  onProjectChanged: () => void;
  onAddMember: () => void;
  invitesNonce: number;
};

// One slim card above the board: who is on the project, in a single row. No
// spinner, so a failed load just leaves the card without names. "Manage"
// opens the full member list (roles, removal, invites) underneath.
const MembersStrip = ({ project, onProjectChanged, onAddMember, invitesNonce }: Props) => {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listMembers(project.id, controller.signal)
      .then((data) => setMembers(data.members))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.error("[members] strip load failed:", err);
      });
    return () => controller.abort();
  }, [project.id, invitesNonce]);

  return (
    <section aria-label="Members" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card bg-surface-container-lowest px-4 py-3 shadow-card">
        <span className="text-label-caps uppercase tracking-wider text-on-surface-variant">Members</span>
        <ul className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
          {members.map((m) => (
            <li key={m.userId} className="flex shrink-0 items-center gap-2">
              <MemberAvatar name={m.name} imageUrl={m.imageUrl} />
              <span className="text-body-md text-on-surface">{m.name}</span>
              <span className="text-xs text-on-surface-variant">{ROLE_LABELS[m.role]}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-expanded={managing}
          onClick={() => setManaging((v) => !v)}
          className="text-body-md font-medium text-primary hover:underline"
        >
          {managing ? "Hide" : "Manage"}
        </button>
      </div>
      {managing && (
        <MembersTab
          project={project}
          onProjectChanged={onProjectChanged}
          onAddMember={onAddMember}
          invitesNonce={invitesNonce}
        />
      )}
    </section>
  );
};

export default MembersStrip;
