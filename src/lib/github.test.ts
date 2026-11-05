import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

vi.mock("server-only", () => ({}));

import {
  installUrls,
  readInstallState,
  signInstallState,
  verifySignature,
} from "./github";

const NOW = 1_800_000_000_000;
const sign = (body: string, secret = "hook-secret") =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

beforeEach(() => {
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", "hook-secret");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("verifySignature", () => {
  it("accepts the right signature over the raw body", () => {
    expect(verifySignature('{"a": 1}', sign('{"a": 1}'))).toBe(true);
  });

  it("refuses a changed body, another secret, or a bad header", () => {
    expect(verifySignature('{"a":1}', sign('{"a": 1}'))).toBe(false);
    expect(verifySignature("x", sign("x", "other"))).toBe(false);
    expect(verifySignature("x", null)).toBe(false);
    expect(verifySignature("x", "sha1=abc")).toBe(false);
    expect(verifySignature("x", "sha256=short")).toBe(false);
  });

  it("fails closed when the secret is missing", () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
    expect(verifySignature("x", sign("x", ""))).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("install state", () => {
  it("round trips the project and user", () => {
    const state = signInstallState("p1", "u1", NOW);
    expect(readInstallState(state, NOW + 1000)).toEqual({
      projectId: "p1",
      userId: "u1",
      exp: NOW + 10 * 60 * 1000,
    });
  });

  it("refuses an expired state", () => {
    const state = signInstallState("p1", "u1", NOW);
    expect(readInstallState(state, NOW + 10 * 60 * 1000)).toBeNull();
  });

  it("refuses a tampered payload, a tampered signature, and junk", () => {
    const [payload, signature] = signInstallState("p1", "u1", NOW).split(".");
    const forged = Buffer.from(
      JSON.stringify({ projectId: "p2", userId: "u1", exp: NOW + 1000 }),
    ).toString("base64url");
    expect(readInstallState(`${forged}.${signature}`, NOW)).toBeNull();
    expect(readInstallState(`${payload}.AAAA`, NOW)).toBeNull();
    expect(readInstallState(`${payload}.${signature}.x`, NOW)).toBeNull();
    expect(readInstallState(null, NOW)).toBeNull();
  });

  it("refuses a state signed with another secret, and any state with no secret", () => {
    const state = signInstallState("p1", "u1", NOW);
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "rotated");
    expect(readInstallState(state, NOW)).toBeNull();
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "");
    expect(readInstallState(state, NOW)).toBeNull();
  });
});

describe("installUrls", () => {
  it("puts one signed state on both links", () => {
    vi.stubEnv("NEXT_PUBLIC_GITHUB_APP_SLUG", "neurameet-dev");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
    const { installUrl, authorizeUrl } = installUrls("p1", "u1");
    const install = new URL(installUrl);
    const authorize = new URL(authorizeUrl);
    expect(install.pathname).toBe("/apps/neurameet-dev/installations/new");
    expect(authorize.searchParams.get("client_id")).toBe("client-id");
    expect(readInstallState(install.searchParams.get("state"))?.projectId).toBe(
      "p1",
    );
    expect(readInstallState(authorize.searchParams.get("state"))?.userId).toBe(
      "u1",
    );
  });

  it("throws when the App is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GITHUB_APP_SLUG", "");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
    expect(() => installUrls("p1", "u1")).toThrow(
      /NEXT_PUBLIC_GITHUB_APP_SLUG/,
    );
  });
});
