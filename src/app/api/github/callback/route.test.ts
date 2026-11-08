import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAuth, mockUserToken, mockUserInstallations, mockGithubUser } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockUserToken: vi.fn(),
    mockUserInstallations: vi.fn(),
    mockGithubUser: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/github")>()),
  userToken: mockUserToken,
  userInstallations: mockUserInstallations,
  appSlug: async () => "neuramet-app",
  githubUser: mockGithubUser,
}));

import {
  calls,
  callsOf,
  ok,
  queue,
  resetQueues,
} from "@/test/supabase-queue-mock";
import { signAccountState, signInstallState } from "@/lib/github";
import { GET } from "./route";

const installation = (id: number) => ({
  id,
  account: { login: "acme", type: "Organization" },
});

const visit = async (params: Record<string, string>) => {
  const url = new URL("http://localhost/api/github/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await GET(new Request(url));
  const location = new URL(res.headers.get("location") as string);
  return {
    status: res.status,
    path: location.pathname,
    search: location.search,
  };
};

const valid = (extra: Record<string, string> = {}) => ({
  state: signInstallState("p1", "u1"),
  code: "the-code",
  ...extra,
});

const TO_PROJECT = "/projects/p1";

const owner = () => queue("project_members", ok({ role: "owner" }));
const stored = () =>
  calls.filter((c) => c.table.startsWith("github_installation"));

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
  mockAuth.mockResolvedValue({ userId: "u1" });
  mockUserToken.mockResolvedValue("user-token");
  mockUserInstallations.mockResolvedValue([installation(1), installation(2)]);
  mockGithubUser.mockResolvedValue({ id: 7, login: "octo" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/github/callback", () => {
  it("sends a signed out person to sign in and back", async () => {
    const state = signInstallState("p1", "u1");
    mockAuth.mockResolvedValue({ userId: null });
    const { path, search } = await visit({ state });
    expect(path).toBe("/sign-in");
    expect(decodeURIComponent(search)).toContain("/api/github/callback");
  });

  it.each([
    ["missing", {}],
    ["junk", { state: "not.valid" }],
  ])("redirects a %s state to the project list", async (_name, params) => {
    const { path, search } = await visit(params as Record<string, string>);
    expect(path).toBe("/projects");
    expect(search).toBe("?github=expired");
    expect(stored()).toEqual([]);
  });

  it("refuses a state made for another user", async () => {
    const { path, search } = await visit(
      valid({ state: signInstallState("p1", "u2") }),
    );
    expect(path).toBe("/projects");
    expect(search).toBe("?github=expired");
    expect(mockUserToken).not.toHaveBeenCalled();
  });

  it("refuses an expired state", async () => {
    const old = signInstallState("p1", "u1", Date.now() - 11 * 60 * 1000);
    const { search } = await visit(valid({ state: old }));
    expect(search).toBe("?github=expired");
  });

  it("fails for someone no longer the Owner", async () => {
    queue("project_members", ok({ role: "admin" }));
    const { path, search } = await visit(valid());
    expect(path).toBe(TO_PROJECT);
    expect(search).toBe("?tab=github&github=failed");
    expect(mockUserToken).not.toHaveBeenCalled();
  });

  it("reports a request waiting on an organization owner", async () => {
    owner();
    const { search } = await visit(valid({ setup_action: "request" }));
    expect(search).toBe("?tab=github&github=requested");
    expect(stored()).toEqual([]);
  });

  it("fails with no code", async () => {
    owner();
    const { search } = await visit({ state: signInstallState("p1", "u1") });
    expect(search).toBe("?tab=github&github=failed");
  });

  it("stores nothing for someone else's installation id", async () => {
    owner();
    const { search } = await visit(valid({ installation_id: "999" }));
    expect(search).toBe("?tab=github&github=not_yours");
    expect(stored()).toEqual([]);
  });

  it("sends someone with no installation straight to install the App", async () => {
    owner();
    mockUserInstallations.mockResolvedValue([]);
    const res = await GET(
      new Request(
        `http://localhost/api/github/callback?${new URLSearchParams(valid())}`,
      ),
    );
    const location = new URL(res.headers.get("location") as string);
    expect(location.origin + location.pathname).toBe(
      "https://github.com/apps/neuramet-app/installations/new",
    );
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(stored()).toEqual([]);
  });

  it("stores nothing when an install finishes with no installations", async () => {
    owner();
    mockUserInstallations.mockResolvedValue([]);
    const { search } = await visit(valid({ installation_id: "1" }));
    expect(search).toBe("?tab=github&github=not_yours");
    expect(stored()).toEqual([]);
  });

  it("claims every installation the person can reach", async () => {
    owner();
    const { status, path, search } = await visit(
      valid({ installation_id: "2" }),
    );
    expect(status).toBe(307);
    expect(path).toBe(TO_PROJECT);
    expect(search).toBe("?tab=github&github=connected");

    const [rows, options] = callsOf("github_installations", "upsert")[0].args;
    expect(rows).toEqual([
      {
        installation_id: 1,
        account_login: "acme",
        account_type: "Organization",
        installed_by: "u1",
      },
      {
        installation_id: 2,
        account_login: "acme",
        account_type: "Organization",
        installed_by: "u1",
      },
    ]);
    expect(options).toMatchObject({ ignoreDuplicates: true });

    const claims = callsOf("github_installation_claims", "upsert")[0]
      .args[0] as Array<{
      installation_id: number;
      user_id: string;
    }>;
    expect(claims.map((c) => [c.installation_id, c.user_id])).toEqual([
      [1, "u1"],
      [2, "u1"],
    ]);
    expect(JSON.stringify(calls)).not.toContain("user-token");
  });

  it("works with no installation id, from the authorize link", async () => {
    owner();
    const { search } = await visit(valid());
    expect(search).toBe("?tab=github&github=connected");
  });

  it("redirects on a GitHub failure and logs no token", async () => {
    owner();
    mockUserToken.mockRejectedValue(
      new Error("GitHub refused the authorization code"),
    );
    const { search } = await visit(valid());
    expect(search).toBe("?tab=github&github=failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "the-code",
    );
  });
});

describe("GET /api/github/callback, connecting an account (AC-77g)", () => {
  const account = (extra: Record<string, string> = {}) => ({
    state: signAccountState("u1"),
    code: "the-code",
    ...extra,
  });
  const TO_SETTINGS = "/settings";

  it("stores your login and id, and nothing else", async () => {
    const { path, search } = await visit(account());
    expect(path).toBe(TO_SETTINGS);
    expect(search).toBe("?tab=connected&github=connected");
    const [row, options] = callsOf("user_settings", "upsert")[0].args as [
      Record<string, unknown>,
      unknown,
    ];
    expect(Object.keys(row).sort()).toEqual([
      "github_login",
      "github_user_id",
      "updated_at",
      "user_id",
    ]);
    expect(row).toMatchObject({
      user_id: "u1",
      github_login: "octo",
      github_user_id: 7,
    });
    expect(options).toEqual({ onConflict: "user_id" });
    expect(JSON.stringify(calls)).not.toContain("user-token");
    expect(stored()).toEqual([]);
  });

  it("refuses an account someone else already linked", async () => {
    queue("user_settings", ok({ user_id: "u2" }));
    const { search } = await visit(account());
    expect(search).toBe("?tab=connected&github=already_linked");
    expect(callsOf("user_settings", "upsert")).toEqual([]);
  });

  it("reports the race on the unique index the same way", async () => {
    queue("user_settings", ok(null), {
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const { search } = await visit(account());
    expect(search).toBe("?tab=connected&github=already_linked");
  });

  it("refuses a state made for another user", async () => {
    const { search } = await visit(account({ state: signAccountState("u2") }));
    expect(search).toBe("?tab=connected&github=expired");
    expect(mockUserToken).not.toHaveBeenCalled();
  });

  it("refuses an expired state", async () => {
    const old = signAccountState("u1", Date.now() - 11 * 60 * 1000);
    const { search } = await visit(account({ state: old }));
    expect(search).toBe("?tab=connected&github=expired");
  });

  it("refuses an install state dressed up with the account prefix", async () => {
    const { path, search } = await visit(
      account({ state: `acct.${signInstallState("p1", "u1")}` }),
    );
    expect(path).toBe(TO_SETTINGS);
    expect(search).toBe("?tab=connected&github=expired");
    expect(mockUserToken).not.toHaveBeenCalled();
  });

  it("refuses an account state with the prefix removed on the install path", async () => {
    const { path, search } = await visit(
      account({ state: signAccountState("u1").slice("acct.".length) }),
    );
    expect(path).toBe("/projects");
    expect(search).toBe("?github=expired");
    expect(mockUserToken).not.toHaveBeenCalled();
  });

  it("fails with no code, and on a GitHub failure logs no code", async () => {
    const { search } = await visit({ state: signAccountState("u1") });
    expect(search).toBe("?tab=connected&github=failed");

    mockUserToken.mockRejectedValue(new Error("refused"));
    const second = await visit(account());
    expect(second.search).toBe("?tab=connected&github=failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "the-code",
    );
  });
});
