import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";
import { HIDDEN_COLUMNS, viewerLeaks } from "@/test/viewer-walk";
import { pktToday } from "@/lib/project-select";
import { GET } from "./route";

const P = "p1";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const get = (qs = "") =>
  GET(new Request(`http://localhost/api/projects/${P}/ledger${qs}`), {
    params: Promise.resolve({ id: P }),
  });

const role = (r: string | null) =>
  queue("project_members", ok(r ? { role: r } : null));

const itemRow = (over: Record<string, unknown> = {}) => ({
  id: uuid(1),
  meeting_id: "m1",
  action_item_id: null,
  kind: "promise",
  statement: "Ali sends the survey",
  quote: "secret quote",
  quote_language: "mixed",
  speaker: "Ali",
  assignee: "Ali",
  due_date: null,
  line_number: 2,
  status: "open",
  created_at: "2026-11-01T00:00:00.123456+00:00",
  source: "transcript",
  meetings: { id: "m1", title: "Standup", started_at: "2026-11-01T00:00:00Z" },
  ...over,
});

const reviewRow = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  evidence_kind: "meeting",
  evidence_meeting_id: "m2",
  evidence_task_link_id: null,
  relation: "kept",
  quote: "I sent it",
  speaker: "Ali",
  line_number: 9,
  confidence: 0.9,
  created_at: "2026-11-02T00:00:00Z",
  ledger_items: {
    id: uuid(1),
    statement: "Ali sends the survey",
    meetings: { id: "m1", title: "Standup" },
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  mockAuth.mockResolvedValue({ userId: "u1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/projects/[id]/ledger", () => {
  it("returns 401 when signed out", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    expect((await get()).status).toBe(401);
  });

  // The umbrella spec's "Not leaking existence" rule: same body as not found.
  it("hides the project from a non member", async () => {
    role(null);
    expect((await get()).status).toBe(404);
    expect(callsOf("ledger_items", "select")).toHaveLength(0);
  });

  it.each([
    ["?kind=note", "Unknown kind"],
    ["?status=closed", "Unknown status"],
    ["?cursor=),or(id.not.is.null", "Invalid cursor"],
    [
      `?cursor=${encodeURIComponent(`2026-11-01T00:00:00Z|x),or(id.not.is.null`)}`,
      "Invalid cursor",
    ],
  ])("returns 422 for %s and never reads", async (qs, message) => {
    const res = await get(qs);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: message });
    expect(callsOf("ledger_items", "select")).toHaveLength(0);
  });

  it("runs an open filter that keeps an item due today", async () => {
    role("owner");
    queue("ledger_items", ok([]));
    await get("?status=open");
    const today = pktToday();
    expect(callsOf("ledger_items", "or")[0].args[0]).toBe(
      `due_date.is.null,due_date.gte.${today}`,
    );
    expect(callsOf("ledger_items", "eq").map((c) => c.args)).toContainEqual([
      "status",
      "open",
    ]);
  });

  it("runs overdue as open and strictly before today", async () => {
    role("owner");
    queue("ledger_items", ok([]));
    await get("?status=overdue");
    expect(callsOf("ledger_items", "lt")[0].args).toEqual([
      "due_date",
      pktToday(),
    ]);
  });

  it("scopes the read to this project", async () => {
    role("developer");
    queue("ledger_items", ok([]));
    await get();
    expect(callsOf("ledger_items", "eq").map((c) => c.args)).toContainEqual([
      "meetings.project_id",
      P,
    ]);
  });

  it("returns 50 and the next cursor from the 50th row, with the raw timestamp", async () => {
    role("developer");
    const rows = Array.from({ length: 51 }, (_, i) =>
      itemRow({ id: uuid(100 - i) }),
    );
    queue("ledger_items", ok(rows));
    const body = await (await get()).json();
    expect(body.items).toHaveLength(50);
    expect(body.nextCursor).toBe(
      `2026-11-01T00:00:00.123456+00:00|${uuid(51)}`,
    );
  });

  it("uses the cursor in a filter that keeps rows sharing a timestamp", async () => {
    role("developer");
    queue("ledger_items", ok([]));
    const ts = "2026-11-01T00:00:00.123456+00:00";
    await get(`?cursor=${encodeURIComponent(`${ts}|${uuid(51)}`)}`);
    expect(callsOf("ledger_items", "or")[0].args[0]).toBe(
      `created_at.lt."${ts}",and(created_at.eq."${ts}",id.lt."${uuid(51)}")`,
    );
  });

  it("gives a Developer no review group", async () => {
    role("developer");
    queue("ledger_items", ok([itemRow()]));
    queue(
      "ledger_links",
      ok([
        {
          id: "l1",
          item_id: uuid(1),
          evidence_kind: "code",
          evidence_meeting_id: null,
          relation: "kept",
          state: "suggested",
        },
      ]),
    );
    const body = await (await get()).json();
    expect(body).toMatchObject({
      canReview: false,
      needsReview: [],
      reviewCount: 0,
    });
    expect(callsOf("ledger_links", "range")).toHaveLength(0);
    expect(body.items[0].outcome.kept.state).toBe("none");
  });

  it("counts only review rows inside the project, for an Admin", async () => {
    role("admin");
    queue("ledger_items", ok([]));
    queue(
      "ledger_links",
      ok([
        reviewRow(),
        reviewRow({ id: "l2", evidence_meeting_id: "outside" }),
        reviewRow({
          id: "l3",
          evidence_kind: "code",
          evidence_meeting_id: null,
          evidence_task_link_id: "tl1",
          quote: "PR title",
        }),
      ]),
    );
    queue("meetings", ok([{ id: "m2" }]));
    queue(
      "task_links",
      ok([
        {
          id: "tl1",
          repo_full_name: "acme/app",
          pr_number: 7,
          pr_url: "https://x/7",
          reverted_at: null,
        },
      ]),
    );
    const body = await (await get()).json();
    expect(body.canReview).toBe(true);
    expect(body.reviewCount).toBe(2);
    expect(body.needsReview.map((r: { id: string }) => r.id)).toEqual([
      "l1",
      "l3",
    ]);
    expect(body.needsReview[1].pr.prNumber).toBe(7);
  });

  it("caps the group at 50 and keeps the exact total", async () => {
    role("owner");
    queue("ledger_items", ok([]));
    const rows = Array.from({ length: 60 }, (_, i) =>
      reviewRow({
        id: `l${i}`,
        evidence_kind: "code",
        evidence_meeting_id: null,
      }),
    );
    queue("ledger_links", ok(rows));
    const body = await (await get()).json();
    expect(body.needsReview).toHaveLength(50);
    expect(body.reviewCount).toBe(60);
  });

  it("keeps only a flag on a confirmed link from outside the project", async () => {
    role("developer");
    queue("ledger_items", ok([itemRow()]));
    queue(
      "ledger_links",
      ok([
        {
          id: "l1",
          item_id: uuid(1),
          evidence_kind: "meeting",
          evidence_meeting_id: "outside",
          relation: "kept",
          state: "confirmed",
          quote: "secret",
        },
        {
          id: "l2",
          item_id: uuid(1),
          evidence_kind: "meeting",
          evidence_meeting_id: "outside",
          relation: "kept",
          state: "suggested",
          quote: "secret",
        },
      ]),
    );
    queue("meetings", ok([]));
    const body = await (await get()).json();
    expect(body.items[0].links).toEqual([
      {
        id: "l1",
        evidenceKind: "meeting",
        relation: "kept",
        state: "confirmed",
        outsideProject: true,
      },
    ]);
  });

  it("gives a Viewer no hidden field and never reads a hidden column", async () => {
    role("viewer");
    queue("ledger_items", ok([itemRow({ action_item_id: "a1" })]));
    queue(
      "ledger_links",
      ok([
        {
          id: "l1",
          item_id: uuid(1),
          evidence_kind: "code",
          evidence_meeting_id: null,
          relation: "kept",
          state: "confirmed",
        },
      ]),
    );
    queue(
      "action_items",
      ok([{ id: "a1", review_state: "confirmed", merged_into_task_id: null }]),
    );
    queue(
      "tasks",
      ok([
        {
          id: "t1",
          number: 3,
          status: "done",
          source_action_item_id: "a1",
          completion_kind: "merge",
        },
      ]),
    );
    queue("projects", ok({ task_prefix: "NM" }));
    queue(
      "task_links",
      ok([
        {
          task_id: "t1",
          state: "merged",
          closes: true,
          base_ref: "main",
          repo_id: 1,
          merged_at: "2026-11-01",
          reverted_at: null,
        },
      ]),
    );
    queue("github_repos", ok([{ repo_id: 1, default_branch: "main" }]));

    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(viewerLeaks(body)).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.items[0].outcome).toMatchObject({
      said: { state: "hidden", meetingId: "m1" },
      task: { state: "linked", key: "NM-3" },
      shipped: { state: "merged" },
    });
    for (const table of [
      "ledger_items",
      "ledger_links",
      "tasks",
      "task_links",
    ]) {
      for (const call of callsOf(table, "select")) {
        expect(String(call.args[0])).not.toMatch(HIDDEN_COLUMNS);
      }
    }
  });

  it("returns 500 with a plain message on a database failure", async () => {
    role("owner");
    queue("ledger_items", { data: null, error: { message: "boom" } });
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to load decisions and promises",
    });
  });
});
