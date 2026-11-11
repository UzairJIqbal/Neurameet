import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InviteKind, InviteRole } from "@/lib/project-types";

// W2 invitations (spec 0004-invitations). The raw token only ever lives in the
// link; the database keeps its SHA-256 hex. Never log a token.

export const INVITE_TTL_DAYS = 7;
export const MAX_ACTIVE_INVITES = 50;
export const ACCEPT_FAIL_LIMIT = 10;
export const ACCEPT_FAIL_WINDOW_MIN = 10;
export const EMAIL_MAX = 254;

export const GONE_MESSAGE = "This invite is no longer valid";
export const WRONG_EMAIL_MESSAGE = "This invite is for a different email";
export const RATE_LIMIT_MESSAGE = "Too many tries, wait a few minutes";
export const ACCEPT_FAILED_ACTION = "invite.accept_failed";

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function inviteLink(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${token}`;
}

const emailSchema = z.email().max(EMAIL_MAX);

/** Trimmed, lowercased, valid email, or null. */
export function parseInviteEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return emailSchema.safeParse(email).success ? email : null;
}

/** A token as it appears in a link: base64url only, bounded length. */
export function isTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export type CallerEmail = { email: string | null; verified: boolean };

// AC-22b: the one place the dev rule lives. Lenient on an unverified email only
// when NODE_ENV is exactly development or test; anything else fails closed.
export function emailMatchesInvite(
  caller: CallerEmail,
  inviteEmail: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (!caller.email) return false;
  if (caller.email.trim().toLowerCase() !== inviteEmail.toLowerCase()) {
    return false;
  }
  if (caller.verified) return true;
  if (nodeEnv === "development" || nodeEnv === "test") {
    console.warn("[invitations] accepting an unverified email (dev rule)");
    return true;
  }
  return false;
}

export type InviteRow = {
  id: string;
  project_id: string;
  kind: InviteKind;
  email: string | null;
  role: InviteRole;
  created_by: string;
  expires_at: string;
  revoked_at: string | null;
  used_at: string | null;
  declined_at: string | null;
  created_at: string;
};

export type InviteState = "valid" | "member" | "pending" | "gone";

// AC-19 order: unknown, then active member, then (link only) a pending request
// already waiting, then revoked, used, declined, or expired.
export function resolveInviteState(
  invite: InviteRow | null,
  caller: { isMember: boolean; hasPending: boolean },
  now: Date = new Date(),
): InviteState {
  if (!invite) return "gone";
  if (caller.isMember) return "member";
  if (invite.kind === "link" && caller.hasPending) return "pending";
  if (invite.revoked_at || invite.used_at || invite.declined_at) return "gone";
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return "gone";
  return "valid";
}

export type LoadedInvite = {
  state: InviteState;
  invite: InviteRow | null;
  projectName: string | null;
};

const INVITE_COLUMNS =
  "id, project_id, kind, email, role, created_by, expires_at, revoked_at, used_at, declined_at, created_at";

/** Looks the token up by hash and resolves the caller's state (AC-16a, AC-19). */
export async function loadInviteByToken(
  supabase: SupabaseClient,
  token: string,
  userId: string,
): Promise<LoadedInvite> {
  const { data, error } = await supabase
    .from("project_invitations")
    .select(INVITE_COLUMNS)
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error) throw error;
  return resolveLoaded(supabase, (data as InviteRow | null) ?? null, userId);
}

/** The same load by id, for `/api/invitations/mine/[id]` (AC-70t). */
export async function loadInviteById(
  supabase: SupabaseClient,
  invitationId: string,
  userId: string,
): Promise<LoadedInvite> {
  const { data, error } = await supabase
    .from("project_invitations")
    .select(INVITE_COLUMNS)
    .eq("id", invitationId)
    .maybeSingle();
  if (error) throw error;
  return resolveLoaded(supabase, (data as InviteRow | null) ?? null, userId);
}

async function resolveLoaded(
  supabase: SupabaseClient,
  invite: InviteRow | null,
  userId: string,
): Promise<LoadedInvite> {
  if (!invite) return { state: "gone", invite: null, projectName: null };

  const [member, pending, project] = await Promise.all([
    supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", invite.project_id)
      .eq("user_id", userId)
      .is("removed_at", null)
      .maybeSingle(),
    supabase
      .from("project_join_requests")
      .select("id")
      .eq("project_id", invite.project_id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle(),
    supabase
      .from("projects")
      .select("name")
      .eq("id", invite.project_id)
      .maybeSingle(),
  ]);
  if (member.error) throw member.error;
  if (pending.error) throw pending.error;
  if (project.error) throw project.error;

  const state = resolveInviteState(invite, {
    isMember: Boolean(member.data),
    hasPending: Boolean(pending.data),
  });
  const projectName = (project.data as { name?: string } | null)?.name ?? null;
  return { state, invite, projectName };
}

// AC-22: failed accepts per user in a rolling window, from audit_log.
export async function isAcceptRateLimited(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const since = new Date(
    now.getTime() - ACCEPT_FAIL_WINDOW_MIN * 60 * 1000,
  ).toISOString();
  const { count, error } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", userId)
    .eq("action", ACCEPT_FAILED_ACTION)
    .gte("created_at", since);
  if (error) {
    console.error("[invitations] rate limit count failed:", error);
    return false;
  }
  return (count ?? 0) >= ACCEPT_FAIL_LIMIT;
}

/** One failure row per 410 or 403; carries the invitation id, never the token. */
export async function recordAcceptFailure(
  supabase: SupabaseClient,
  userId: string,
  invite: Pick<InviteRow, "id" | "project_id"> | null,
  reason: "gone" | "wrong_email",
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({
    project_id: invite?.project_id ?? null,
    actor_id: userId,
    action: ACCEPT_FAILED_ACTION,
    target_type: invite ? "invitation" : null,
    target_id: invite?.id ?? null,
    detail: { reason },
  });
  if (error) console.error("[invitations] failure row write failed:", error);
}

/** Name for the approver list: full name, then username, then the email's local part. */
export function displayNameFor(user: {
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const full = user.fullName?.trim();
  if (full) return full;
  if (user.username) return user.username;
  const local = user.email?.split("@")[0];
  return local || "Unknown member";
}

// ---- Workspace email budget (W8 event emails) ----

export const WORKSPACE_EMAIL_DAILY_BUDGET = 60;

const utcDayStart = (now: Date): string =>
  new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();

/** Event emails sent since UTC midnight. Null when unreadable. */
export async function workspaceEmailsSentToday(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<number | null> {
  const since = utcDayStart(now);
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .gte("emailed_at", since);
  if (error) {
    console.error("[invitations] email budget count failed:", error);
    return null;
  }
  return count ?? 0;
}

export async function workspaceEmailBudgetLeft(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<boolean> {
  const sent = await workspaceEmailsSentToday(supabase, now);
  return sent !== null && sent < WORKSPACE_EMAIL_DAILY_BUDGET;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID_RE.test(value);

export type CallerProfile = CallerEmail & { displayName: string };

/** The caller's primary email (with verification) and a display name, from Clerk. */
export async function getCallerProfile(userId: string): Promise<CallerProfile> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const primary = user.primaryEmailAddress;
  const email = primary?.emailAddress?.toLowerCase() ?? null;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return {
    email,
    verified: primary?.verification?.status === "verified",
    displayName: displayNameFor({ fullName, username: user.username, email }),
  };
}

/** Clerk users whose primary email is this invite's address, checked by emailMatchesInvite. */
export async function findUserIdsByInviteEmail(
  email: string,
): Promise<string[]> {
  const client = await clerkClient();
  const { data } = await client.users.getUserList({
    emailAddress: [email],
    limit: 10,
  });
  return data
    .filter((user) =>
      emailMatchesInvite(
        {
          email: user.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null,
          verified:
            user.primaryEmailAddress?.verification?.status === "verified",
        },
        email,
      ),
    )
    .map((user) => user.id);
}
