import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { runDailyCron, sweep, pending } = vi.hoisted(() => ({
  runDailyCron: vi.fn(async () => ({ purged: 1, failed: [] })),
  sweep: vi.fn(async () => 2),
  pending: [] as Array<() => Promise<void>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/daily-cron", () => ({ runDailyCron }));
vi.mock("@/agent/meeting-pipeline", () => ({ sweepStuckMeetings: sweep }));
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

import { GET } from "./route";

const call = (auth?: string) =>
  GET(
    new Request("http://localhost/api/cron/daily", {
      headers: auth ? { authorization: auth } : {},
    }),
  );

beforeEach(() => {
  runDailyCron.mockClear();
  sweep.mockClear();
  pending.length = 0;
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/daily", () => {
  it("rejects a wrong or missing bearer", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(runDailyCron).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it("is always 401 when the secret is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call("Bearer undefined")).status).toBe(401);
  });

  it("runs with the right bearer", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ purged: 1, failed: [] });
  });

  it("sweeps stuck meetings after the response", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await call("Bearer s3cret");
    expect(sweep).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);
    await pending[0]();
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});
