import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { runDailyCron } = vi.hoisted(() => ({
  runDailyCron: vi.fn(async () => ({ purged: 1, failed: [] })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/daily-cron", () => ({ runDailyCron }));
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
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/daily", () => {
  it("rejects a wrong or missing bearer", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(runDailyCron).not.toHaveBeenCalled();
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
});
