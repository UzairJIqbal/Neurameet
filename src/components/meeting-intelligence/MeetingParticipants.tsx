/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useMemo } from "react";
import { listMembers } from "@/lib/project-client";
import { MemberAvatar } from "@/components/projects/project-visuals";
import { useCardLoad } from "@/components/projects/useCardLoad";

type Props = {
  projectId: string | null;
  organizerId: string;
  invitedUserIds: string[];
};

// AC-70v: the names people picked when scheduling, for display only. A failed
// load hides the row, and someone who left the project drops out of it.
const MeetingParticipants = ({ projectId, organizerId, invitedUserIds }: Props) => {
  const enabled = !!projectId && invitedUserIds.length > 0;
  const load = useCallback(
    (signal: AbortSignal) => listMembers(projectId ?? "", signal),
    [projectId],
  );
  const { data } = useCardLoad(load, enabled);

  const people = useMemo(() => {
    const ids = new Set([organizerId, ...invitedUserIds]);
    return (data?.members ?? []).filter((member) => ids.has(member.userId));
  }, [data, invitedUserIds, organizerId]);

  if (!enabled || people.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-surface-variant pt-4">
      <h2 className="text-label-caps uppercase tracking-wider text-on-surface-variant">Participants</h2>
      <ul className="flex flex-wrap gap-2">
        {people.map((person) => (
          <li
            key={person.userId}
            className="inline-flex items-center gap-2 rounded-full border border-surface-variant py-1 pl-1 pr-3 text-body-md text-on-surface"
          >
            <MemberAvatar name={person.name} imageUrl={person.imageUrl} />
            <span className="break-words">{person.name}</span>
            {person.userId === organizerId && (
              <span className="text-xs text-on-surface-variant">organizer</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MeetingParticipants;
