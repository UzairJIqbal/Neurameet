import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockGetUserList } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUserList: vi.fn(async () => ({ data: [] })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: async () => ({ users: { getUserList: mockGetUserList } }),
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";
import { viewerLeaks } from "@/test/viewer-walk";
import { GET } from "./route";

const P = "p1";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const get = (before?: string) =>
  GET(
    new Request(
      `http://localhost/api/projects/${P}/activity${before ? `?before=${encodeURIComponent(before)}` : ""}`,
    ),
    { params: Promise.resolve({ id: P }) },
  );

const role = (r: string | null) =>
  queue("project_members", ok(r ? { role: r } : null));

type Row = {
  row_id: string;
  occurred_at: string;
  actor_id: string | null;
  kind: string;
  subject_type: string;
  subject_id: string;
  detail: Record<string, unknown>;
};

const repoRow = (n: number, occurredAt: string): Row => ({
  row_id: `au:${uuid(n)}`,
  occurred_at: occurredAt,
  actor_id: null,
  kind: "repo.linked",
  subject_type: "repo",
  subject_id: String(n),
  detail: {},
});

// The database's sort and cursor filter, over rows in memory.
const SHARED = "2026-11-01T00:00:00.123456+00:00";
const allRows = Array.from({ length: 120 }, (_, i) =>
  repoRow(
    i,
    i < 60
      ? SHARED
      : `2026-10-${String(1 + ((i - 60) % 28)).padStart(2, "0")}T00:00:00+00:00`,
  ),
).sort(
  (a, b) =>
    b.occurred_at.localeCompare(a.occurred_at) ||
    b.row_id.localeCompare(a.row_id),
);

const after = (cursor: string | undefined) => {
  if (!cursor) return allRows;
  const split = cursor.indexOf("|");
  const [ts, id] = [cursor.slice(0, split), cursor.slice(split + 1)];
  return allRows.filter(
    (r) => r.occurred_at < ts || (r.occurred_at === ts && r.row_id < id),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  mockAuth.mockResolvedValue({ userId: "u1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/projects/[id]/activity", () => {
  it("returns 401 when signed out", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    expect((await get()).status).toBe(401);
  });

  it("hides the project from a member of another project", async () => {
    role(null);
    expect((await get()).status).toBe(404);
    expect(callsOf("project_activity", "select")).toHaveLength(0);
  });

  it.each([
    "),or(id.not.is.null",
    "2026-11-01T00:00:00Z|nope",
    `2026-11-01T00:00:00Z|${uuid(1)}`,
  ])("returns 422 for the cursor %s", async (cursor) => {
    expect((await get(cursor)).status).toBe(422);
    expect(callsOf("project_activity", "select")).toHaveLength(0);
  });

  it("walks 120 rows in three pages, 60 sharing one timestamp, with no gap or repeat", async () => {
    const seen: string[] = [];
    const sizes: number[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      role("developer");
      queue("project_activity", ok(after(cursor).slice(0, 51)));
      const body = await (await get(cursor)).json();
      sizes.push(body.rows.length);
      seen.push(...body.rows.map((r: { id: string }) => r.id));
      if (!body.nextBefore) break;
      cursor = body.nextBefore;
    }
    expect(sizes).toEqual([50, 50, 20]);
    expect(seen).toEqual(allRows.map((r) => r.row_id));
    expect(new Set(seen).size).toBe(120);
  });

  it("filters on the raw timestamp and the row id", async () => {
    role("developer");
    queue("project_activity", ok([]));
    const id = `au:${uuid(9)}`;
    await get(`${SHARED}|${id}`);
    expect(callsOf("project_activity", "or")[0].args[0]).toBe(
      `occurred_at.lt."${SHARED}",and(occurred_at.eq."${SHARED}",row_id.lt."${id}")`,
    );
  });

  it("gives a Viewer rows with no hidden field and no raw detail", async () => {
    role("viewer");
    queue(
      "project_activity",
      ok([
        {
          row_id: `te:${uuid(1)}`,
          occurred_at: SHARED,
          actor_id: null,
          kind: "task.proposal_merged",
          subject_type: "task",
          subject_id: "t1",
          detail: { quote: "secret quote", title: "secret title" },
        },
      ]),
    );
    queue("tasks", ok([{ id: "t1", number: 3, title: "Ship" }]));
    queue("projects", ok({ task_prefix: "NM" }));
    const body = await (await get()).json();
    expect(viewerLeaks(body)).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.rows[0]).not.toHaveProperty("detail");
    expect(body.rows[0].taskKey).toBe("NM-3");
  });

  it("returns 500 with a plain message on a database failure", async () => {
    role("owner");
    queue("project_activity", { data: null, error: { message: "boom" } });
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to load activity" });
  });
});
