/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import {
  acceptInvitation,
  previewInvitation,
  ProjectClientError,
} from "@/lib/project-client";
import { ROLE_LABELS, type InvitePreview } from "@/lib/project-types";

type Props = { token: string };

// The server message is shown as is for 410, 403, and 429; anything else
// falls back to this.
const FALLBACK = "This invite is no longer valid";

const primaryButton =
  "rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const cardClass =
  "mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-surface-variant bg-surface-container-lowest p-6";

const messageFor = (err: unknown) =>
  err instanceof ProjectClientError && [403, 410, 429].includes(err.status)
    ? err.message
    : err instanceof Error
      ? err.message
      : FALLBACK;

// Invite landing page (AC-16 to AC-20). Preview consumes nothing; Join is the
// only call that acts on the invite.
const InviteView = ({ token }: Props) => {
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [joining, setJoining] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

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
        <Link href="/projects" className="text-body-md text-primary hover:underline">
          Go to projects
        </Link>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <p className="text-label-caps uppercase tracking-wider text-on-surface-variant">Project invite</p>
      <h1 className="text-headline-sm text-on-surface">{preview.projectName}</h1>

      {preview.status === "member" && (
        <>
          <p className="text-body-md text-on-surface-variant">You&apos;re already in this project.</p>
          {preview.projectId ? (
            <Link href={`/projects/${preview.projectId}`} className="text-body-md text-primary hover:underline">
              Open the project
            </Link>
          ) : (
            <Link href="/projects" className="text-body-md text-primary hover:underline">
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
          <p className="text-body-md text-on-surface-variant">
            You&apos;re invited as {ROLE_LABELS[preview.role]}.
            {preview.kind === "link" && " An Owner or Admin approves each request."}
          </p>
          <button type="button" onClick={handleJoin} disabled={joining} className={primaryButton}>
            {joining ? "Joining..." : preview.kind === "link" ? "Ask to join" : "Join"}
          </button>
        </>
      )}
    </div>
  );
};

export default InviteView;
