import { describe, it, expect, vi, beforeEach } from "vitest";

// Table results keyed by table name; awaiting a query yields the next queued
// result for that table. Inserts are recorded so a test can read what was saved.
const {
  queues,
  inserts,
  mockAuth,
  mockSupabase,
  mockGenerate,
  mockWriteLedger,
} = vi.hoisted(() => {
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
  const inserts: Record<string, unknown[]> = {};
  const makeBuilder = (table: string) => {
    const next = () =>
      Promise.resolve(queues[table]?.shift() ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "delete"])
      builder[m] = () => builder;
    builder.insert = (rows: unknown) => {
      (inserts[table] ??= []).push(rows);
      return builder;
    };
    builder.single = next;
    builder.maybeSingle = next;
    builder.then = (
      res: (v: unknown) => unknown,
      rej: (e: unknown) => unknown,
    ) => next().then(res, rej);
    return builder;
  };
  return {
    queues,
    inserts,
    mockAuth: vi.fn(),
    mockSupabase: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
    mockGenerate: vi.fn(),
    mockWriteLedger: vi.fn(),
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  currentUser: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));
vi.mock("@/lib/email", () => ({ sendMeetingReadyEmail: vi.fn() }));
vi.mock("@/lib/transcript-state", () => ({ setTranscriptState: vi.fn() }));
vi.mock("@/agent/models", () => ({
  generateStructuredWithFallback: mockGenerate,
}));
vi.mock("@/agent/ledger", () => ({
  LEDGER_MAX_ITEMS: 15,
  writeLedgerItems: mockWriteLedger,
}));

import { POST } from "./route";

const RAW = "Sara: We go with Vercel.\nAli: main Friday tak survey bhej dunga";

const call = (userId: string | null, body: unknown = { meetingId: "m1" }) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/ai/process", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
};

const ledgerItem = {
  kind: "promise",
  statement: "Ali sends the survey",
  quote: "main Friday tak survey bhej dunga",
  quoteLanguage: "mixed",
  speaker: "Ali",
  assignee: "Ali",
  dueDate: "2026-10-02",
  actionItemIndex: 1,
};

const extraction = {
  insights: {
    summary: "s",
    keyPoints: [],
    decisions: [],
    category: "engineering",
    detectedTopics: [],
  },
  actionItems: [
    { title: "Move to Vercel", assignee: null, dueDate: null },
    { title: "Send the survey", assignee: "Ali", dueDate: "2026-10-02" },
  ],
  ledgerItems: [ledgerItem],
};

// An owned meeting dated 2026-10-01 with a transcript and no prior rows.
const ownedMeeting = () => {
  queues.meetings = [
    {
      data: {
        id: "m1",
        started_at: "2026-10-01T12:00:00.000Z",
        created_at: "2026-10-29T09:00:00.000Z",
      },
      error: null,
    },
  ];
  queues.transcripts = [{ data: { raw_text: RAW }, error: null }];
  queues.meeting_insights = [
    { data: null, error: null },
    { data: null, error: null },
  ];
  queues.action_items = [
    { data: [], error: null },
    {
      data: [
        { id: "ai-1", meeting_id: "m1" },
        { id: "ai-2", meeting_id: "m1" },
      ],
      error: null,
    },
  ];
};

const promptSent = () =>
  (mockGenerate.mock.calls[0][0] as { prompt: string }).prompt;

describe("POST /api/ai/process (Promise Ledger extraction)", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
    for (const k of Object.keys(inserts)) delete inserts[k];
    mockGenerate.mockReset();
    mockWriteLedger.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns 401 when signed out", async () => {
    expect((await call(null)).status).toBe(401);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 400 without a meetingId", async () => {
    expect((await call("u1", {})).status).toBe(400);
  });

  it("returns 404 when the caller does not own the meeting", async () => {
    queues.meetings = [{ data: null, error: null }];
    expect((await call("intruder")).status).toBe(404);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockWriteLedger).not.toHaveBeenCalled();
  });

  it("resolves dates against the meeting's start date, not today (AC-4)", async () => {
    ownedMeeting();
    mockGenerate.mockResolvedValue({ object: extraction });

    expect((await call("u1")).status).toBe(200);

    expect(promptSent()).toContain("Meeting date: 2026-10-01");
    expect(promptSent()).toContain(RAW);
  });

  it("falls back to created_at when the meeting has no start date (AC-4)", async () => {
    ownedMeeting();
    queues.meetings = [
      {
        data: {
          id: "m1",
          started_at: null,
          created_at: "2026-09-15T08:00:00.000Z",
        },
        error: null,
      },
    ];
    mockGenerate.mockResolvedValue({ object: extraction });

    await call("u1");

    expect(promptSent()).toContain("Meeting date: 2026-09-15");
  });

  it("hands ledger items and action item ids in insert order to the ledger writer (AC-1, AC-3)", async () => {
    ownedMeeting();
    mockGenerate.mockResolvedValue({ object: extraction });

    const res = await call("u1");

    expect(res.status).toBe(200);
    expect(mockWriteLedger).toHaveBeenCalledTimes(1);
    expect(mockWriteLedger.mock.calls[0][1]).toEqual({
      meetingId: "m1",
      rawText: RAW,
      items: [ledgerItem],
      actionItemIds: ["ai-1", "ai-2"],
    });
  });

  it("passes an empty ledger list when the model returns none", async () => {
    ownedMeeting();
    mockGenerate.mockResolvedValue({
      object: { ...extraction, actionItems: [], ledgerItems: undefined },
    });

    await call("u1");

    expect(mockWriteLedger.mock.calls[0][1]).toMatchObject({
      items: [],
      actionItemIds: [],
    });
  });

  it("returns 500 and writes nothing when extraction fails (AC-14)", async () => {
    ownedMeeting();
    mockGenerate.mockRejectedValue(new Error("both providers failed"));

    expect((await call("u1")).status).toBe(500);
    expect(inserts.meeting_insights).toBeUndefined();
    expect(mockWriteLedger).not.toHaveBeenCalled();
  });

  it("returns 404 when the meeting has no transcript", async () => {
    queues.meetings = [
      { data: { id: "m1", started_at: null, created_at: null }, error: null },
    ];
    queues.transcripts = [{ data: null, error: { message: "no rows" } }];

    expect((await call("u1")).status).toBe(404);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
