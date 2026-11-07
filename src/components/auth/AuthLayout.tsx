"use client";

import React from "react";
import {
  IconChecklist,
  IconCircleCheck,
  IconGitPullRequest,
  IconVideo,
} from "@tabler/icons-react";

interface AuthLayoutProps {
  children: React.ReactNode;
  variant: "sign-in" | "sign-up";
}

interface ChainCard {
  icon: typeof IconVideo;
  kind: string;
  title: string;
  detail: string;
}

interface AuthVariantContent {
  heading: string;
  sub: string;
}

// The Proof Chain, one card per link. Each card is nudged right a little more
// than the one above so the stack reads as a staircase (UI Overview, Sign In).
const chain: ChainCard[] = [
  {
    icon: IconVideo,
    kind: "Meeting",
    title: "Sprint Planning",
    detail: 'Ali: "I\'ll take the Login API."',
  },
  {
    icon: IconChecklist,
    kind: "Task",
    title: "ECP-15 Implement Login API",
    detail: "Assigned to Ali Hassan · Issue #42",
  },
  {
    icon: IconGitPullRequest,
    kind: "Pull request",
    title: "PR #51 Add authentication endpoints",
    detail: "3 commits · review requested",
  },
  {
    icon: IconCircleCheck,
    kind: "Evidence",
    title: "Task completed when PR merges",
    detail: "Issue closed automatically",
  },
];

const OFFSETS = ["ml-0", "ml-4", "ml-8", "ml-12"];

const variantContent: Record<"sign-in" | "sign-up", AuthVariantContent> = {
  "sign-in": {
    heading: "Connect what your team discusses with what it ships.",
    sub: "Meetings become decisions and tasks. Tasks link to commits and pull requests. The AI remembers all of it.",
  },
  "sign-up": {
    heading: "Start with a meeting. End with merged code.",
    sub: "Create a project, invite your team, and let every promise made in a call find its way to a pull request.",
  },
};

const AuthLayout = ({ children, variant }: AuthLayoutProps) => {
  const content = variantContent[variant];

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      {/* Left panel: the form, half the width on desktop */}
      <div className="relative z-10 flex flex-1 flex-col bg-surface-container-lowest px-6 py-8 sm:px-10 md:w-1/2 md:flex-none">
        <div className="flex flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-[400px]">{children}</div>
        </div>
        <p className="mt-8 text-xs text-on-surface-variant">© 2026 NeuraMeet</p>
      </div>

      {/* Right panel: the pitch, hidden on mobile */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-inverse-surface p-8 md:flex md:w-1/2 lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20"
        >
          <div className="absolute left-[-10%] top-[-10%] h-96 w-96 rounded-full bg-primary-container mix-blend-screen blur-[100px]" />
          <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-secondary mix-blend-screen blur-[120px]" />
        </div>

        <div className="relative z-10 mx-auto flex h-full w-full max-w-xl flex-col gap-10">
          <div>
            <p className="text-label-caps uppercase tracking-widest text-inverse-primary">
              The development workspace
            </p>
            <h2 className="mt-3 text-headline-md font-semibold leading-tight text-on-primary">
              {content.heading}
            </h2>
            <p className="mt-3 max-w-md text-body-md text-inverse-on-surface/70">
              {content.sub}
            </p>
          </div>

          <ul className="mt-auto flex flex-col gap-3">
            {chain.map((card, i) => {
              const Icon = card.icon;
              return (
                <li
                  key={card.kind}
                  className={`flex items-center gap-3 rounded-xl border border-inverse-on-surface/10 bg-inverse-on-surface/5 p-3 ${OFFSETS[i]}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/20">
                    <Icon
                      size={18}
                      className="text-inverse-primary"
                      stroke={1.5}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-label-caps uppercase tracking-wider text-inverse-on-surface/60">
                      {card.kind}
                    </span>
                    <span className="block truncate text-body-md font-semibold text-on-primary">
                      {card.title}
                    </span>
                    <span className="block truncate text-xs text-inverse-on-surface/60">
                      {card.detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
