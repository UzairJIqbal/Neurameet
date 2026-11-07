import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const getUserList = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUserList } }),
}));

import {
  client,
  queue,
  ok,
  resetQueues,
  callsOf,
} from "@/test/supabase-queue-mock";
import {
  EVENT_EMAIL_DAILY_CAP,
  NOTIFICATION_CATEGORIES,
  isAppPath,
  notify,
  projectAdminIds,
  type NotifyInput,
} from "./notifications";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabase = client as unknown as SupabaseClient;
const fetchMock = vi.fn();

const input = (over: Partial<NotifyInput> = {}): NotifyInput => ({
  userIds: ["u1"],
  projectId: "p1",
  kind: "task_assigned",
  title: "You were assigned ABC-1",
  body: "Fix <login>",
  link: "/projects/p1?tab=tasks&task=t1",
  dedupeKey: "task_assigned:t1:1",
  ...over,
});

const usersOf = (...ids: string[]) => ({
  data: ids.map((id) => ({
    id,
    primaryEmailAddress: { emailAddress: `${id}@x.com` },
  })),
});

// The count reads run together: audit_log first, notifications second.
const budget = (sent: number) => {
  queue("audit_log", { data: null, error: null, count: 0 });
  queue("notifications", { data: null, error: null, count: sent });
};

beforeEach(() => {
  resetQueues();
  getUserList.mockReset();
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "key");
  vi.stubEnv("RESEND_WORKSPACE_FROM", "NeuraMeet <hi@x.com>");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isAppPath", () => {
  it("takes only one leading slash", () => {
    expect(isAppPath("/projects/p1")).toBe(true);
    expect(isAppPath("//evil.test")).toBe(false);
    expect(isAppPath("https://evil.test")).toBe(false);
    expect(isAppPath("projects")).toBe(false);
    expect(isAppPath("")).toBe(false);
  });
});

describe("categories", () => {
  it("places all 13 kinds exactly once", () => {
    const all = Object.values(NOTIFICATION_CATEGORIES).flat();
    expect(all).toHaveLength(13);
    expect(new Set(all).size).toBe(13);
  });
});

describe("notify", () => {
  it("rejects an outside link and writes nothing", async () => {
    expect(await notify(supabase, input({ link: "//evil.test" }))).toBe(0);
    expect(callsOf("notifications", "upsert")).toHaveLength(0);
  });

  it("writes nothing with no recipients", async () => {
    expect(await notify(supabase, input({ userIds: [] }))).toBe(0);
    expect(callsOf("notifications", "upsert")).toHaveLength(0);
  });

  it("writes one row per person, ignoring duplicates on the dedupe key", async () => {
    queue(
      "notifications",
      ok([
        { id: "n1", user_id: "a" },
        { id: "n2", user_id: "b" },
      ]),
    );
    queue("user_settings", ok([]));
    budget(0);
    getUserList.mockResolvedValue(usersOf("a", "b"));

    const count = await notify(supabase, input({ userIds: ["a", "b", "a"] }));

    expect(count).toBe(2);
    const [rows, options] = callsOf("notifications", "upsert")[0].args as [
      { user_id: string; dedupe_key: string }[],
      unknown,
    ];
    expect(rows.map((r) => r.user_id)).toEqual(["a", "b"]);
    expect(rows[0].dedupe_key).toBe("task_assigned:t1:1");
    expect(options).toEqual({
      onConflict: "user_id,dedupe_key",
      ignoreDuplicates: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends no email when the row already existed", async () => {
    queue("notifications", ok([]));
    expect(await notify(supabase, input())).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when the insert fails", async () => {
    queue("notifications", { data: null, error: { message: "boom" } });
    await expect(notify(supabase, input())).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the row when Clerk fails while reading addresses", async () => {
    queue("notifications", ok([{ id: "n1", user_id: "u1" }]));
    queue("user_settings", ok([]));
    budget(0);
    getUserList.mockRejectedValue(new Error("clerk down"));
    await expect(notify(supabase, input())).resolves.toBe(0);
    expect(callsOf("notifications", "upsert")).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("email false writes the row and sends nothing", async () => {
    queue("notifications", ok([{ id: "n1", user_id: "u1" }]));
    expect(await notify(supabase, input({ email: false }))).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing without a workspace sender", async () => {
    vi.stubEnv("RESEND_WORKSPACE_FROM", "");
    queue("notifications", ok([{ id: "n1", user_id: "u1" }]));
    expect(await notify(supabase, input())).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips a person whose toggle is off", async () => {
    queue(
      "notifications",
      ok([
        { id: "n1", user_id: "a" },
        { id: "n2", user_id: "b" },
      ]),
    );
    queue("user_settings", ok([{ user_id: "a" }]));
    budget(0);
    getUserList.mockResolvedValue(usersOf("b"));
    await notify(supabase, input({ userIds: ["a", "b"] }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toBe("b@x.com");
  });

  it("writes the row and sends nothing once the budget is spent", async () => {
    queue("notifications", ok([{ id: "n1", user_id: "u1" }]));
    queue("user_settings", ok([]));
    budget(EVENT_EMAIL_DAILY_CAP);
    expect(await notify(supabase, input())).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops inside a batch when the budget runs out", async () => {
    queue(
      "notifications",
      ok([
        { id: "n1", user_id: "a" },
        { id: "n2", user_id: "b" },
      ]),
    );
    queue("user_settings", ok([]));
    budget(EVENT_EMAIL_DAILY_CAP - 1);
    getUserList.mockResolvedValue(usersOf("a", "b"));
    await notify(supabase, input({ userIds: ["a", "b"] }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stamps emailed_at only after a sent email", async () => {
    queue(
      "notifications",
      ok([
        { id: "n1", user_id: "a" },
        { id: "n2", user_id: "b" },
      ]),
    );
    queue("user_settings", ok([]));
    budget(0);
    getUserList.mockResolvedValue(usersOf("a", "b"));
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    await notify(supabase, input({ userIds: ["a", "b"] }));
    expect(callsOf("notifications", "update")).toHaveLength(1);
    expect(callsOf("notifications", "eq")[0].args).toEqual(["id", "n2"]);
  });

  it("escapes the body and uses an absolute link", async () => {
    queue("notifications", ok([{ id: "n1", user_id: "u1" }]));
    queue("user_settings", ok([]));
    budget(0);
    getUserList.mockResolvedValue(usersOf("u1"));
    await notify(supabase, input());
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.subject).toBe("You were assigned ABC-1");
    expect(sent.html).toContain("Fix &lt;login&gt;");
    expect(sent.html).not.toContain("Fix <login>");
    expect(sent.html).toContain("https://app.test/projects/p1");
    expect(sent.html).toContain("https://app.test/settings?tab=notifications");
  });
});

describe("projectAdminIds", () => {
  it("reads active owners and admins", async () => {
    queue("project_members", ok([{ user_id: "o" }, { user_id: "a" }]));
    expect(await projectAdminIds(supabase, "p1")).toEqual(["o", "a"]);
    expect(callsOf("project_members", "is")[0].args).toEqual([
      "removed_at",
      null,
    ]);
  });
});
