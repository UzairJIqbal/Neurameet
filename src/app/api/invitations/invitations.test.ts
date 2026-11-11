import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAuth, mockGetUserList, mockGetUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUserList: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
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
import { POST as resendInvite } from "../projects/[id]/invitations/[invitationId]/resend/route";
import { GET as listRequests } from "../projects/[id]/join-requests/route";
import { POST as decideRequest } from "../projects/[id]/join-requests/[requestId]/route";
import { GET as preview } from "./preview/route";
import { POST as accept } from "./accept/route";
import { GET as listMine } from "./mine/route";
import { POST as decideMine } from "./mine/[id]/route";

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
  declined_at: null,
  created_at: "2026-11-01T00:00:00Z",
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
    expect(body.emailSent).toBeUndefined();
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

describe("POST /api/projects/[id]/invitations/[invitationId]/resend", () => {
  const resend = (invitationId = INV) =>
    resendInvite(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ id: P, invitationId }),
    });
  const stored = (over: Record<string, unknown> = {}) => ({
    ...inviteRow(),
    declined_at: null,
    ...over,
  });

  it("replaces the token and expiry, so the old link stops working", async () => {
    role("owner");
    queue("project_invitations", ok(stored()), ok({ id: INV }));
    const res = await resend();
    expect(res.status).toBe(200);
    const body = await res.json();
    const token = String(body.link).split("/").pop() as string;
    const update = callsOf("project_invitations", "update")[0].args[0] as {
      token_hash: string;
      expires_at: string;
    };
    expect(update.token_hash).toBe(hashInviteToken(token));
    expect(update.token_hash).not.toBe(token);
    const days =
      (new Date(update.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it("never writes the token to the audit", async () => {
    role("admin");
    queue("project_invitations", ok(stored()), ok({ id: INV }));
    const body = await (await resend()).json();
    const audit = callsOf("audit_log", "insert")[0].args[0] as {
      action: string;
      detail: unknown;
    };
    expect(audit.action).toBe("invite.resent");
    expect(JSON.stringify(audit)).not.toContain(
      String(body.link).split("/").pop(),
    );
  });

  it("returns 422 for a link invite", async () => {
    role("owner");
    queue("project_invitations", ok(stored({ kind: "link", email: null })));
    expect((await resend()).status).toBe(422);
    expect(callsOf("project_invitations", "update")).toHaveLength(0);
  });

  it.each([
    ["revoked", { revoked_at: "2026-11-01T00:00:00Z" }],
    ["used", { used_at: "2026-11-01T00:00:00Z" }],
    ["declined", { declined_at: "2026-11-01T00:00:00Z" }],
    ["expired", { expires_at: "2020-01-01T00:00:00Z" }],
  ])("returns 410 for a %s invite", async (_name, over) => {
    role("owner");
    queue("project_invitations", ok(stored(over)));
    expect((await resend()).status).toBe(410);
    expect(callsOf("project_invitations", "update")).toHaveLength(0);
  });

  it("returns 410 when it loses a race with a revoke", async () => {
    role("owner");
    queue("project_invitations", ok(stored()), ok(null));
    expect((await resend()).status).toBe(410);
    expect(callsOf("audit_log", "insert")).toHaveLength(0);
  });

  it("returns 404 for a bad id or another project's invite", async () => {
    role("owner");
    expect((await resend("not-a-uuid")).status).toBe(404);
    role("owner");
    queue("project_invitations", ok(null));
    expect((await resend()).status).toBe(404);
  });

  it("stops an Admin resending an Admin invite", async () => {
    role("admin");
    queue("project_invitations", ok(stored({ role: "admin" })));
    expect((await resend()).status).toBe(403);
    expect(callsOf("project_invitations", "update")).toHaveLength(0);
  });

  it("returns 403 to a Developer and 401 when signed out", async () => {
    role("developer");
    expect((await resend()).status).toBe(403);
    signIn(null);
    expect((await resend()).status).toBe(401);
  });
});

describe("GET /api/invitations/preview", () => {
  const open = (token = TOKEN) =>
    preview(
      new Request(`http://localhost/api/invitations/preview?token=${token}`),
    );

  beforeEach(() => {
    signIn("u2");
    clerkUser("someone.else@x.com");
  });

  // AC-70s: what the page reads after the invite itself loads.
  const facts = (repos: Record<string, unknown>[] = []) => {
    queue(
      "projects",
      ok({
        description: "Payments",
        icon: "rocket",
        color: "primary",
        created_at: "2026-10-01T00:00:00Z",
      }),
    );
    queue("project_members", {
      data: [{ user_id: "owner" }, { user_id: "u9" }],
      error: null,
      count: 2,
    });
    queue("tasks", count(5));
    queue("meetings", count(3));
    queue("github_repos", ok(repos));
    mockGetUserList.mockResolvedValue({
      data: [
        { id: "owner", firstName: "Olivia", lastName: "", imageUrl: "" },
        { id: "u9", firstName: "Zara", lastName: "", imageUrl: "" },
      ],
    });
  };

  it("shows project, role, kind, status and never the email", async () => {
    loaded(inviteRow());
    facts();
    const res = await open();
    const body = await res.json();
    expect(body).toMatchObject({
      projectName: "Core",
      role: "developer",
      kind: "email",
      status: "valid",
      inviterName: "Olivia",
      description: "Payments",
      memberCount: 2,
      taskCount: 5,
      meetingCount: 3,
      createdAt: "2026-10-01T00:00:00Z",
      invitedAt: "2026-11-01T00:00:00Z",
      repoConnected: false,
    });
    expect(JSON.stringify(body)).not.toContain("b@x.com");
    expect(callsOf("rpc:accept_email_invitation", "rpc")).toHaveLength(0);
  });

  it("gives team names and the id only to the person the email names", async () => {
    clerkUser("b@x.com");
    loaded(inviteRow());
    facts();
    const body = await (await open()).json();
    expect(body.invitationId).toBe(INV);
    expect(body.team.map((m: { name: string }) => m.name)).toEqual([
      "Olivia",
      "Zara",
    ]);
  });

  it("another person on an email invite sees no team and no id", async () => {
    loaded(inviteRow());
    facts();
    const body = await (await open()).json();
    expect(body.team).toBeUndefined();
    expect(body.invitationId).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("Zara");
  });

  it("a link invite shows only the member count and no private repo name", async () => {
    clerkUser("b@x.com");
    loaded(inviteRow({ kind: "link", email: null }));
    facts([{ full_name: "acme/secret", private: true }]);
    const body = await (await open()).json();
    expect(body.memberCount).toBe(2);
    expect(body.team).toBeUndefined();
    expect(body.invitationId).toBeUndefined();
    expect(body.repoConnected).toBe(true);
    expect(body.repoName).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("acme/secret");
  });

  it("names a public repo", async () => {
    loaded(inviteRow());
    facts([
      { full_name: "acme/secret", private: true },
      { full_name: "acme/open", private: false },
    ]);
    const body = await (await open()).json();
    expect(body.repoName).toBe("acme/open");
  });

  it("a declined invite answers 410 on its token", async () => {
    loaded(inviteRow({ declined_at: "2026-11-02" }));
    const res = await open();
    expect(res.status).toBe(410);
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

describe("GET /api/invitations/mine", () => {
  beforeEach(() => {
    signIn("u2");
    clerkUser("b@x.com");
  });

  const mineRow = {
    id: INV,
    project_id: P,
    role: "developer",
    created_by: "owner",
    created_at: "2026-11-01T00:00:00Z",
    expires_at: "2026-11-08T00:00:00Z",
  };
  const coreProject = {
    id: P,
    name: "Core",
    description: null,
    icon: "folder",
    color: "primary",
  };

  it("is 401 signed out", async () => {
    signIn(null);
    expect((await listMine()).status).toBe(401);
  });

  it("lists active invites for your verified email, never a token", async () => {
    queue("project_invitations", ok([mineRow]));
    queue("project_members", ok([]));
    queue("projects", ok([coreProject]));
    const body = await (await listMine()).json();
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0]).toMatchObject({
      id: INV,
      projectName: "Core",
      role: "developer",
    });
    expect(JSON.stringify(body)).not.toMatch(/token/i);
    const filters = callsOf("project_invitations", "eq").map((c) => c.args);
    expect(filters).toContainEqual(["email", "b@x.com"]);
    expect(filters).toContainEqual(["kind", "email"]);
    expect(
      callsOf("project_invitations", "is").map((c) => c.args),
    ).toContainEqual(["declined_at", null]);
  });

  it("is empty when your email is unverified", async () => {
    vi.stubEnv("NODE_ENV", "production");
    clerkUser("b@x.com", false);
    queue("project_invitations", ok([mineRow]));
    const body = await (await listMine()).json();
    expect(body.invitations).toEqual([]);
    expect(callsOf("project_invitations", "select")).toHaveLength(0);
  });

  it("hides a project you already joined", async () => {
    queue("project_invitations", ok([mineRow]));
    queue("project_members", ok([{ project_id: P }]));
    queue("projects", ok([coreProject]));
    const body = await (await listMine()).json();
    expect(body.invitations).toEqual([]);
  });
});

describe("POST /api/invitations/mine/[id]", () => {
  const params = (id = INV) => ({ params: Promise.resolve({ id }) });
  const byId = (invite: Record<string, unknown> | null, member = false) => {
    queue("project_invitations", ok(invite));
    if (!invite) return;
    queue("project_members", ok(member ? { user_id: "u2" } : null));
    queue("project_join_requests", ok(null));
    queue("projects", ok({ name: "Core" }));
  };

  beforeEach(() => {
    signIn("u2");
    clerkUser("b@x.com");
  });

  it("is 401 signed out", async () => {
    signIn(null);
    const res = await decideMine(post({ decision: "accept" }), params());
    expect(res.status).toBe(401);
  });

  it("is 404 on a bad id and 422 on a bad decision", async () => {
    expect(
      (await decideMine(post({ decision: "accept" }), params("nope"))).status,
    ).toBe(404);
    expect(
      (await decideMine(post({ decision: "maybe" }), params())).status,
    ).toBe(422);
  });

  it("accept joins through the same rpc as the token path", async () => {
    byId(inviteRow());
    const res = await decideMine(post({ decision: "accept" }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "joined", projectId: P });
    expect(callsOf("rpc:accept_email_invitation", "rpc")[0].args[0]).toEqual({
      p_invitation: INV,
      p_user: "u2",
    });
  });

  it("accept fails with 404 for another email and joins nothing", async () => {
    clerkUser("someone.else@x.com");
    byId(inviteRow());
    const res = await decideMine(post({ decision: "accept" }), params());
    expect(res.status).toBe(404);
    expect(callsOf("rpc:accept_email_invitation", "rpc")).toHaveLength(0);
  });

  it("is 404 for a link invite, an unknown id, or a used one", async () => {
    byId(inviteRow({ kind: "link", email: null }));
    expect(
      (await decideMine(post({ decision: "accept" }), params())).status,
    ).toBe(404);
    byId(null);
    expect(
      (await decideMine(post({ decision: "accept" }), params())).status,
    ).toBe(404);
    byId(inviteRow({ used_at: "2026-11-02" }));
    expect(
      (await decideMine(post({ decision: "decline" }), params())).status,
    ).toBe(404);
  });

  it("is 410 when the rpc finds the invite gone", async () => {
    byId(inviteRow());
    queue("rpc:accept_email_invitation", fail("gone"));
    const res = await decideMine(post({ decision: "accept" }), params());
    expect(res.status).toBe(410);
  });

  it("decline sets declined_at and writes an invite.declined audit row", async () => {
    byId(inviteRow());
    queue("project_invitations", ok({ id: INV }));
    const res = await decideMine(post({ decision: "decline" }), params());
    expect(await res.json()).toEqual({ status: "declined", projectId: P });
    const update = callsOf("project_invitations", "update")[0].args[0] as {
      declined_at?: string;
    };
    expect(update.declined_at).toBeTruthy();
    expect(callsOf("audit_log", "insert")[0].args[0]).toMatchObject({
      action: "invite.declined",
      actor_id: "u2",
      target_id: INV,
    });
    expect(callsOf("rpc:accept_email_invitation", "rpc")).toHaveLength(0);
  });

  it("decline is 410 when the row changed underneath it", async () => {
    byId(inviteRow());
    queue("project_invitations", ok(null));
    const res = await decideMine(post({ decision: "decline" }), params());
    expect(res.status).toBe(410);
    expect(callsOf("audit_log", "insert")).toHaveLength(0);
  });
});
