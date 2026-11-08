/* eslint-disable prettier/prettier */
"use client";

import { SkeletonCard } from "@/components/ui/skeleton";
import React, { useCallback, useEffect } from "react";
import { useCardLoad } from "@/components/projects/useCardLoad";
import { listMembers } from "@/lib/project-client";

type Props = {
  projectId: string;
  value: string[];
  onChange: (userIds: string[]) => void;
};

// AC-70u: defaults to every active member. Display and notice only, never who may join.
const ParticipantsPicker = ({ projectId, value, onChange }: Props) => {
  const load = useCardLoad(
    useCallback((signal: AbortSignal) => listMembers(projectId, signal), [projectId]),
  );
  const members = load.data?.members;

  useEffect(() => {
    if (members) onChange(members.map((member) => member.userId));
    // Only a finished load sets the default, never a later edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  const toggle = (userId: string) =>
    onChange(value.includes(userId) ? value.filter((id) => id !== userId) : [...value, userId]);

  return (
    <fieldset className="mt-4 flex flex-col gap-2.5">
      <legend className="mb-2.5 text-base font-normal leading-[22.4px] text-on-surface-variant">Participants</legend>
      {load.failed ? (
        <div className="flex flex-wrap items-center gap-3 text-body-md text-on-surface-variant">
          <span>We couldn&apos;t load the members. You can still schedule, with nobody listed.</span>
          <button type="button" onClick={load.retry} className="text-primary hover:underline">
            Try again
          </button>
        </div>
      ) : !members ? (
        <SkeletonCard />
      ) : (
        <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto">
          {members.map((member) => (
            <li key={member.userId}>
              <label className="flex items-center gap-2 text-body-md text-on-surface">
                <input
                  type="checkbox"
                  checked={value.includes(member.userId)}
                  onChange={() => toggle(member.userId)}
                />
                <span className="break-words">{member.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
};

export default ParticipantsPicker;
