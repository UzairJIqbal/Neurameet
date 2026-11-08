// AC-81 and AC-82 gaps. Each clause that an existing test already covers is
// listed in docs/specs/0004-conversations-to-code/verify.md; this file holds the
// attacks no other test makes: a signature made for a different body, a forged
// install state, and a removed member on an old invite. Every rejected case
// also asserts that nothing was written.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

const { mockAuth, mockGetUser, mockUserToken, mockHandle } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUser: vi.fn(),
  mockUserToken: vi.fn(),
  mockHandle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: async () => ({
    users: { getUserList: async () => ({ data: [] }), getUser: mockGetUser },
  }),
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/github")>()),
  userToken: mockUserToken,
  userInstallations: async () => [],
  appSlug: async () => "neuramet-app",
}));
vi.mock("@/lib/github-rules", () => ({ handleGitHubEvent: mockHandle }));

import {
  calls,
  callsOf,
  ok,
  queue,
  resetQueues,
  type QueryResult,
} from "@/test/supabase-queue-mock";
import { signInstallState } from "@/lib/github";
import { POST as webhook } from "./github/webhook/route";
import { GET as callback } from "./github/callback/route";
import { POST as accept } from "./invitations/accept/route";

const SECRET = "hook-secret";
const sign = (body: string) =>
  `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

const hook = (
  body: string,
  signature: string,
  deliveryId = "attack-1",
): Request =>
  new Request("http://localhost/api/github/webhook", {
    method: "POST",
    body,
    headers: {
      "x-hub-signature-256": signature,
      "x-github-delivery": deliveryId,
      "x-github-event": "pull_request",
    },
  });

const writes = () =>
  calls.filter((c) =>
    ["insert", "update", "delete", "upsert", "rpc"].includes(c.method),
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.unstubAllEnvs());

describe("AC-81: webhook attacks leave the database unchanged", () => {
  const body = JSON.stringify({ action: "closed", number: 7 });

  it("a valid signature made for a different body is refused", async () => {
    const other = JSON.stringify({ action: "closed", number: 8 });
    const res = await webhook(hook(body, sign(other)));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it("a body changed by one byte after signing is refused", async () => {
    const res = await webhook(hook(`${body} `, sign(body)));
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("a signature made with another secret is refused", async () => {
    const forged = `sha256=${createHmac("sha256", "not-the-secret").update(body).digest("hex")}`;
    expect((await webhook(hook(body, forged))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("a signature of the wrong length is refused, not thrown on", async () => {
    expect((await webhook(hook(body, "sha256=abcd"))).status).toBe(401);
    expect((await webhook(hook(body, "sha1=abcd"))).status).toBe(401);
    expect((await webhook(hook(body, ""))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("a signed delivery for an unlinked repo is stored as ignored and changes no task", async () => {
    mockHandle.mockResolvedValue("ignored");
    const res = await webhook(hook(body, sign(body), "unlinked-1"));
    expect(res.status).toBe(202);
    // Only the delivery log is written; no task, link, or event table.
    const tables = new Set(writes().map((c) => c.table));
    expect([...tables].every((t) => t === "github_deliveries")).toBe(true);
  });
});

describe("AC-81: a forged install state on the callback", () => {
  const visit = async (state: string) => {
    mockAuth.mockResolvedValue({ userId: "u1" });
    const url = new URL("http://localhost/api/github/callback");
    url.searchParams.set("state", state);
    url.searchParams.set("code", "the-code");
    const res = await callback(new Request(url));
    return {
      status: res.status,
      location: new URL(res.headers.get("location") as string),
    };
  };

  // Signed per test: the key comes from env, which is stubbed in beforeEach.
  const parts = () => signInstallState("p1", "u1").split(".");

  it.each([
    [
      "a tampered payload",
      () => `${Buffer.from("p2:u1:1").toString("base64url")}.${parts()[1]}`,
    ],
    [
      "a tampered signature",
      () => `${parts()[0]}.${parts()[1].slice(0, -2)}aa`,
    ],
    ["no signature", () => parts()[0]],
    ["garbage", () => "../../etc/passwd"],
    ["an empty value", () => ""],
  ])(
    "%s is turned away and nothing is exchanged or stored",
    async (_n, make) => {
      const { status, location } = await visit(make());
      // The callback is a browser redirect flow (AC-43a), so a forged state is a
      // redirect to the expired page, never a link and never a token exchange.
      expect([302, 307]).toContain(status);
      expect(location.pathname).toBe("/projects");
      expect(location.search).toBe("?github=expired");
      expect(mockUserToken).not.toHaveBeenCalled();
      expect(writes()).toEqual([]);
    },
  );
});

describe("AC-82: a removed member and old invites", () => {
  const TOKEN = "A".repeat(43);
  const P = "p1";
  const post = () =>
    new Request("http://localhost/api/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: TOKEN }),
    });
  const count = (n: number): QueryResult => ({
    data: null,
    error: null,
    count: n,
  });
  const invite = (over: Record<string, unknown>) => ({
    id: "11111111-1111-4111-8111-111111111111",
    project_id: P,
    kind: "email",
    email: "b@x.com",
    role: "developer",
    created_by: "owner",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    revoked_at: null,
    used_at: null,
    declined_at: null,
    created_at: "2026-11-01T00:00:00Z",
    ...over,
  });
  // Rate count, the invite, then membership (none: removed), pending, project.
  const asRemovedMember = (row: Record<string, unknown>) => {
    queue("audit_log", count(0));
    queue("project_invitations", ok(row));
    queue("project_members", ok(null));
    queue("project_join_requests", ok(null));
    queue("projects", ok({ name: "Core" }));
  };

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: "removed-user" });
    mockGetUser.mockResolvedValue({
      firstName: "Bilal",
      lastName: "Ahmed",
      username: null,
      primaryEmailAddress: {
        emailAddress: "b@x.com",
        verification: { status: "verified" },
      },
    });
  });

  it("an old used email invite is 410 and does not re-add them", async () => {
    asRemovedMember(invite({ used_at: "2026-11-02T00:00:00Z" }));
    const res = await accept(post());
    expect(res.status).toBe(410);
    expect(callsOf("rpc:accept_email_invitation", "rpc")).toEqual([]);
    expect(callsOf("project_members", "insert")).toEqual([]);
  });

  it("membership is checked against active rows only (removed_at is null)", async () => {
    asRemovedMember(invite({ used_at: "2026-11-02T00:00:00Z" }));
    await accept(post());
    const filters = callsOf("project_members", "is");
    expect(
      filters.some((c) => c.args[0] === "removed_at" && c.args[1] === null),
    ).toBe(true);
  });

  it("a valid link invite makes a pending request, never a direct rejoin", async () => {
    asRemovedMember(invite({ kind: "link", email: null, role: "viewer" }));
    const res = await accept(post());
    expect(await res.json()).toEqual({ status: "pending", projectId: P });
    expect(callsOf("rpc:request_project_join", "rpc")).toHaveLength(1);
    expect(callsOf("rpc:accept_email_invitation", "rpc")).toEqual([]);
    expect(callsOf("project_members", "insert")).toEqual([]);
    expect(callsOf("project_members", "update")).toEqual([]);
  });
});
