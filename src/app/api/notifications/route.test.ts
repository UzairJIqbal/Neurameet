import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  escapeHtml: (t: string) => t,
  sendWorkspaceEmail: vi.fn(),
  workspaceEmailConfigured: () => false,
}));
vi.mock("@/lib/invitations", () => ({
  workspaceEmailsSentToday: vi.fn(),
  isUuid: (v: string) => /^[0-9a-f-]{36}$/.test(v),
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";
import { GET } from "./route";
import { POST } from "./read/route";

const UUID = "00000000-0000-4000-8000-000000000001";
const TS = "2026-11-07T10:00:00+00:00";

const get = (qs = "") =>
  GET(new Request(`http://localhost/api/notifications${qs}`));
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/notifications/read", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

const row = (id: string, createdAt = TS) => ({
  id,
  project_id: "p1",
  kind: "pr_review_requested",
  title: "Your review was requested",
  body: "acme/r #3",
  link: "/projects/p1?tab=github",
  read_at: null,
  created_at: createdAt,
});

beforeEach(() => {
  resetQueues();
  mockAuth.mockResolvedValue({ userId: "u1" });
  queue("project_members", ok([{ project_id: "p1" }]));
});

describe("GET /api/notifications", () => {
  it("is 401 signed out", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    expect((await get()).status).toBe(401);
  });

  it("is 422 on a bad cursor or category", async () => {
    expect((await get("?cursor=nope")).status).toBe(422);
    expect((await get("?category=nope")).status).toBe(422);
  });

  it("scopes to you and your active projects, invitations excepted", async () => {
    queue("notifications", ok([row(UUID)]));
    queue("projects", ok([{ id: "p1", name: "Apollo" }]));
    const res = await get();
    const json = await res.json();
    expect(callsOf("notifications", "eq")[0].args).toEqual(["user_id", "u1"]);
    expect(callsOf("notifications", "or")[0].args[0]).toBe(
      "project_id.in.(p1),kind.eq.project_invitation",
    );
    expect(json.items[0]).toMatchObject({
      projectName: "Apollo",
      category: "github",
    });
  });

  it("filters unread and category in SQL", async () => {
    queue("notifications", ok([]));
    await get("?unread=1&category=meetings");
    expect(callsOf("notifications", "is")[0].args).toEqual(["read_at", null]);
    expect(callsOf("notifications", "in")[0].args).toEqual([
      "kind",
      ["meeting_scheduled"],
    ]);
  });

  it("pages at 20 and returns the next cursor", async () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      row(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`),
    );
    queue("notifications", ok(rows));
    queue("projects", ok([]));
    const json = await (await get()).json();
    expect(json.items).toHaveLength(20);
    expect(json.nextCursor).toBe(`${TS}|${rows[19].id}`);
  });
});

describe("POST /api/notifications/read", () => {
  it("is 401 signed out", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    expect((await post({ all: true })).status).toBe(401);
  });

  it("is 422 on a bad body", async () => {
    expect((await post({})).status).toBe(422);
    expect((await post({ ids: ["nope"] })).status).toBe(422);
    expect((await post({ all: true, unread: true })).status).toBe(422);
  });

  it("marks only your rows read", async () => {
    expect((await post({ ids: [UUID] })).status).toBe(200);
    expect(callsOf("notifications", "eq")[0].args).toEqual(["user_id", "u1"]);
    const update = callsOf("notifications", "update")[0].args[0] as {
      read_at: string | null;
    };
    expect(update.read_at).not.toBeNull();
  });

  it("marks a row unread", async () => {
    await post({ ids: [UUID], unread: true });
    expect(callsOf("notifications", "update")[0].args[0]).toEqual({
      read_at: null,
    });
  });
});
