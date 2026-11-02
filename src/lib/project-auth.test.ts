import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  client,
  queue,
  ok,
  resetQueues,
  callsOf,
} from "@/test/supabase-queue-mock";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ProjectAccessError,
  accessErrorResponse,
  checkMeetingAccess,
  requireMeetingAccess,
  requireProjectRole,
} from "./project-auth";

const db = client as unknown as SupabaseClient;

async function statusOf(p: Promise<unknown>): Promise<number | "ok"> {
  try {
    await p;
    return "ok";
  } catch (err) {
    if (err instanceof ProjectAccessError) return err.status;
    throw err;
  }
}

beforeEach(() => resetQueues());

describe("requireProjectRole", () => {
  it("returns the active role", async () => {
    queue("project_members", ok({ role: "developer" }));
    await expect(
      requireProjectRole(db, "u1", "p1", ["owner", "developer"]),
    ).resolves.toEqual({ role: "developer" });
    expect(callsOf("project_members", "is")[0].args).toEqual([
      "removed_at",
      null,
    ]);
  });

  it("404 for an outsider or a removed member (no active row)", async () => {
    queue("project_members", ok(null));
    expect(await statusOf(requireProjectRole(db, "u9", "p1", ["owner"]))).toBe(
      404,
    );
  });

  it("403 for a member whose role is not allowed", async () => {
    queue("project_members", ok({ role: "viewer" }));
    expect(
      await statusOf(requireProjectRole(db, "u2", "p1", ["owner", "admin"])),
    ).toBe(403);
  });

  it("reads the role on every call (no cache)", async () => {
    queue("project_members", ok({ role: "admin" }), ok(null));
    expect(await statusOf(requireProjectRole(db, "u2", "p1", ["admin"]))).toBe(
      "ok",
    );
    expect(await statusOf(requireProjectRole(db, "u2", "p1", ["admin"]))).toBe(
      404,
    );
  });
});

describe("checkMeetingAccess on a personal meeting", () => {
  const personal = { id: "m1", user_id: "owner", project_id: null };

  it("passes the creator for every need", async () => {
    for (const need of ["read", "content", "manage", "owner"] as const) {
      expect(
        await statusOf(checkMeetingAccess(db, "owner", personal, need)),
      ).toBe("ok");
    }
  });

  it("uses the route's fallback for anyone else", async () => {
    const yes = await checkMeetingAccess(db, "u2", personal, "content", {
      personalFallback: async () => true,
    });
    expect(yes).toEqual({
      meetingId: "m1",
      projectId: null,
      role: null,
      isCreator: false,
    });
    expect(
      await statusOf(
        checkMeetingAccess(db, "u2", personal, "content", {
          personalFallback: async () => false,
        }),
      ),
    ).toBe(404);
  });

  it("keeps the route's own denial status", async () => {
    expect(
      await statusOf(
        checkMeetingAccess(db, "u2", personal, "manage", {
          personalDenied: { status: 403, message: "Not authorized" },
        }),
      ),
    ).toBe(403);
  });

  it("never reads project_members", async () => {
    await checkMeetingAccess(db, "owner", personal, "manage");
    expect(callsOf("project_members", "select")).toHaveLength(0);
  });
});

describe("checkMeetingAccess on a project meeting", () => {
  const project = { id: "m1", user_id: "creator", project_id: "p1" };
  const cases: [
    string,
    "read" | "content" | "manage" | "owner",
    number | "ok",
  ][] = [
    ["viewer", "read", "ok"],
    ["viewer", "content", 403],
    ["developer", "content", "ok"],
    ["developer", "manage", 403],
    ["admin", "manage", "ok"],
    ["admin", "owner", 403],
    ["owner", "owner", "ok"],
  ];

  it.each(cases)("%s with need %s → %s", async (role, need, expected) => {
    queue("project_members", ok({ role }));
    expect(await statusOf(checkMeetingAccess(db, "u2", project, need))).toBe(
      expected,
    );
  });

  it("404 for a non member, even the creator after removal", async () => {
    queue("project_members", ok(null));
    expect(
      await statusOf(checkMeetingAccess(db, "creator", project, "read")),
    ).toBe(404);
  });

  it("ignores the personal fallback", async () => {
    queue("project_members", ok(null));
    expect(
      await statusOf(
        checkMeetingAccess(db, "u2", project, "read", {
          personalFallback: async () => true,
        }),
      ),
    ).toBe(404);
  });
});

describe("requireMeetingAccess", () => {
  it("404 for a missing meeting", async () => {
    queue("meetings", ok(null));
    expect(await statusOf(requireMeetingAccess(db, "u1", "m9", "read"))).toBe(
      404,
    );
  });

  it("loads the meeting then applies the matrix", async () => {
    queue("meetings", ok({ id: "m1", user_id: "c", project_id: "p1" }));
    queue("project_members", ok({ role: "admin" }));
    await expect(
      requireMeetingAccess(db, "u2", "m1", "manage"),
    ).resolves.toEqual({
      meetingId: "m1",
      projectId: "p1",
      role: "admin",
      isCreator: false,
    });
  });
});

describe("accessErrorResponse", () => {
  it("maps the error to its status", async () => {
    const res = accessErrorResponse(
      new ProjectAccessError(403, "Not authorized"),
    );
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "Not authorized" });
  });

  it("returns null for other errors", () => {
    expect(accessErrorResponse(new Error("x"))).toBeNull();
  });
});

describe("canManageMeeting", () => {
  it("is the creator check on a personal meeting", async () => {
    const { canManageMeeting } = await import("./project-auth");
    await expect(
      canManageMeeting(db, "u1", { id: "m", user_id: "u1" }),
    ).resolves.toBe(true);
    await expect(
      canManageMeeting(db, "u2", { id: "m", user_id: "u1" }),
    ).resolves.toBe(false);
  });

  it("follows the role on a project meeting", async () => {
    const { canManageMeeting } = await import("./project-auth");
    const m = { id: "m", user_id: "u1", project_id: "p1" };
    queue("project_members", ok({ role: "admin" }));
    await expect(canManageMeeting(db, "u2", m)).resolves.toBe(true);
    queue("project_members", ok({ role: "developer" }));
    await expect(canManageMeeting(db, "u2", m)).resolves.toBe(false);
    queue("project_members", ok(null));
    await expect(canManageMeeting(db, "u1", m)).resolves.toBe(false);
  });
});
