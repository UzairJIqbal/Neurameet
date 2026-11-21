import { describe, it, expect, vi, beforeEach } from "vitest";

// Table results keyed by table name; awaiting a query yields the next queued
// result for that table. Inserts are recorded so a test can read what was saved.
const { queues, inserts, mockAuth, mockSupabase, mockGenerate } = vi.hoisted(
  () => {
    const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
    const inserts: Record<string, unknown[]> = {};
    const makeBuilder = (table: string) => {
      const next = () =>
        Promise.resolve(queues[table]?.shift() ?? { data: null, error: null });
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "delete"])
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
    };
  },
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/pipeline-steps", () => ({
  claimPipelineStep: vi.fn(async () => true),
  markPipelineStep: vi.fn(async () => {}),
  stepStart: () => new Date().toISOString(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
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
import { POST } from "./route";
import { claimPipelineStep } from "@/lib/pipeline-steps";

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

const extraction = {
  insights: {
    summary: "s",
    category: "engineering",
    keyPoints: ["Hosting"],
    decisions: ["Use Vercel"],
    detectedTopics: [],
  },
  actionItems: [
    { title: "Move to Vercel", assignee: null, dueDate: null, quotes: null },
    {
      title: "Send the survey",
      assignee: "Ali",
      dueDate: "2026-10-02",
      quotes: ["survey bhej dunga"],
    },
  ],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const savedInsights = () =>
  inserts.meeting_insights[0] as Record<string, unknown>;

// An owned meeting dated 2026-10-01 with a transcript and no prior rows.
const ownedMeeting = () => {
  queues.meetings = [
    {
      data: {
        id: "m1",
        user_id: "u1",
        project_id: null,
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

describe("POST /api/ai/process", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
    for (const k of Object.keys(inserts)) delete inserts[k];
    mockGenerate.mockReset();
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
  });

  it("returns 404 for a non member on a project meeting", async () => {
    queues.meetings = [
      { data: { id: "m1", user_id: "owner", project_id: "p1" }, error: null },
    ];
    queues.project_members = [{ data: null, error: null }];

    const res = await call("stranger");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Meeting not found" });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it.each(["viewer", "developer"])(
    "returns 403 for a %s on a project meeting",
    async (role) => {
      queues.meetings = [
        { data: { id: "m1", user_id: "owner", project_id: "p1" }, error: null },
      ];
      queues.project_members = [{ data: { role }, error: null }];

      expect((await call("member")).status).toBe(403);
      expect(mockGenerate).not.toHaveBeenCalled();
    },
  );

  it("returns 409 and runs no AI once a project proposal was reviewed (W4 AC-34)", async () => {
    queues.meetings = [
      { data: { id: "m1", user_id: "owner", project_id: "p1" }, error: null },
    ];
    queues.project_members = [{ data: { role: "admin" }, error: null }];
    queues.action_items = [
      {
        data: [
          { id: "ai-1", review_state: "proposed" },
          { id: "ai-2", review_state: "confirmed" },
        ],
        error: null,
      },
    ];

    expect((await call("admin")).status).toBe(409);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 404 for a non creator on a personal meeting", async () => {
    queues.meetings = [
      { data: { id: "m1", user_id: "owner", project_id: null }, error: null },
    ];

    expect((await call("intruder")).status).toBe(404);
    expect(mockGenerate).not.toHaveBeenCalled();
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
          user_id: "u1",
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

  it("saves key points and decisions and gives every action item an id", async () => {
    ownedMeeting();
    mockGenerate.mockResolvedValue({ object: extraction });

    expect((await call("u1")).status).toBe(200);

    const sentItems = inserts.action_items[0] as Array<{ id: string }>;
    expect(sentItems).toHaveLength(2);
    for (const item of sentItems) expect(item.id).toMatch(UUID);

    const saved = savedInsights();
    expect(saved.key_points).toEqual(["Hosting"]);
    expect(saved.decisions).toEqual(["Use Vercel"]);
    expect(saved).not.toHaveProperty("minutes_draft");
  });

  it("returns 500 and writes nothing when extraction fails (AC-14)", async () => {
    ownedMeeting();
    mockGenerate.mockRejectedValue(new Error("both providers failed"));

    expect((await call("u1")).status).toBe(500);
    expect(inserts.meeting_insights).toBeUndefined();
  });

  it("returns a friendly message, never the provider's error text", async () => {
    ownedMeeting();
    mockGenerate.mockRejectedValue(
      new Error("Failed to validate JSON, see failed_generation"),
    );

    const res = await call("u1");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "AI is busy right now, please try again in a minute",
    });
  });

  it("returns 404 when the meeting has no transcript", async () => {
    queues.meetings = [
      { data: { id: "m1", started_at: null, created_at: null }, error: null },
    ];
    queues.transcripts = [{ data: null, error: { message: "no rows" } }];

    expect((await call("u1")).status).toBe(404);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 409 while another run holds the process step", async () => {
    ownedMeeting();
    vi.mocked(claimPipelineStep).mockResolvedValueOnce(false);

    const res = await call("u1");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Summary is already being created",
    });
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
