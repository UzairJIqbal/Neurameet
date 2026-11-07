import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import {
  calls,
  callsOf,
  ok,
  queue,
  resetQueues,
} from "@/test/supabase-queue-mock";
import * as github from "./github/route";
import * as notifications from "./notifications/route";
import * as counts from "../my-counts/route";

const post = (body: unknown) =>
  notifications.POST(
    new Request("http://localhost/api/settings/notifications", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  mockAuth.mockResolvedValue({ userId: "u1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.unstubAllEnvs());

describe("/api/settings/github", () => {
  it("is 401 signed out", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    expect((await github.GET()).status).toBe(401);
    expect((await github.DELETE()).status).toBe(401);
  });

  it("reports a connected account and an account state link", async () => {
    queue("user_settings", ok({ github_login: "octo", github_user_id: 7 }));
    const body = await (await github.GET()).json();
    expect(body).toMatchObject({ connected: true, login: "octo" });
    expect(body.authorizeUrl).toContain("state=acct.");
  });

  it("reports not connected for a missing row", async () => {
    const body = await (await github.GET()).json();
    expect(body).toMatchObject({ connected: false, login: null });
  });

  it("still reports status when the GitHub App is not set up", async () => {
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "");
    queue("user_settings", ok({ github_login: "octo", github_user_id: 7 }));
    const res = await github.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).authorizeUrl).toBeNull();
  });

  it("disconnect clears your own link and touches nothing else", async () => {
    expect((await github.DELETE()).status).toBe(200);
    const [patch] = callsOf("user_settings", "update")[0].args;
    expect(patch).toMatchObject({ github_login: null, github_user_id: null });
    expect(callsOf("user_settings", "eq")[0].args).toEqual(["user_id", "u1"]);
    expect(calls.filter((c) => c.table !== "user_settings")).toEqual([]);
  });
});

describe("/api/settings/notifications", () => {
  it("reads true for a missing row", async () => {
    const body = await (await notifications.GET()).json();
    expect(body).toEqual({ emailNotifications: true, digestEmails: true });
  });

  it.each([[{}], [{ digestEmails: "no" }], [{ emailNotifications: 1 }]])(
    "refuses %j",
    async (body) => {
      expect((await post(body)).status).toBe(422);
      expect(callsOf("user_settings", "upsert")).toEqual([]);
    },
  );

  it("writes only the toggle you sent", async () => {
    expect((await post({ digestEmails: false })).status).toBe(200);
    const [row] = callsOf("user_settings", "upsert")[0].args as [
      Record<string, unknown>,
    ];
    expect(row.digest_emails).toBe(false);
    expect(row).not.toHaveProperty("email_notifications");
  });
});

describe("GET /api/my-counts", () => {
  it("is 401 signed out", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    expect((await counts.GET()).status).toBe(401);
  });

  it("does not count tasks with no active project", async () => {
    queue("project_members", ok([]));
    queue("meetings", { ...ok(null), count: 2 });
    queue(
      "notifications",
      { ...ok(null), count: 4 },
      { ...ok(null), count: 1 },
    );
    const body = await (await counts.GET()).json();
    expect(body).toEqual({
      openTasks: 0,
      upcomingMeetings: 2,
      unread: 4,
      prReviews: 1,
    });
    expect(callsOf("tasks", "select")).toEqual([]);
  });
});
