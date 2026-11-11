/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { createInvitation, revokeInvitation } from "@/lib/project-client";
import {
  inviteRoleOptions,
  ROLE_LABELS,
  type CreateInvitationResponse,
  type InviteKind,
  type InviteRole,
  type ProjectRole,
} from "@/lib/project-types";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  projectName: string;
  myRole: ProjectRole;
  onClose: () => void;
  /** Reload the pending list after an invite is created or disabled. */
  onCreated: () => void;
};

type EmailResult =
  | { email: string; status: "created"; link: string }
  | { email: string; status: "failed"; message: string };

const MAX_ADDRESSES = 10;
const ROLE_CARDS: { role: InviteRole; hint: string }[] = [
  { role: "admin", hint: "Manage members, settings and GitHub" },
  { role: "developer", hint: "Create and update tasks and meetings" },
  { role: "viewer", hint: "Read only access" },
];

const INPUT =
  "w-full rounded-xl border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";
const PRIMARY =
  "rounded-full bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const SECONDARY =
  "rounded-full border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const copyLink = async (link: string) => {
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy, select the link and copy it");
  }
};

const splitAddresses = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

const RoleCards = ({
  allowed,
  value,
  disabled,
  onChange,
}: {
  allowed: InviteRole[];
  value: InviteRole;
  disabled: boolean;
  onChange: (role: InviteRole) => void;
}) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="mb-1 text-body-md font-medium text-on-surface">
      Project role
    </legend>
    {ROLE_CARDS.map(({ role, hint }) => {
      const isAllowed = allowed.includes(role);
      return (
        <label
          key={role}
          className={cn(
            "flex cursor-pointer flex-col rounded-lg border p-3",
            value === role
              ? "border-primary bg-surface-container-low"
              : "border-surface-variant",
            !isAllowed && "cursor-not-allowed opacity-50",
          )}
        >
          <input
            type="radio"
            name="invite-role"
            className="sr-only"
            checked={value === role}
            disabled={disabled || !isAllowed}
            onChange={() => onChange(role)}
            aria-label={`${ROLE_LABELS[role]}: ${hint}`}
          />
          <span className="text-body-md font-medium text-on-surface">
            {ROLE_LABELS[role]}
          </span>
          <span className="text-body-md text-on-surface-variant">{hint}</span>
        </label>
      );
    })}
  </fieldset>
);

// AC-70k. One POST per address, so one bad address never sinks the rest. The
// server checks every rule again; a link can never skip approval.
const AddMembersDialog = ({
  projectId,
  projectName,
  myRole,
  onClose,
  onCreated,
}: Props) => {
  const [tab, setTab] = useState<InviteKind>("link");
  const [role, setRole] = useState<InviteRole>("developer");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [results, setResults] = useState<EmailResult[] | null>(null);
  const [created, setCreated] = useState<CreateInvitationResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const allowed = inviteRoleOptions(myRole, tab);
  const effectiveRole = allowed.includes(role) ? role : "developer";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const addAddresses = (text: string): string[] => {
    const merged = [...new Set([...addresses, ...splitAddresses(text)])];
    if (merged.length > MAX_ADDRESSES) {
      setFormError("You can add up to 10 addresses.");
      const capped = merged.slice(0, MAX_ADDRESSES);
      setAddresses(capped);
      setDraft("");
      return capped;
    }
    setFormError(null);
    setAddresses(merged);
    setDraft("");
    return merged;
  };

  const sendOne = async (email: string): Promise<EmailResult> => {
    try {
      const res = await createInvitation(projectId, {
        kind: "email",
        role: effectiveRole,
        email,
      });
      return { email, status: "created", link: res.link };
    } catch (err) {
      return {
        email,
        status: "failed",
        message: errorText(err, "Failed to create invite"),
      };
    }
  };

  const handleSend = async () => {
    const list = addAddresses(draft);
    if (list.length === 0) {
      setFormError("Add at least one email address.");
      return;
    }
    setBusy(true);
    const sent: EmailResult[] = [];
    for (const email of list) sent.push(await sendOne(email));
    setResults(sent);
    setBusy(false);
    if (sent.some((r) => r.status !== "failed")) onCreated();
  };

  const handleGenerate = async () => {
    setBusy(true);
    try {
      setCreated(
        await createInvitation(projectId, {
          kind: "link",
          role: effectiveRole,
        }),
      );
      onCreated();
    } catch (err) {
      toast.error(errorText(err, "Failed to create invite"));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!created) return;
    setBusy(true);
    try {
      await revokeInvitation(projectId, created.invitation.id);
      setCreated(null);
      toast.success("Link disabled");
      onCreated();
    } catch (err) {
      toast.error(errorText(err, "Failed to disable the link"));
    } finally {
      setBusy(false);
    }
  };

  const tabButton = (kind: InviteKind, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === kind}
      disabled={busy}
      onClick={() => setTab(kind)}
      className={cn(
        "border-b-2 px-3 py-2 text-body-md",
        tab === kind
          ? "border-primary font-medium text-on-surface"
          : "border-transparent text-on-surface-variant hover:text-on-surface",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add members"
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-card bg-surface-container-lowest p-6 shadow-card"
      >
        <div>
          <h2 className="text-headline-sm text-on-surface">Add members</h2>
          <p className="text-body-md text-on-surface-variant">
            Invite people to {projectName}. They get access only after
            accepting.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Invite method"
          className="flex gap-2 border-b border-surface-variant"
        >
          {tabButton("link", "Invitation link")}
        </div>

        {tab === "email" && results && (
          <>
            <ul className="flex flex-col gap-2" aria-label="Invite results">
              {results.map((r) => (
                <li
                  key={r.email}
                  className="flex flex-col gap-1 rounded-lg border border-surface-variant p-3"
                >
                  <span className="break-all text-body-md font-medium text-on-surface">
                    {r.email}
                  </span>
                  {r.status === "failed" && (
                    <span className="text-body-md text-error">{r.message}</span>
                  )}
                  {r.status === "created" && (
                    <span className="flex flex-wrap items-center gap-2 text-body-md text-on-surface-variant">
                      Invite created. Copy the link and send it yourself.
                      <button
                        type="button"
                        aria-label={`Copy link for ${r.email}`}
                        onClick={() => copyLink(r.link)}
                        className={SECONDARY}
                      >
                        Copy
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={PRIMARY}>
                Done
              </button>
            </div>
          </>
        )}

        {tab === "email" && !results && (
          <>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="invite-addresses"
                className="text-body-md font-medium text-on-surface"
              >
                Email addresses
              </label>
              {addresses.length > 0 && (
                <ul className="flex flex-wrap gap-1">
                  {addresses.map((email) => (
                    <li
                      key={email}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface-variant"
                    >
                      {email}
                      <button
                        type="button"
                        aria-label={`Remove ${email}`}
                        disabled={busy}
                        onClick={() =>
                          setAddresses((prev) =>
                            prev.filter((a) => a !== email),
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                id="invite-addresses"
                value={draft}
                disabled={busy}
                placeholder="name@company.com, another@company.com"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    if (draft.trim()) addAddresses(draft);
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  addAddresses(`${draft} ${e.clipboardData.getData("text")}`);
                }}
                className={INPUT}
              />
              <p className="text-body-md text-on-surface-variant">
                Press Enter or comma to add multiple addresses.
              </p>
              {formError && (
                <p className="text-body-md text-error">{formError}</p>
              )}
            </div>
            <RoleCards
              allowed={allowed}
              value={effectiveRole}
              disabled={busy}
              onChange={setRole}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className={SECONDARY}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSend}
                className={PRIMARY}
              >
                {busy ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </>
        )}

        {tab === "link" && (
          <>
            <RoleCards
              allowed={allowed}
              value={effectiveRole}
              disabled={busy || created !== null}
              onChange={setRole}
            />
            <p className="text-body-md text-on-surface-variant">
              The Owner or an Admin always approves link requests.
            </p>
            {created && (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="invite-link"
                  className="text-body-md font-medium text-on-surface"
                >
                  Invite link
                </label>
                <div className="flex gap-2">
                  <input
                    id="invite-link"
                    readOnly
                    value={created.link}
                    onFocus={(e) => e.target.select()}
                    className={INPUT}
                  />
                  <button
                    type="button"
                    onClick={() => copyLink(created.link)}
                    className={SECONDARY}
                  >
                    Copy
                  </button>
                </div>
                <p className="text-body-md text-on-surface-variant">
                  Expires{" "}
                  {new Date(created.invitation.expiresAt).toLocaleDateString()}.
                  This link shows only once.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              {created ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDisable}
                    className={SECONDARY}
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onClose}
                    className={PRIMARY}
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onClose}
                    className={SECONDARY}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleGenerate}
                    className={PRIMARY}
                  >
                    {busy ? "Generating..." : "Generate link"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AddMembersDialog;
