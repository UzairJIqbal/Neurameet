/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  Clock,
  Github,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { relativeTime } from "@/lib/chatHistory";
import {
  acceptInvitation,
  decideMyInvitation,
  previewInvitation,
  ProjectClientError,
} from "@/lib/project-client";
import type { InvitePreview, ProjectAvatar } from "@/lib/project-types";
import {
  AvatarStack,
  ProjectIconTile,
  ProjectRoleChip,
} from "./project-visuals";

type Props = { token: string };

// The server message is shown as is for 410, 403, and 429; anything else
// falls back to this.
const FALLBACK = "This invite is no longer valid";

const primaryButton =
  "rounded-full bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const secondaryButton =
  "rounded-full border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const cardClass =
  "mx-auto flex w-full max-w-lg flex-col gap-4 rounded-card bg-surface-container-lowest p-6 shadow-card";

const messageFor = (err: unknown) =>
  err instanceof ProjectClientError && [403, 410, 429].includes(err.status)
    ? err.message
    : err instanceof Error
      ? err.message
      : FALLBACK;

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const inviteAge = (iso: string) => {
  const age = relativeTime(new Date(iso).getTime());
  return age === "now" ? "Sent just now" : `Sent ${age} ago`;
};

const Stat = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) => (
  <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-container-low px-2 py-3 text-center">
    <Icon className="h-4 w-4 text-on-surface-variant" aria-hidden />
    <span className="text-headline-sm text-on-surface">{value}</span>
    <span className="text-xs text-on-surface-variant">{label}</span>
  </div>
);

const FactRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 text-body-md">
    <span className="shrink-0 text-on-surface-variant">{label}</span>
    <span className="flex min-w-0 items-center gap-2 text-on-surface">
      {children}
    </span>
  </div>
);

const TeamRow = ({ team, total }: { team: ProjectAvatar[]; total: number }) => (
  <FactRow label="Team">
    <AvatarStack avatars={team} total={total} />
  </FactRow>
);

const RepoRow = ({ preview }: { preview: InvitePreview }) => (
  <FactRow label="Repository">
    <Github className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
    {preview.repoName ? (
      <span className="truncate font-label-mono text-label-mono">
        {preview.repoName}
      </span>
    ) : (
      <span>Repository connected</span>
    )}
  </FactRow>
);

const InviteFacts = ({ preview }: { preview: InvitePreview }) => (
  <>
    <div className="grid grid-cols-3 gap-2">
      <Stat icon={Users} label="Members" value={preview.memberCount} />
      <Stat icon={CheckSquare} label="Tasks" value={preview.taskCount} />
      <Stat icon={Video} label="Meetings" value={preview.meetingCount} />
    </div>
    <div className="flex flex-col gap-2 border-t border-surface-variant pt-4">
      {preview.team && preview.team.length > 0 && (
        <TeamRow team={preview.team} total={preview.memberCount} />
      )}
      {preview.repoConnected && <RepoRow preview={preview} />}
      <FactRow label="Created">
        <CalendarDays
          className="h-4 w-4 shrink-0 text-on-surface-variant"
          aria-hidden
        />
        <span>{longDate(preview.createdAt)}</span>
      </FactRow>
      <FactRow label="Invitation">
        <Clock
          className="h-4 w-4 shrink-0 text-on-surface-variant"
          aria-hidden
        />
        <span>{inviteAge(preview.invitedAt)}</span>
      </FactRow>
    </div>
  </>
);

// Invite landing page (AC-16 to AC-20, AC-70s). Preview consumes nothing; Accept
// and Decline are the only calls that act on the invite.
const InviteView = ({ token }: Props) => {
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [joining, setJoining] = useState(false);
  const [declining, setDeclining] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        setProblem(null);
        setPreview(await previewInvitation(token, controller.signal));
      } catch (err) {
        if (controller.signal.aborted) return;
        setProblem(messageFor(err));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [token, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await acceptInvitation(token);
      if (res.status === "joined") {
        toast.success("You joined the project");
        router.push(`/projects/${res.projectId}`);
        return;
      }
      setPreview((p) => (p ? { ...p, status: "pending" } : p));
    } catch (err) {
      setProblem(messageFor(err));
    } finally {
      setJoining(false);
    }
  };

  // A link invite has nothing to record, so Decline just leaves. An email invite
  // only carries invitationId for the person it names (AC-70s).
  const handleDecline = async () => {
    const invitationId = preview?.invitationId;
    if (!invitationId) {
      router.push("/projects");
      return;
    }
    setDeclining(true);
    try {
      await decideMyInvitation(invitationId, "decline");
      toast.success("Invitation declined");
      router.push("/projects");
    } catch (err) {
      setProblem(messageFor(err));
    } finally {
      setDeclining(false);
    }
  };

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load this invite."
        onRetry={() => setRetryNonce((k) => k + 1)}
        listHref="/projects"
        listLabel="Go to projects"
      />
    );
  }

  if (isLoading) return <LoaderOne />;

  if (problem || !preview) {
    return (
      <div className={cardClass}>
        <p role="alert" className="text-body-lg text-on-surface">
          {problem ?? FALLBACK}
        </p>
        <Link
          href="/projects"
          className="text-body-md text-primary hover:underline"
        >
          Go to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cardClass}>
        <p className="text-body-md text-on-surface-variant">
          {preview.inviterName} invited you to collaborate
        </p>
        <div className="flex items-start gap-3">
          <ProjectIconTile
            icon={preview.icon}
            color={preview.color}
            size="lg"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="break-words text-headline-sm text-on-surface">
              {preview.projectName}
            </h1>
            {preview.description && (
              <p className="break-words text-body-md text-on-surface-variant">
                {preview.description}
              </p>
            )}
          </div>
        </div>
        <p className="flex items-center gap-2 text-body-md text-on-surface-variant">
          You&apos;ll join as <ProjectRoleChip role={preview.role} />
        </p>
        <InviteFacts preview={preview} />

        {preview.status === "member" && (
          <>
            <p className="text-body-md text-on-surface-variant">
              You&apos;re already in this project.
            </p>
            {preview.projectId ? (
              <Link
                href={`/projects/${preview.projectId}`}
                className="text-body-md text-primary hover:underline"
              >
                Open the project
              </Link>
            ) : (
              <Link
                href="/projects"
                className="text-body-md text-primary hover:underline"
              >
                Go to projects
              </Link>
            )}
          </>
        )}

        {preview.status === "pending" && (
          <p role="status" className="text-body-md text-on-surface-variant">
            Waiting for approval. An Owner or Admin of the project decides.
          </p>
        )}

        {preview.status === "valid" && (
          <>
            {preview.kind === "link" && (
              <p className="text-body-md text-on-surface-variant">
                An Owner or Admin approves each request.
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-surface-variant pt-4">
              <button
                type="button"
                onClick={handleDecline}
                disabled={joining || declining}
                className={secondaryButton}
              >
                {declining ? "Declining..." : "Decline"}
              </button>
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining || declining}
                className={primaryButton}
              >
                {joining ? "Accepting..." : "Accept"}
              </button>
            </div>
          </>
        )}
      </div>
      {preview.status === "valid" && (
        <p className="text-center text-xs text-on-surface-variant">
          Opening this page doesn&apos;t grant access. You join only after
          accepting.
        </p>
      )}
    </div>
  );
};

export default InviteView;
