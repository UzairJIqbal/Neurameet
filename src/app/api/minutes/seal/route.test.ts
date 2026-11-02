import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth, mockSealedEmail } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSealedEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/email", () => ({
  sendMinutesSealedEmail: mockSealedEmail,
  verifyUrlFor: (id: string) => `http://localhost/minutes/verify/${id}`,
}));

import { POST } from "./route";

const post = (userId: string | null) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/minutes/seal", {
      method: "POST",
      body: JSON.stringify({ meetingId: "m1" }),
    }),
  );
};

const meeting = ok({
  id: "m1",
  user_id: "owner",
  title: "Weekly",
  started_at: "2026-11-02T09:00:00Z",
  created_at: null,
});
const review = (status = "open") =>
  ok({
    id: "r1",
    meeting_id: "m1",
    status,
    deadline_days: 3,
    deadline_at: "2099-01-01T00:00:00Z",
    opened_at: "2026-11-02T10:00:00Z",
    coverage: {
      lastLine: 1,
      totalLines: 1,
      text: "These minutes cover transcript lines 1 to 1 of 1",
    },
    transcript_source: "upload",
    transcript_sha256: "x",
  });
const owner = (done: string | null) => ({
  user_id: "owner",
  display_name: "Sara",
  email: "o@example.com",
  is_owner: true,
  done_at: done,
});
const ali = {
  user_id: "p1",
  display_name: "Ali",
  email: "a@example.com",
  is_owner: false,
  done_at: "2026-11-03T10:00:00Z",
};

/** One loadReviewRows read with no lines (so no attestations read). */
function rowsRead(attesters: unknown[]) {
  queue("minutes_lines", ok([]));
  queue("minutes_attesters", ok(attesters));
  queue("minutes_speaker_claims", ok([]));
}

const reviewUpdates = () =>
  callsOf("minutes_reviews", "update").map((c) => c.args[0]);

describe("POST /api/minutes/seal", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.MINUTES_SIGNING_PRIVATE_KEY = generateKeyPairSync("ed25519")
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    process.env.MINUTES_SIGNING_KEY_ID = "k1";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("returns 401, then 404 to a stranger and 403 to a participant", async () => {
    expect((await post(null)).status).toBe(401);
    queue("meetings", meeting, meeting);
    queue("attendance_events", ok([]), ok([{ user_id: "p1" }]));
    expect((await post("x")).status).toBe(404);
    expect((await post("p1")).status).toBe(403);
  });

  it("returns 409 for no review, a sealed one, and one already sealing", async () => {
    queue("meetings", meeting, meeting, meeting);
    queue("minutes_reviews", ok(null), review("sealed"), review("sealing"));
    expect((await post("owner")).status).toBe(409);
    expect(await (await post("owner")).json()).toEqual({
      error: "These minutes are already sealed",
    });
    expect(await (await post("owner")).json()).toEqual({
      error: "A seal is already in progress",
    });
  });

  it("returns 409 with the blocker while the owner has not finished", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", review());
    rowsRead([owner(null), ali]);
    const res = await post("owner");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Finish your own review first.",
    });
  });

  it("returns 500 without touching the review when the key is missing", async () => {
    delete process.env.MINUTES_SIGNING_PRIVATE_KEY;
    queue("meetings", meeting);
    queue("minutes_reviews", review());
    rowsRead([owner("2026-11-03T09:00:00Z"), ali]);
    const res = await post("owner");
    expect(res.status).toBe(500);
    expect(reviewUpdates()).toHaveLength(0);
  });

  it("returns 409 when another seal won the flip", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", review(), ok([]));
    rowsRead([owner("2026-11-03T09:00:00Z"), ali]);
    expect((await post("owner")).status).toBe(409);
  });

  it("seals, chains to the previous seal, and emails every attester", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", review(), ok([{ id: "r1" }]), ok(null));
    rowsRead([owner("2026-11-03T09:00:00Z"), ali]);
    rowsRead([owner("2026-11-03T09:00:00Z"), ali]);
    queue(
      "minutes_seals",
      ok({ content_sha256: "prev" }),
      ok({ id: "seal-1" }),
    );
    const res = await post("owner");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      sealId: "seal-1",
      statusText: "Confirmed by 2 of 2.",
    });
    expect(json.hash).toMatch(/^[0-9a-f]{64}$/u);
    const insert = callsOf("minutes_seals", "insert")[0].args[0] as Record<
      string,
      unknown
    >;
    expect(insert).toMatchObject({
      prev_seal_sha256: "prev",
      key_id: "k1",
      content_sha256: json.hash,
    });
    expect(JSON.stringify(insert)).not.toContain("PRIVATE KEY");
    expect(reviewUpdates()).toEqual([
      { status: "sealing" },
      { status: "sealed" },
    ]);
    expect(mockSealedEmail).toHaveBeenCalledTimes(2);
  });

  it("moves the review back to open when the insert fails", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", review(), ok([{ id: "r1" }]));
    rowsRead([owner("2026-11-03T09:00:00Z"), ali]);
    rowsRead([owner("2026-11-03T09:00:00Z"), ali]);
    queue("minutes_seals", ok(null), {
      data: null,
      error: { message: "boom" },
    });
    const res = await post("owner");
    expect(res.status).toBe(500);
    expect(reviewUpdates()).toEqual([
      { status: "sealing" },
      { status: "open" },
    ]);
    expect(mockSealedEmail).not.toHaveBeenCalled();
  });
});
