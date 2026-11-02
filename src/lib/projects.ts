import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import {
  PROJECT_NAME_MAX,
  TASK_PREFIX_PATTERN,
  type ProjectRole,
} from "@/lib/project-types";

export const UNKNOWN_MEMBER = "Unknown member";
const CLERK_PAGE = 100;

export type ParsedName =
  { ok: true; name: string } | { ok: false; error: string };

export function parseProjectName(value: unknown): ParsedName {
  if (typeof value !== "string")
    return { ok: false, error: "Name is required" };
  const name = value.trim();
  if (name.length < 1 || name.length > PROJECT_NAME_MAX) {
    return {
      ok: false,
      error: `Name must be 1 to ${PROJECT_NAME_MAX} characters`,
    };
  }
  return { ok: true, name };
}

export function isTaskPrefix(value: unknown): value is string {
  return typeof value === "string" && TASK_PREFIX_PATTERN.test(value);
}

export function isAssignableRole(
  value: unknown,
): value is Exclude<ProjectRole, "owner"> {
  return value === "admin" || value === "developer" || value === "viewer";
}

export type ClerkProfile = { name: string; email: string | null };

/** Names and primary emails from Clerk, batched; a failed lookup falls back to "Unknown member". */
export async function lookupProfiles(
  userIds: string[],
): Promise<Map<string, ClerkProfile>> {
  const profiles = new Map<string, ClerkProfile>();
  const unique = [...new Set(userIds)];
  try {
    const client = await clerkClient();
    for (let i = 0; i < unique.length; i += CLERK_PAGE) {
      const page = unique.slice(i, i + CLERK_PAGE);
      const { data } = await client.users.getUserList({
        userId: page,
        limit: CLERK_PAGE,
      });
      for (const user of data) {
        const name = [user.firstName, user.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        const email = user.primaryEmailAddress?.emailAddress ?? null;
        profiles.set(user.id, {
          name: name || user.username || email || UNKNOWN_MEMBER,
          email,
        });
      }
    }
  } catch (err) {
    console.error("[projects] clerk lookup failed", err);
  }
  for (const id of unique) {
    if (!profiles.has(id))
      profiles.set(id, { name: UNKNOWN_MEMBER, email: null });
  }
  return profiles;
}

/** Postgres raise exception text from a failed rpc, e.g. "not_removable". */
export function rpcErrorCode(error: unknown): string | null {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : null;
}
