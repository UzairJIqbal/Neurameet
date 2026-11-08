/// <reference types="vite/client" />
// AC-80: every project, task, proposal, and project meeting route, checked from
// one table (src/test/project-route-matrix.ts). A route with no row fails the
// completeness check, so a forgotten gate fails a test instead of shipping.

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_STREAM_API_KEY = "matrix-key";
  process.env.STREAM_SECRET_KEY = "matrix-secret";
  return { userId: null as string | null, db: null as unknown };
});

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
  clerkClient: async () => ({
    users: { getUserList: async () => ({ data: [] }) },
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: () => state.db }));
vi.mock("@/agent/embed", () => ({ embedTexts: async () => [[0.1, 0.2]] }));

import { HIDDEN_COLUMNS, viewerLeaks } from "@/test/viewer-walk";
import {
  EXEMPT_ROUTES,
  MATRIX,
  USERS,
  allowedFor,
  makeFakeDb,
  paramsFor,
  seedTables,
  urlFor,
  type Actor,
  type FakeDb,
  type MatrixRow,
} from "@/test/project-route-matrix";

type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const modules = import.meta.glob<Record<string, Handler>>(
  "./{projects,tasks,proposals,meetings}/**/route.ts",
);

const routeKey = (file: string) =>
  file.replace("./", "").replace(/\/route\.ts$/, "");

const ACTORS: Actor[] = [
  "outsider",
  "removed",
  "viewer",
  "developer",
  "admin",
  "owner",
];

async function call(row: MatrixRow, userId: string | null) {
  const load = modules[`./${row.route}/route.ts`];
  if (!load) throw new Error(`no route file for ${row.route}`);
  const handler = (await load())[row.method];
  if (!handler) throw new Error(`${row.route} has no ${row.method}`);
  state.userId = userId;
  if (row.setup && userId) {
    const tables = seedTables();
    row.setup(tables, userId);
    db = makeFakeDb(tables);
    state.db = db;
  }
  const res = await handler(
    new Request(urlFor(row), {
      method: row.method,
      body: row.body ? JSON.stringify(row.body) : undefined,
    }),
    { params: Promise.resolve(paramsFor(row.route, row.params)) },
  );
  const body = (await res.json().catch(() => null)) as unknown;
  return { status: res.status, body };
}

let db: FakeDb;
beforeEach(() => {
  db = makeFakeDb(seedTables());
  state.db = db;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("route matrix: completeness", () => {
  const files = Object.keys(modules).map(routeKey);
  const inTable = new Set(MATRIX.map((r) => r.route));

  it("every project, task, proposal, and meeting route has a row or a named exemption", () => {
    const missing = files.filter(
      (f) => !inTable.has(f) && !(f in EXEMPT_ROUTES),
    );
    expect(missing).toEqual([]);
  });

  it("no row or exemption points at a route that is gone", () => {
    const gone = [...inTable, ...Object.keys(EXEMPT_ROUTES)].filter(
      (r) => !files.includes(r),
    );
    expect(gone).toEqual([]);
  });

  it("every row names a method the route file exports", async () => {
    for (const row of MATRIX) {
      const mod = await modules[`./${row.route}/route.ts`]();
      expect(typeof mod[row.method], `${row.method} ${row.route}`).toBe(
        "function",
      );
    }
  });
});

describe.each(MATRIX.map((r) => [`${r.method} ${r.route}`, r] as const))(
  "route matrix: %s",
  (_name, row) => {
    it("is 401 when signed out", async () => {
      expect((await call(row, null)).status).toBe(401);
    });

    it.each(ACTORS)("%s", async (actor) => {
      const { status, body } = await call(row, USERS[actor]);
      const lookup = db.lookups.find((l) => l.userId === USERS[actor]);

      if (!allowedFor(row.need, actor)) {
        // Not a member (outsider, removed) is 404 and never says the project
        // exists; a member below the need is 403.
        const member = actor !== "outsider" && actor !== "removed";
        expect(status, JSON.stringify(body)).toBe(member ? 403 : 404);
        return;
      }
      // The gate let this role in: it found them, and the handler did not
      // answer 401 or (unless it refines the role itself) 403.
      expect(lookup?.role, "role lookup").toBe(actor);
      expect(status).not.toBe(401);
      if (!row.downstream403) expect(status).not.toBe(403);
    });
  },
);

describe("route matrix: removed members", () => {
  it("a removed member is refused everywhere, and the same person re-added passes", async () => {
    for (const row of MATRIX) {
      db = makeFakeDb(seedTables());
      state.db = db;
      expect(
        (await call(row, USERS.removed)).status,
        `${row.method} ${row.route}`,
      ).toBe(404);
    }
    // Re-added: a new row with removed_at null is a member again.
    const tables = seedTables();
    tables.project_members.push({
      project_id: paramsFor("projects/[id]").id,
      user_id: USERS.removed,
      role: "developer",
      removed_at: null,
    });
    // The old removed row stays; the active one wins on the `is null` filter.
    state.db = makeFakeDb(tables);
    const tasks = MATRIX.find((r) => r.route === "projects/[id]/tasks");
    const res = await call(tasks!, USERS.removed);
    expect(res.status).not.toBe(404);
  });
});

describe("route matrix: a Viewer's reads", () => {
  const readable = MATRIX.filter((r) => r.viewerReadable);

  it.each(readable.map((r) => [`${r.method} ${r.route}`, r] as const))(
    "%s asks for no hidden column and returns no hidden key",
    async (_name, row) => {
      const { status, body } = await call(row, USERS.viewer);
      expect(status).not.toBe(403);
      for (const s of db.selects) {
        expect(s.columns, `${s.table} select`).not.toMatch(HIDDEN_COLUMNS);
      }
      expect(viewerLeaks(body)).toEqual([]);
    },
  );
});
