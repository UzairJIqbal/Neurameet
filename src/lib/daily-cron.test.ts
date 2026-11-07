import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { notify, primaryEmails, sendWorkspaceEmail, syncProject, configured } =
  vi.hoisted(() => ({
    notify: vi.fn(async () => 1),
    primaryEmails: vi.fn(async () => new Map([["u1", "u1@example.com"]])),
    sendWorkspaceEmail: vi.fn(async () => true),
    syncProject: vi.fn(async () => ({})),
    configured: vi.fn(() => true),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications")>()),
  notify,
  primaryEmails,
}));
vi.mock("@/lib/email", () => ({
  escapeHtml: (t: string) => t,
  sendWorkspaceEmail,
  workspaceEmailConfigured: configured,
}));
vi.mock("@/lib/github-rules", () => ({ syncProject }));
vi.mock("@/lib/invitations", () => ({
  workspaceEmailsSentToday: vi.fn(async () => 0),
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));

import {
  callsOf,
  client,
  ok,
  queue,
  resetQueues,
} from "@/test/supabase-queue-mock";
import {
  purgeDeliveries,
  runDailyCron,
  sendDigests,
  syncOpenProjects,
  writeTaskDue,
} from "./daily-cron";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = client as unknown as SupabaseClient;
const clock = { now: () => 1_000_000, deadline: 1_050_000 };

const task = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  project_id: "p1",
  number: 7,
  title: "Fix login",
  assignee_id: "u1",
  due_date: "2026-11-07",
  ...over,
});

beforeEach(() => {
  resetQueues();
  vi.clearAllMocks();
  configured.mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("purgeDeliveries", () => {
  it("deletes rows older than 30 days", async () => {
    queue("github_deliveries", { data: null, error: null, count: 4 });
    expect(await purgeDeliveries(db, clock)).toBe(4);
    const cutoff = callsOf("github_deliveries", "lt")[0].args[1] as string;
    expect(new Date(cutoff).getTime()).toBe(1_000_000 - 30 * 86_400_000);
  });
});

describe("writeTaskDue", () => {
  it("writes the spec's notice, with no email", async () => {
    queue("tasks", ok([task()]));
    queue("projects", ok([{ id: "p1", task_prefix: "NM" }]));
    expect(await writeTaskDue(db, clock)).toBe(1);
    expect(notify).toHaveBeenCalledWith(db, {
      userIds: ["u1"],
      projectId: "p1",
      kind: "task_due",
      title: "NM-7 is due today",
      body: "Fix login",
      link: "/projects/p1?tab=tasks&task=t1",
      dedupeKey: "task_due:t1:2026-11-07",
      email: false,
    });
  });

  it("caps the read at 200, oldest first", async () => {
    queue("tasks", ok([]));
    await writeTaskDue(db, clock);
    expect(callsOf("tasks", "limit")[0].args[0]).toBe(200);
    expect(callsOf("tasks", "order")[0].args).toEqual([
      "created_at",
      { ascending: true },
    ]);
  });

  it("stops at the deadline", async () => {
    queue("tasks", ok([task()]));
    queue("projects", ok([{ id: "p1", task_prefix: "NM" }]));
    await writeTaskDue(db, { now: () => 5, deadline: 5 });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("sendDigests", () => {
  const seed = (settings: unknown[], sentToday = 0) => {
    queue("tasks", ok([task()]));
    queue("notifications", ok([]));
    queue("project_members", ok([{ project_id: "p1", user_id: "u1" }]));
    queue("user_settings", ok(settings), {
      data: null,
      error: null,
      count: sentToday,
    });
    queue("projects", ok([{ id: "p1", task_prefix: "NM" }]));
  };

  it("sends nothing and claims nothing with no sender", async () => {
    configured.mockReturnValue(false);
    expect(await sendDigests(db, clock)).toBe(0);
    expect(callsOf("user_settings", "update")).toHaveLength(0);
  });

  it("claims the day, then sends one digest listing the task", async () => {
    seed([]);
    queue("user_settings", ok(null), ok([{ user_id: "u1" }]));
    expect(await sendDigests(db, clock)).toBe(1);
    expect(callsOf("user_settings", "update")).toHaveLength(1);
    const [to, subject, html] = sendWorkspaceEmail.mock.calls[0] as unknown as [
      string,
      string,
      string,
    ];
    expect(to).toBe("u1@example.com");
    expect(subject).toBe("Your NeuraMeet digest");
    expect(html).toContain("NM-7 Fix login");
    expect(html).toContain("/settings?tab=notifications");
  });

  it("does not send when another run already claimed the day", async () => {
    seed([]);
    queue("user_settings", ok(null), ok([]));
    expect(await sendDigests(db, clock)).toBe(0);
    expect(sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("skips a user with either toggle off", async () => {
    seed([
      {
        user_id: "u1",
        email_notifications: true,
        digest_emails: false,
        digest_sent_on: null,
      },
    ]);
    expect(await sendDigests(db, clock)).toBe(0);
    expect(sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("stops at 20 a day", async () => {
    seed([], 20);
    expect(await sendDigests(db, clock)).toBe(0);
    expect(sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("ignores a task whose assignee left the project", async () => {
    queue("tasks", ok([task()]));
    queue("notifications", ok([]));
    queue("project_members", ok([]));
    expect(await sendDigests(db, clock)).toBe(0);
    expect(sendWorkspaceEmail).not.toHaveBeenCalled();
  });
});

describe("syncOpenProjects", () => {
  const links = (...ids: string[]) =>
    ok(ids.map((id) => ({ tasks: { project_id: id } })));

  it("syncs at most 5 distinct projects with the time left", async () => {
    queue("task_links", links("a", "a", "b", "c", "d", "e", "f"));
    expect(await syncOpenProjects(db, clock)).toBe(5);
    expect(syncProject.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect((syncProject.mock.calls[0] as unknown[])[2]).toMatchObject({
      maxMs: 50_000,
    });
  });

  it("starts no project with under 5 seconds left", async () => {
    queue("task_links", links("a"));
    expect(await syncOpenProjects(db, { now: () => 0, deadline: 4_999 })).toBe(
      0,
    );
    expect(syncProject).not.toHaveBeenCalled();
  });
});

describe("runDailyCron", () => {
  it("keeps going past a failed job and names it", async () => {
    queue("github_deliveries", { data: null, error: new Error("down") });
    configured.mockReturnValue(false);
    const result = await runDailyCron(db, () => 1_000_000);
    expect(result.failed).toEqual(["purge"]);
    expect(JSON.stringify(result)).not.toContain("@");
  });
});
