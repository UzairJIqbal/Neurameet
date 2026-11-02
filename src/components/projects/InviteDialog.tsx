/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Copy, X } from "lucide-react";
import { createInvitation } from "@/lib/project-client";
import {
  inviteRoleOptions,
  ROLE_LABELS,
  type InviteKind,
  type InviteRole,
  type ProjectRole,
} from "@/lib/project-types";

type Props = {
  projectId: string;
  myRole: ProjectRole;
  onClose: () => void;
  onCreated: () => void;
};

type Result = { link: string; kind: InviteKind; emailSent: boolean };

const inputClass =
  "w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";
const primaryButton =
  "rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";

// Email or link invite. The role picker only offers what your role allows
// (AC-14); the server checks the same rule. The link shows once (AC-22c).
const InviteDialog = ({ projectId, myRole, onClose, onCreated }: Props) => {
  const [kind, setKind] = useState<InviteKind>("email");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("developer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const roles = inviteRoleOptions(myRole, kind);

  useEffect(() => {
    if (!roles.includes(role)) setRole(roles[0] ?? "developer");
  }, [roles, role]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await createInvitation(projectId, {
        kind,
        role,
        ...(kind === "email" ? { email: email.trim() } : {}),
      });
      setResult({ link: res.link, kind, emailSent: res.emailSent });
      if (kind === "email" && res.emailSent) toast.success("Invite sent");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy, select the link and copy it");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 id="invite-title" className="text-headline-sm text-on-surface">
            Invite people
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-low"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="flex flex-col gap-3">
            {result.kind === "email" && !result.emailSent && (
              <p role="status" className="text-body-md text-on-surface">
                Email not sent, copy the link
              </p>
            )}
            <p className="text-body-md text-on-surface-variant">
              {result.kind === "link"
                ? "Anyone with this link can ask to join. You approve each request."
                : "Only the invited email can use this link."}{" "}
              It shows only once.
            </p>
            <div className="flex items-center gap-2">
              <input readOnly aria-label="Invite link" value={result.link} className={inputClass} />
              <button type="button" onClick={handleCopy} aria-label="Copy link" className={primaryButton}>
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <button type="button" onClick={onClose} className="self-end text-body-md text-on-surface-variant hover:text-on-surface">
              Done
            </button>
          </div>
        ) : (
          <>
            <fieldset className="flex gap-4">
              <legend className="sr-only">Invite type</legend>
              {(["email", "link"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-body-md text-on-surface">
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                  {k === "email" ? "By email" : "By link"}
                </label>
              ))}
            </fieldset>

            {kind === "email" && (
              <label className="flex flex-col gap-1 text-body-md text-on-surface">
                Email
                <input
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-body-md text-on-surface">
              Role
              <select
                aria-label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
                className={inputClass}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <p role="alert" className="text-body-md text-error">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy || roles.length === 0} className={primaryButton}>
              {busy ? "Creating..." : kind === "email" ? "Send invite" : "Create link"}
            </button>
          </>
        )}
      </form>
    </div>
  );
};

export default InviteDialog;
