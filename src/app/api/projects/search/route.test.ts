import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { auth } from "@clerk/nextjs/server";
import { GET } from "./route";

const P1 = "11111111-1111-4111-8111-111111111111";
const get = (q: string) =>
  GET(
    new Request(
      `http://localhost/api/projects/search?q=${encodeURIComponent(q)}`,
    ),
  );

describe("GET /api/projects/search", () => {
  beforeEach(() => {
    resetQueues();
    vi.mocked(auth).mockResolvedValue({ userId: "me" } as never);
  });

  it("is 401 signed out", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    expect((await get("alpha")).status).toBe(401);
  });

  it("returns empty groups under 2 characters without querying", async () => {
    const body = await (await get("a")).json();
    expect(body).toEqual({
      projects: [],
      tasks: [],
      meetings: [],
      decisions: [],
    });
    expect(callsOf("project_members", "select")).toHaveLength(0);
  });

  it("returns nothing from projects you are not an active member of", async () => {
    queue("project_members", ok([]));
    queue("meetings", ok([]), ok([]));
    queue("ledger_items", ok([]));
    const body = await (await get("alpha")).json();
    expect(body.tasks).toEqual([]);
    expect(callsOf("tasks", "select")).toHaveLength(0);
  });

  it("finds a task by its exact key and builds hrefs", async () => {
    queue("project_members", ok([{ project_id: P1 }]));
    queue("projects", ok([{ id: P1, name: "Alpha", task_prefix: "ABC" }]));
    queue(
      "tasks",
      ok([]),
      ok([{ id: "t1", project_id: P1, number: 12, title: "Ship it" }]),
    );
    queue("meetings", ok([]), ok([]));
    queue("ledger_items", ok([]), ok([]));
    const body = await (await get("ABC-12")).json();
    expect(body.tasks).toEqual([
      {
        id: "t1",
        title: "Ship it",
        subtitle: "ABC-12 · Alpha",
        href: `/projects/${P1}?tab=tasks&task=t1`,
      },
    ]);
  });

  it("ignores a key whose prefix is not one of your projects", async () => {
    queue("project_members", ok([{ project_id: P1 }]));
    queue("projects", ok([{ id: P1, name: "Alpha", task_prefix: "ABC" }]));
    queue("tasks", ok([]));
    queue("meetings", ok([]), ok([]));
    queue("ledger_items", ok([]), ok([]));
    const body = await (await get("XYZ-12")).json();
    expect(body.tasks).toEqual([]);
    expect(
      callsOf("tasks", "eq").filter((c) => c.args[0] === "number"),
    ).toHaveLength(0);
  });

  it("escapes a % literal and matches decision statements only", async () => {
    queue("project_members", ok([{ project_id: P1 }]));
    queue("projects", ok([{ id: P1, name: "Alpha", task_prefix: "ABC" }]));
    queue("tasks", ok([]));
    queue("meetings", ok([]), ok([]));
    queue(
      "ledger_items",
      ok([]),
      ok([
        {
          id: "d1",
          statement: "Use 50% rollout",
          meetings: { id: "m1", title: "Sync", project_id: P1 },
        },
      ]),
    );
    const body = await (await get("50%")).json();
    expect(body.decisions[0].href).toBe(
      `/projects/${P1}?tab=promises&meetingId=m1`,
    );
    const ilikes = callsOf("ledger_items", "ilike");
    expect(
      ilikes.every((c) => c.args[0] === "statement" && c.args[1] === "%50\\%%"),
    ).toBe(true);
  });
});
