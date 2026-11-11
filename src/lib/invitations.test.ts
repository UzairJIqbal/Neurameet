import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  client,
  queue,
  ok,
  resetQueues,
  callsOf,
} from "@/test/supabase-queue-mock";
import {
  ACCEPT_FAILED_ACTION,
  displayNameFor,
  emailMatchesInvite,
  hashInviteToken,
  inviteExpiry,
  isAcceptRateLimited,
  isTokenShape,
  loadInviteByToken,
  newInviteToken,
  parseInviteEmail,
  recordAcceptFailure,
  resolveInviteState,
  type InviteRow,
} from "./invitations";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabase = client as unknown as SupabaseClient;
const NOW = new Date("2026-11-03T12:00:00Z");

const invite = (over: Partial<InviteRow> = {}): InviteRow => ({
  id: "i1",
  project_id: "p1",
  kind: "email",
  email: "a@x.com",
  role: "developer",
  created_by: "owner",
  expires_at: "2026-11-10T12:00:00Z",
  revoked_at: null,
  used_at: null,
  declined_at: null,
  created_at: "2026-11-01T12:00:00Z",
  ...over,
});

beforeEach(() => {
  resetQueues();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("tokens", () => {
  it("makes a 43 character base64url token and a 64 character hex hash", () => {
    const token = newInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isTokenShape(token)).toBe(true);
    expect(hashInviteToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    expect(newInviteToken()).not.toBe(token);
  });

  it("rejects odd token shapes", () => {
    expect(isTokenShape("short")).toBe(false);
    expect(isTokenShape("a".repeat(20) + "/")).toBe(false);
    expect(isTokenShape(42)).toBe(false);
  });

  it("expires 7 days later", () => {
    expect(inviteExpiry(NOW).toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });
});

describe("parseInviteEmail", () => {
  it("trims and lowercases", () => {
    expect(parseInviteEmail("  A@X.Com ")).toBe("a@x.com");
  });
  it.each([["not an email"], [""], [42], [`${"a".repeat(250)}@x.com`]])(
    "rejects %j",
    (value) => expect(parseInviteEmail(value)).toBeNull(),
  );
});

describe("emailMatchesInvite (AC-22b)", () => {
  const verified = { email: "A@x.com", verified: true };
  const unverified = { email: "a@x.com", verified: false };

  it("passes a verified match in production", () => {
    expect(emailMatchesInvite(verified, "a@x.com", "production")).toBe(true);
  });
  it("fails a different email everywhere", () => {
    expect(emailMatchesInvite(verified, "b@x.com", "development")).toBe(false);
    expect(emailMatchesInvite({ email: null, verified: true }, "a@x.com")).toBe(
      false,
    );
  });
  it.each([["development"], ["test"]])(
    "is lenient on an unverified email under %s",
    (env) => expect(emailMatchesInvite(unverified, "a@x.com", env)).toBe(true),
  );
  it.each([["production"], ["staging"], ["Development"]])(
    "fails closed on an unverified email under %s",
    (env) => expect(emailMatchesInvite(unverified, "a@x.com", env)).toBe(false),
  );
  it("fails closed when NODE_ENV is unset", () => {
    vi.stubEnv("NODE_ENV", undefined);
    try {
      expect(emailMatchesInvite(unverified, "a@x.com")).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("resolveInviteState (AC-19)", () => {
  const none = { isMember: false, hasPending: false };
  it("unknown token is gone", () => {
    expect(resolveInviteState(null, { isMember: true, hasPending: true })).toBe(
      "gone",
    );
  });
  it("an active member wins over a dead invite", () => {
    expect(
      resolveInviteState(
        invite({ revoked_at: "x" }),
        { isMember: true, hasPending: false },
        NOW,
      ),
    ).toBe("member");
  });
  it("a pending request shows on a link, even an expired one", () => {
    expect(
      resolveInviteState(
        invite({
          kind: "link",
          email: null,
          expires_at: "2026-11-01T00:00:00Z",
        }),
        { isMember: false, hasPending: true },
        NOW,
      ),
    ).toBe("pending");
  });
  it("a pending request does not block an email invite", () => {
    expect(
      resolveInviteState(invite(), { isMember: false, hasPending: true }, NOW),
    ).toBe("valid");
  });
  it.each([
    [{ revoked_at: "2026-11-02" }],
    [{ used_at: "2026-11-02" }],
    [{ expires_at: "2026-11-03T12:00:00Z" }],
  ])("%j is gone", (over) => {
    expect(resolveInviteState(invite(over), none, NOW)).toBe("gone");
  });
  it("a live invite is valid", () => {
    expect(resolveInviteState(invite(), none, NOW)).toBe("valid");
  });
});

describe("loadInviteByToken", () => {
  // The fixture invite expires 2026-11-10, so pin the clock to NOW.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("looks up by hash, never by token", async () => {
    queue("project_invitations", ok(invite()));
    queue("projects", ok({ name: "Core" }));
    const loaded = await loadInviteByToken(supabase, "tok".repeat(10), "u2");
    expect(loaded).toMatchObject({ state: "valid", projectName: "Core" });
    expect(callsOf("project_invitations", "eq")[0].args).toEqual([
      "token_hash",
      hashInviteToken("tok".repeat(10)),
    ]);
  });
  it("unknown token is gone without more queries", async () => {
    const loaded = await loadInviteByToken(supabase, "x".repeat(43), "u2");
    expect(loaded.state).toBe("gone");
    expect(callsOf("projects", "select")).toHaveLength(0);
  });
});

describe("rate limit (AC-22)", () => {
  it("blocks at 10 failures in the window", async () => {
    queue("audit_log", { data: null, error: null, count: 10 });
    expect(await isAcceptRateLimited(supabase, "u2", NOW)).toBe(true);
    expect(callsOf("audit_log", "eq").map((c) => c.args)).toEqual([
      ["actor_id", "u2"],
      ["action", ACCEPT_FAILED_ACTION],
    ]);
    expect(callsOf("audit_log", "gte")[0].args).toEqual([
      "created_at",
      "2026-11-03T11:50:00.000Z",
    ]);
  });
  it("allows 9", async () => {
    queue("audit_log", { data: null, error: null, count: 9 });
    expect(await isAcceptRateLimited(supabase, "u2", NOW)).toBe(false);
  });
  it("writes a failure row with the invitation id only", async () => {
    await recordAcceptFailure(supabase, "u2", invite(), "wrong_email");
    expect(callsOf("audit_log", "insert")[0].args[0]).toEqual({
      project_id: "p1",
      actor_id: "u2",
      action: ACCEPT_FAILED_ACTION,
      target_type: "invitation",
      target_id: "i1",
      detail: { reason: "wrong_email" },
    });
  });
  it("an unknown token writes a row with no project", async () => {
    await recordAcceptFailure(supabase, "u2", null, "gone");
    expect(callsOf("audit_log", "insert")[0].args[0]).toMatchObject({
      project_id: null,
      target_id: null,
    });
  });
});

describe("displayNameFor", () => {
  it("falls back full name, username, email local part", () => {
    expect(displayNameFor({ fullName: " Ali Khan ", username: "ali" })).toBe(
      "Ali Khan",
    );
    expect(displayNameFor({ username: "ali", email: "a@x.com" })).toBe("ali");
    expect(displayNameFor({ email: "sara@x.com" })).toBe("sara");
  });
});
