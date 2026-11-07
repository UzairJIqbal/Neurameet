/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import type { ProjectFull } from "@/lib/project-types";
import AssistantTab from "./AssistantTab";

const SUGGESTIONS = [
  "What did we decide about the database?",
  "Who is responsible for the authentication module?",
  "Which tasks are still pending?",
  "Which promises are overdue?",
];

// AC-70n: the W7 panel, with suggested questions and what it can answer from.
const ProjectAssistant = ({ project }: { project: ProjectFull }) => {
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const taskCount = Object.values(project.taskTotals ?? {}).reduce((sum, n) => sum + n, 0);
  const memory = [
    ["Processed meetings", project.processedMeetingCount ?? 0],
    ["Decisions", project.decisionCount ?? 0],
    ["Tasks", taskCount],
    ["Linked PRs", project.linkedPrCount ?? 0],
  ] as const;

  const chips = (
    <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
      {SUGGESTIONS.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => setPrefill((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 }))}
          className="rounded-full border border-surface-variant px-3 py-1 text-body-md text-on-surface-variant hover:bg-surface-container-low"
        >
          {text}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <AssistantTab
        projectId={project.id}
        heading={`Ask anything about ${project.name}`}
        prefill={prefill}
        aboveInput={chips}
      />
      <aside
        aria-label="Project Memory"
        className="flex flex-col gap-3 rounded-lg border border-surface-variant bg-surface-container-lowest p-4 lg:w-72 lg:shrink-0"
      >
        <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">Project Memory</h3>
        <p className="break-words text-body-md text-on-surface-variant">Answers come only from {project.name} records:</p>
        <dl className="flex flex-col gap-2">
          {memory.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-body-md">
              <dt className="text-on-surface-variant">{label}</dt>
              <dd className="font-medium text-on-surface">{count}</dd>
            </div>
          ))}
        </dl>
        <p className="rounded-lg border border-dashed border-surface-variant p-3 text-body-md text-on-surface-variant">
          It can&apos;t see your other projects or personal meetings.
        </p>
      </aside>
    </div>
  );
};

export default ProjectAssistant;
