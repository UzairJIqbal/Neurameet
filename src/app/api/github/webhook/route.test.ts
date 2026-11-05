import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

const { pending, mockHandle } = vi.hoisted(() => ({
  pending: [] as Array<() => Promise<void>>,
  mockHandle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => {
    pending.push(fn);
  },
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/github-rules", () => ({ handleGitHubEvent: mockHandle }));

import {
  calls,
  callsOf,
  ok,
  queue,
  resetQueues,
} from "@/test/supabase-queue-mock";
import { POST } from "./route";

const SECRET = "hook-secret";
const BODY = JSON.stringify({ action: "opened" });
const sign = (body: string) =>
  `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

const request = (
  body: string,
  headers: Record<string, string | null> = {},
): Request => {
  const merged: Record<string, string | null> = {
    "x-hub-signature-256": sign(body),
    "x-github-delivery": "d1",
    "x-github-event": "pull_request",
    ...headers,
  };
  return new Request("http://localhost/api/github/webhook", {
    method: "POST",
    body,
    headers: Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v !== null),
    ) as Record<string, string>,
  });
};

const runAfter = async () => {
  for (const fn of pending.splice(0)) await fn();
};

const duplicate = { data: null, error: { code: "23505", message: "dup" } };

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  pending.length = 0;
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", SECRET);
  mockHandle.mockResolvedValue("processed");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/github/webhook", () => {
  it("refuses a bad signature and stores nothing", async () => {
    const res = await POST(
      request(BODY, { "x-hub-signature-256": "sha256=bad" }),
    );
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("refuses a missing signature header", async () => {
    const res = await POST(request(BODY, { "x-hub-signature-256": null }));
    expect(res.status).toBe(401);
  });

  it("fails closed when the secret is not set", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
    expect((await POST(request(BODY))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("refuses a large Content-Length before reading the body", async () => {
    const req = request(BODY, { "content-length": String(2 * 1024 * 1024) });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(req.bodyUsed).toBe(false);
  });

  it("refuses a large body when no length was sent", async () => {
    const big = "x".repeat(2 * 1024 * 1024);
    const res = await POST(request(big));
    expect(res.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("needs the delivery headers and valid JSON", async () => {
    expect(
      (await POST(request(BODY, { "x-github-delivery": null }))).status,
    ).toBe(400);
    expect((await POST(request(BODY, { "x-github-event": null }))).status).toBe(
      400,
    );
    expect((await POST(request("not json"))).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("stores a new delivery, answers 202, then processes it", async () => {
    const res = await POST(request(BODY));
    expect(res.status).toBe(202);
    expect(mockHandle).not.toHaveBeenCalled();
    expect(callsOf("github_deliveries", "insert")[0].args[0]).toEqual({
      delivery_id: "d1",
      event: "pull_request",
      action: "opened",
    });

    await runAfter();
    expect(mockHandle).toHaveBeenCalledOnce();
    expect(callsOf("github_deliveries", "update")[0].args[0]).toMatchObject({
      status: "processed",
      error: null,
    });
  });

  it("answers 202 and does nothing for a replayed id it cannot reclaim", async () => {
    queue("github_deliveries", duplicate, ok([]));
    const res = await POST(request(BODY));
    expect(res.status).toBe(202);
    expect(pending).toEqual([]);
    const filter = callsOf("github_deliveries", "or")[0].args[0] as string;
    expect(filter).toContain("status.eq.failed");
    expect(filter).toContain("status.eq.received");
    expect(filter).toContain("received_at.lt.");
  });

  it("reprocesses a failed delivery once it wins the reclaim", async () => {
    queue("github_deliveries", duplicate, ok([{ delivery_id: "d1" }]));
    expect((await POST(request(BODY))).status).toBe(202);
    await runAfter();
    expect(mockHandle).toHaveBeenCalledOnce();
  });

  it("records a failure with a short error, so GitHub's redelivery can retry", async () => {
    mockHandle.mockRejectedValue(new Error("x".repeat(900)));
    await POST(request(BODY));
    await runAfter();
    const update = callsOf("github_deliveries", "update")[0].args[0] as {
      status: string;
      error: string;
    };
    expect(update.status).toBe("failed");
    expect(update.error).toHaveLength(500);
  });

  it("records an ignored event as ignored", async () => {
    mockHandle.mockResolvedValue("ignored");
    await POST(request(BODY));
    await runAfter();
    expect(callsOf("github_deliveries", "update")[0].args[0]).toMatchObject({
      status: "ignored",
    });
  });

  it("answers 500 when the delivery cannot be stored", async () => {
    queue("github_deliveries", {
      data: null,
      error: { code: "XX", message: "down" },
    });
    const res = await POST(request(BODY));
    expect(res.status).toBe(500);
    expect(pending).toEqual([]);
  });
});
