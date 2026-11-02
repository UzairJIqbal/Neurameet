import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAuth, mockGetUserList, mockGetUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUserList: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: async () => ({
    users: { getUserList: mockGetUserList, getUser: mockGetUser },
  }),
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import {
  queue,
  ok,
  resetQueues,
  callsOf,
  type QueryResult,
} from "@/test/supabase-queue-mock";
import { hashInviteToken } from "@/lib/invitations";
import {
  POST as createInvite,
  GET as listInvites,
} from "../projects/[id]/invitations/route";
import { DELETE as revokeInvite } from "../projects/[id]/invitations/[invitationId]/route";
import { GET as listRequests } from "../projects/[id]/join-requests/route";
import { POST as decideRequest } from "../projects/[id]/join-requests/[requestId]/route";
import { GET as preview } from "./preview/route";
import { POST as accept } from "./accept/route";

const P = "p1";
const INV = "11111111-1111-4111-8111-111111111111";
const REQ = "22222222-2222-4222-8222-222222222222";
const TOKEN = "A".repeat(43);
const idParams = { params: Promise.resolve({ id: P }) };

const post = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
  });
const signIn = (userId: string | null) =>
  mockAuth.mockResolvedValue({ userId });
const role = (r: string | null) =>
  queue("project_members", ok(r ? { role: r } : null));
const fail = (message: string, code?: string) => ({
  data: null,
  error: { message, code },
});
const count = (n: number): QueryResult => ({
  data: null,
  error: null,
  count: n,
});
const failureRows = () =>
  callsOf("audit_log", "insert").filter(
    (c) => (c.args[0] as { action?: string }).action === "invite.accept_failed",
  );

const inviteRow = (over: Record<string, unknown> = {}) => ({
  id: INV,
  project_id: P,
  kind: "email",
  email: "b@x.com",
  role: "developer",
  created_by: "owner",
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  revoked_at: null,
  used_at: null,
  ...over,
});

const clerkUser = (email: string, verified = true) =>
  mockGetUser.mockResolvedValue({
    firstName: "Bilal",
    lastName: "Ahmed",
    username: null,
    primaryEmailAddress: {
      emailAddress: email,
      verification: { status: verified ? "verified" : "unverified" },
    },
  });

// Accept and preview: rate limit count, then the invite, then membership and pending.
const loaded = (
  invite: Record<string, unknown> | null,
  opts: { member?: boolean; pending?: boolean; failures?: number } = {},
) => {
  queue("audit_log", count(opts.failures ?? 0));
  queue("project_invitations", ok(invite));
  if (!invite) return;
  queue("project_members", ok(opts.member ? { user_id: "u2" } : null));
  queue("project_join_requests", ok(opts.pending ? { id: REQ } : null));
  queue("projects", ok({ name: "Core" }));
};

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  signIn("u1");
  mockGetUserList.mockResolvedValue({ data: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/projects/[id]/invitations", () => {
  const created = (over: Record<string, unknown> = {}) =>
    queue("rpc:create_project_invitation", ok(inviteRow(over)));

  it("creates an email invite, stores only the hash, returns the link once", async () => {
    role("owner");
    created();
    const res = await createInvite(
      post({ kind: "email", email: "  B@X.com ", role: "developer" }),
      idParams,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.emailSent).toBe(false);
    expect(body.invitation).toEqual({
      id: INV,
      kind: "email",
      email: "b@x.com",
      role: "developer",
      expiresAt: expect.any(String),
    });
    const token = (body.link as string).split("/invite/")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const args = callsOf("rpc:create_project_invitation", "rpc")[0]
      .args[0] as Record<string, unknown>;
    expect(args).toMatchObject({
      p_project: P,
      p_kind: "email",
      p_email: "b@x.com",
      p_role: "developer",
      p_created_by: "u1",
      p_max_active: 50,
      p_token_hash: hashInviteToken(token),
    });
    expect(JSON.stringify(args)).not.toContain(token);
  });

  it("a Developer can't invite (403)", async () => {
    role("developer");
    const res = await createInvite(
      post({ kind: "link", role: "viewer" }),
      idParams,
    );
    expect(res.status).toBe(403);
  });

  it("an Admin can't invite an Admin (403)", async () => {
    role("admin");
    const res = await createInvite(
      post({ kind: "email", email: "b@x.com", role: "admin" }),
      idParams,
    );
    expect(res.status).toBe(403);
  });

  it("a link invite can't grant Admin (422)", async () => {
    role("owner");
    const res = await createInvite(
      post({ kind: "link", role: "admin" }),
      idParams,
    );
    expect(res.status).toBe(422);
  });

  it.each([
    [{ kind: "email", email: "nope", role: "viewer" }],
    [{ kind: "email", role: "viewer" }],
    [{ kind: "sms", role: "viewer" }],
    [{ kind: "link", role: "owner" }],
  ])("rejects %j with 422", async (body) => {
    role("owner");
    expect((await createInvite(post(body), idParams)).status).toBe(422);
    expect(callsOf("rpc:create_project_invitation", "rpc")).toHaveLength(0);
  });

  it("the active cap gives 422 and a slipped race gives 409", async () => {
    role("owner");
    queue("rpc:create_project_invitation", fail("cap_reached"));
    expect(
      (await createInvite(post({ kind: "link", role: "viewer" }), idParams))
        .status,
    ).toBe(422);
    role("owner");
    queue("rpc:create_project_invitation", fail("duplicate", "23505"));
    expect(
      (
        await createInvite(
          post({ kind: "email", email: "b@x.com", role: "viewer" }),
          idParams,
        )
      ).status,
    ).toBe(409);
  });

  it("sends the email when a workspace sender is set and the budget allows", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("RESEND_WORKSPACE_FROM", "invites@example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    role("owner");
    created();
    queue("audit_log", count(3));
    queue("projects", ok({ name: "Core" }));
    const res = await createInvite(
      post({ kind: "email", email: "b@x.com", role: "developer" }),
      idParams,
    );
    expect((await res.json()).emailSent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const emailed = callsOf("audit_log", "insert")[0].args[0];
    expect(emailed).toMatchObject({
      action: "invite.emailed",
      target_id: INV,
      detail: {},
    });
  });

  it("skips the email when the day's budget is spent", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("RESEND_WORKSPACE_FROM", "invites@example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    role("owner");
    created();
    queue("audit_log", count(60));
    const res = await createInvite(
      post({ kind: "email", email: "b@x.com", role: "developer" }),
      idParams,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).emailSent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never emails without RESEND_WORKSPACE_FROM", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("RESEND_WORKSPACE_FROM", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    role("owner");
    created();
    const res = await createInvite(
      post({ kind: "email", email: "b@x.com", role: "developer" }),
      idParams,
    );
    expect((await res.json()).emailSent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects/[id]/invitations", () => {
  it("lists active invites without a token or hash", async () => {
    role("admin");
    queue(
      "project_invitations",
      ok([
        {
          id: INV,
          kind: "link",
          email: null,
          role: "viewer",
          expires_at: "2026-11-10",
          created_at: "2026-11-03",
          created_by: "u1",
        },
      ]),
    );
    const res = await listInvites(new Request("http://localhost"), idParams);
    const body = await res.json();
    expect(body.invitations[0]).toEqual({
      id: INV,
      kind: "link",
      email: null,
      role: "viewer",
      expiresAt: "2026-11-10",
      createdAt: "2026-11-03",
      createdByName: "Unknown member",
    });
    const columns = callsOf("project_invitations", "select")[0].args[0];
    expect(columns).not.toContain("token");
  });

  it("is Owner or Admin only", async () => {
    role("viewer");
    expect(
      (await listInvites(new Request("http://localhost"), idParams)).status,
    ).toBe(403);
  });
});

describe("DELETE /api/projects/[id]/invitations/[invitationId]", () => {
  const params = (invitationId: string) => ({
    params: Promise.resolve({ id: P, invitationId }),
  });

  it("revokes through the rpc", async () => {
    role("owner");
    const res = await revokeInvite(
      new Request("http://localhost"),
      params(INV),
    );
    expect(await res.json()).toEqual({ ok: true });
    expect(callsOf("rpc:revoke_project_invitation", "rpc")[0].args[0]).toEqual({
      p_invitation: INV,
      p_project: P,
      p_actor: "u1",
    });
  });

  it("404 for an invite in another project or a bad id", async () => {
    role("owner");
    queue("rpc:revoke_project_invitation", fail("not_found"));
    expect(
      (await revokeInvite(new Request("http://localhost"), params(INV))).status,
    ).toBe(404);
    role("owner");
    expect(
      (await revokeInvite(new Request("http://localhost"), params("x"))).status,
    ).toBe(404);
  });
});

describe("GET /api/invitations/preview", () => {
  const open = (token = TOKEN) =>
    preview(
      new Request(`http://localhost/api/invitations/preview?token=${token}`),
    );

  beforeEach(() => signIn("u2"));

  it("shows project, role, kind, status and never the email", async () => {
    loaded(inviteRow());
    const res = await open();
    const body = await res.json();
    expect(body).toEqual({
      projectName: "Core",
      role: "developer",
      kind: "email",
      status: "valid",
    });
    expect(JSON.stringify(body)).not.toContain("b@x.com");
    expect(callsOf("rpc:accept_email_invitation", "rpc")).toHaveLength(0);
  });

  it("a member also gets the project id to link to", async () => {
    loaded(inviteRow(), { member: true });
    const body = await (await open()).json();
    expect(body).toMatchObject({ status: "member", projectId: P });
  });

  it("an unknown token is 410 with a failure row and no project", async () => {
    loaded(null);
    const res = await open();
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("This invite is no longer valid");
    expect(failureRows()[0].args[0]).toMatchObject({
      actor_id: "u2",
      project_id: null,
    });
  });

  it("a revoked invite gives the same 410", async () => {
    loaded(inviteRow({ revoked_at: "2026-11-02" }));
    const res = await open();
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("This invite is no longer valid");
  });

  it("is 429 after 10 failures, before any token work", async () => {
    queue("audit_log", count(10));
    expect((await open()).status).toBe(429);
    expect(callsOf("project_invitations", "select")).toHaveLength(0);
  });
});

describe("POST /api/invitations/accept", () => {
  beforeEach(() => signIn("u2"));

  it("joins on a matching verified email", async () => {
    loaded(inviteRow());
    clerkUser("B@x.com");
    const res = await accept(post({ token: TOKEN }));
    expect(await res.json()).toEqual({ status: "joined", projectId: P });
    expect(callsOf("rpc:accept_email_invitation", "rpc")[0].args[0]).toEqual({
      p_invitation: INV,
      p_user: "u2",
    });
  });

  it("a different email is 403, writes a failure row, uses nothing", async () => {
    loaded(inviteRow());
    clerkUser("c@x.com");
    const res = await accept(post({ token: TOKEN }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "This invite is for a different email",
    );
    expect(callsOf("rpc:accept_email_invitation", "rpc")).toHaveLength(0);
    expect(failureRows()).toHaveLength(1);
  });

  it.each([
    [{ used_at: "2026-11-02" }],
    [{ expires_at: "2026-01-01T00:00:00Z" }],
    [{ revoked_at: "2026-11-02" }],
  ])("%j is 410", async (over) => {
    loaded(inviteRow(over));
    const res = await accept(post({ token: TOKEN }));
    expect(res.status).toBe(410);
    expect(failureRows()).toHaveLength(1);
  });

  it("the losing tab of two accepts gets 410", async () => {
    loaded(inviteRow());
    clerkUser("b@x.com");
    queue("rpc:accept_email_invitation", fail("gone"));
    expect((await accept(post({ token: TOKEN }))).status).toBe(410);
  });

  it("an active member gets joined with no change", async () => {
    loaded(inviteRow({ used_at: "2026-11-02" }), { member: true });
    const res = await accept(post({ token: TOKEN }));
    expect(await res.json()).toEqual({ status: "joined", projectId: P });
    expect(callsOf("rpc:accept_email_invitation", "rpc")).toHaveLength(0);
  });

  it("a link creates a pending request with the Clerk snapshot", async () => {
    loaded(inviteRow({ kind: "link", email: null, role: "viewer" }));
    clerkUser("c@x.com", false);
    const res = await accept(post({ token: TOKEN }));
    expect(await res.json()).toEqual({ status: "pending", projectId: P });
    expect(callsOf("rpc:request_project_join", "rpc")[0].args[0]).toEqual({
      p_invitation: INV,
      p_user: "u2",
      p_name: "Bilal Ahmed",
      p_email: "c@x.com",
    });
  });

  it("opening a link again keeps the one pending request", async () => {
    loaded(inviteRow({ kind: "link", email: null }), { pending: true });
    const res = await accept(post({ token: TOKEN }));
    expect(await res.json()).toEqual({ status: "pending", projectId: P });
    expect(callsOf("rpc:request_project_join", "rpc")).toHaveLength(0);
  });

  it("a link revoked mid request is 410", async () => {
    loaded(inviteRow({ kind: "link", email: null }));
    clerkUser("c@x.com");
    queue("rpc:request_project_join", fail("gone"));
    expect((await accept(post({ token: TOKEN }))).status).toBe(410);
  });

  it("a malformed token is 410 without a lookup", async () => {
    queue("audit_log", count(0));
    expect((await accept(post({ token: "../x" }))).status).toBe(410);
    expect(callsOf("project_invitations", "select")).toHaveLength(0);
  });

  it("the 11th failed try in 10 minutes is 429", async () => {
    queue("audit_log", count(10));
    expect((await accept(post({ token: TOKEN }))).status).toBe(429);
  });
});

describe("join requests", () => {
  const params = (requestId: string) => ({
    params: Promise.resolve({ id: P, requestId }),
  });

  it("lists pending requests for an Owner or Admin", async () => {
    role("admin");
    queue(
      "project_join_requests",
      ok([
        {
          id: REQ,
          display_name: "Sara",
          email: "s@x.com",
          role: "viewer",
          created_at: "2026-11-03",
        },
      ]),
    );
    const res = await listRequests(new Request("http://localhost"), idParams);
    expect((await res.json()).requests).toEqual([
      {
        id: REQ,
        displayName: "Sara",
        email: "s@x.com",
        role: "viewer",
        createdAt: "2026-11-03",
      },
    ]);
  });

  it("a Developer can't list them", async () => {
    role("developer");
    expect(
      (await listRequests(new Request("http://localhost"), idParams)).status,
    ).toBe(403);
  });

  it("approves and returns the updated request", async () => {
    role("owner");
    queue(
      "rpc:decide_join_request",
      ok({
        id: REQ,
        display_name: "Sara",
        email: "s@x.com",
        role: "viewer",
        status: "approved",
        decided_at: "2026-11-03",
        created_at: "2026-11-02",
      }),
    );
    const res = await decideRequest(post({ decision: "approve" }), params(REQ));
    expect((await res.json()).request).toMatchObject({
      id: REQ,
      status: "approved",
    });
    expect(callsOf("rpc:decide_join_request", "rpc")[0].args[0]).toEqual({
      p_request: REQ,
      p_project: P,
      p_actor: "u1",
      p_decision: "approve",
    });
  });

  it("deciding twice is 409", async () => {
    role("owner");
    queue("rpc:decide_join_request", fail("already_decided"));
    expect(
      (await decideRequest(post({ decision: "deny" }), params(REQ))).status,
    ).toBe(409);
  });

  it("a bad decision is 422", async () => {
    role("owner");
    expect(
      (await decideRequest(post({ decision: "maybe" }), params(REQ))).status,
    ).toBe(422);
  });
});
