import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/email", () => ({
  verifyUrlFor: (id: string) => `http://localhost/minutes/verify/${id}`,
}));

import { GET } from "./route";

const get = (userId: string | null) => {
  mockAuth.mockResolvedValue({ userId });
  return GET(new Request("http://localhost/api/minutes/pdf?meetingId=m1"));
};

const meeting = ok({
  id: "m1",
  user_id: "owner",
  title: "Weekly",
  started_at: null,
  created_at: null,
});
const ali = ok({
  user_id: "p1",
  display_name: "Ali",
  email: null,
  is_owner: false,
  done_at: null,
});
const bundle = {
  meeting: { id: "m1", title: "Weekly Sync!", date: "2026-11-02" },
  transcript: { source: "recording", sha256: "x" },
  coverageText: "These minutes cover transcript lines 1 to 2 of 2",
  attesters: [
    { userId: "p1", displayName: "Ali", isOwner: false, doneAt: null },
  ],
  lines: [
    {
      id: "l1",
      position: 0,
      section: "decision",
      text: "Use Vercel, فیصلہ",
      evidence: [
        { quote: "We go with Vercel", lineNumber: 1, speaker: "Sara" },
      ],
      supported: true,
      speakerLabels: ["Sara"],
      actionItemId: null,
      assignee: null,
    },
  ],
  attestations: [
    {
      lineId: "l1",
      userId: "p1",
      action: "view",
      note: "I objected",
      late: true,
    },
  ],
};

describe("GET /api/minutes/pdf", () => {
  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when signed out and 409 before the seal", async () => {
    expect((await get(null)).status).toBe(401);
    queue("meetings", meeting);
    queue("minutes_reviews", ok({ id: "r1", status: "open" }));
    queue("minutes_attesters", ali);
    expect((await get("p1")).status).toBe(409);
  });

  it("returns the sealed minutes as a PDF attachment", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", ok({ id: "r1", status: "sealed" }));
    queue("minutes_attesters", ali);
    queue(
      "minutes_seals",
      ok({
        id: "seal-1",
        content_sha256: "a".repeat(64),
        status_text: "Confirmed by 1 of 1.",
        sealed_at: "2026-11-04T08:00:00Z",
        bundle,
      }),
    );
    const res = await get("p1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="minutes-weekly-sync.pdf"',
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
