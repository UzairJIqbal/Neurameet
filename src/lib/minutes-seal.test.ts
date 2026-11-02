import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { client, ok, queue, resetQueues } from "@/test/supabase-queue-mock";
import type { MeetingRow, ReviewRow, ReviewRows } from "@/lib/minutes-review";

vi.mock("server-only", () => ({}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import {
  buildSealBundle,
  buildSnapshot,
  canonicalJson,
  loadSigningKey,
  sha256Hex,
  signCanonical,
  SigningKeyError,
  verifySeal,
  verifySignature,
} from "./minutes-seal";
import type { SupabaseClient } from "@supabase/supabase-js";

const pem = (type: "ed25519" | "rsa") => {
  const { privateKey } =
    type === "ed25519"
      ? generateKeyPairSync("ed25519")
      : generateKeyPairSync("rsa", { modulusLength: 1024 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
};

const RAW = "Sara: We go with Vercel\nAli: Not sure";
const SEAL_ID = "11111111-2222-4333-8444-555555555555";

const meeting: MeetingRow = {
  id: "m1",
  user_id: "owner",
  title: "Weekly",
  started_at: "2026-11-02T09:00:00Z",
  created_at: null,
};
const review: ReviewRow = {
  id: "r1",
  meeting_id: "m1",
  status: "sealing",
  deadline_days: 3,
  deadline_at: "2026-11-05T18:59:59Z",
  opened_at: "2026-11-02T10:00:00Z",
  coverage: {
    lastLine: 2,
    totalLines: 2,
    text: "These minutes cover transcript lines 1 to 2 of 2",
  },
  transcript_source: "upload",
  transcript_sha256: sha256Hex(RAW),
};
const line = (id: string, position: number) => ({
  id,
  position,
  section: "decision" as const,
  text: `Line ${id}`,
  evidence: [{ quote: "We go with Vercel", lineNumber: 1, speaker: "Sara" }],
  supported: true,
  speaker_labels: ["Sara"],
  action_item_id: null,
  assignee: null,
});
const rows: ReviewRows = {
  lines: [line("b", 1), line("a", 0)],
  attesters: [
    {
      user_id: "u2",
      display_name: "Ali",
      email: "a@x.com",
      is_owner: false,
      done_at: null,
    },
    {
      user_id: "owner",
      display_name: "Sara",
      email: null,
      is_owner: true,
      done_at: "2026-11-03T10:00:00+00:00",
    },
  ],
  claims: [
    {
      speaker_label: "sara",
      display_label: "Sara",
      user_id: "owner",
      claimed_by: "self",
    },
    {
      speaker_label: "ali",
      display_label: "Ali",
      user_id: "u2",
      claimed_by: "owner",
    },
  ],
  attestations: [
    {
      line_id: "b",
      user_id: "owner",
      action: "confirm",
      note: null,
      late: false,
    },
    {
      line_id: "a",
      user_id: "u2",
      action: "view",
      note: "I objected",
      late: true,
    },
    {
      line_id: "a",
      user_id: "owner",
      action: "confirm",
      note: null,
      late: false,
    },
  ],
};

/** Queues what loadReviewRows and loadRawText read during verify. */
function queueLive(live: ReviewRows, raw = RAW) {
  queue("minutes_lines", ok(live.lines));
  queue("minutes_attesters", ok(live.attesters));
  queue("minutes_speaker_claims", ok(live.claims));
  queue("minutes_attestations", ok(live.attestations));
  queue("transcripts", ok({ raw_text: raw }));
}

async function sealRow() {
  const bundle = await buildSealBundle(
    client as unknown as SupabaseClient,
    meeting,
    review,
    rows,
    "Confirmed by 1 of 2. 1 did not respond. 1 recorded view, 0 corrections.",
    null,
    "2026-11-04T08:00:00.000Z",
  );
  const canonical = canonicalJson(bundle);
  const { key, keyId } = loadSigningKey();
  return {
    id: SEAL_ID,
    review_id: "r1",
    meeting_id: "m1",
    content_sha256: sha256Hex(canonical),
    signature: signCanonical(canonical, key),
    key_id: keyId,
    bundle,
    status_text: bundle.statusText,
  };
}

describe("canonicalJson", () => {
  it("sorts keys at every depth, keeps array order, drops undefined", () => {
    expect(
      canonicalJson({ b: 1, a: { d: [2, 1], c: undefined, b: null } }),
    ).toBe('{"a":{"b":null,"d":[2,1]},"b":1}');
  });

  it("gives the same hash for the same data in any key order", () => {
    expect(sha256Hex(canonicalJson({ x: 1, y: "ü" }))).toBe(
      sha256Hex(canonicalJson({ y: "ü", x: 1 })),
    );
  });
});

describe("buildSnapshot", () => {
  it("orders lines by position, attesters by id, answers by line then user", () => {
    const snap = buildSnapshot(rows);
    expect(snap.lines.map((l) => l.id)).toEqual(["a", "b"]);
    expect(snap.attesters.map((a) => a.userId)).toEqual(["owner", "u2"]);
    expect(snap.claims.map((c) => c.userId)).toEqual(["owner", "u2"]);
    expect(snap.attestations.map((a) => `${a.lineId}:${a.userId}`)).toEqual([
      "a:owner",
      "a:u2",
      "b:owner",
    ]);
    expect(snap.attesters[0].doneAt).toBe("2026-11-03T10:00:00.000Z");
    expect(JSON.stringify(snap)).not.toContain("a@x.com");
  });
});

describe("signing key and signature", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("loads an Ed25519 key written with \\n and verifies its own signature", () => {
    process.env.MINUTES_SIGNING_PRIVATE_KEY = pem("ed25519").replace(
      /\n/g,
      "\\n",
    );
    process.env.MINUTES_SIGNING_KEY_ID = "k1";
    const { key, keyId } = loadSigningKey();
    expect(keyId).toBe("k1");
    const sig = signCanonical('{"a":1}', key);
    expect(verifySignature('{"a":1}', sig, key)).toBe(true);
    expect(verifySignature('{"a":2}', sig, key)).toBe(false);
  });

  it("throws SigningKeyError when the key is missing or not Ed25519", () => {
    delete process.env.MINUTES_SIGNING_PRIVATE_KEY;
    process.env.MINUTES_SIGNING_KEY_ID = "k1";
    expect(() => loadSigningKey()).toThrow(SigningKeyError);
    process.env.MINUTES_SIGNING_PRIVATE_KEY = pem("rsa");
    expect(() => loadSigningKey()).toThrow(SigningKeyError);
    process.env.MINUTES_SIGNING_PRIVATE_KEY = "not a key";
    expect(() => loadSigningKey()).toThrow(SigningKeyError);
  });
});

describe("verifySeal", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.MINUTES_SIGNING_PRIVATE_KEY = pem("ed25519");
    process.env.MINUTES_SIGNING_KEY_ID = "k1";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("returns null for a malformed or unknown id", async () => {
    expect(await verifySeal("nope")).toBeNull();
    queue("minutes_seals", ok(null));
    expect(await verifySeal(SEAL_ID)).toBeNull();
  });

  it("says intact for untouched rows and checks a pasted hash", async () => {
    const seal = await sealRow();
    queue("minutes_seals", ok(seal));
    queueLive(rows);
    const result = await verifySeal(SEAL_ID, seal.content_sha256.toUpperCase());
    expect(result).toMatchObject({
      result: "intact",
      hashMatches: true,
      title: "Weekly",
      date: "2026-11-02",
    });
    expect(JSON.stringify(result)).not.toContain("Line a");
  });

  it("says altered when a line changed after the seal", async () => {
    const seal = await sealRow();
    queue("minutes_seals", ok(seal));
    queueLive({
      ...rows,
      lines: [line("a", 0), { ...line("b", 1), text: "Edited" }],
    });
    const result = await verifySeal(SEAL_ID, "beef");
    expect(result).toMatchObject({ result: "altered", hashMatches: false });
  });

  it("says altered when an answer was removed or the transcript changed", async () => {
    const seal = await sealRow();
    queue("minutes_seals", ok(seal));
    queueLive({ ...rows, attestations: rows.attestations.slice(1) });
    expect((await verifySeal(SEAL_ID))?.result).toBe("altered");
    resetQueues();
    queue("minutes_seals", ok(seal));
    queueLive(rows, `${RAW}\nextra`);
    expect((await verifySeal(SEAL_ID))?.result).toBe("altered");
  });

  it("says altered when the bundle or signature was tampered with", async () => {
    const seal = await sealRow();
    queue(
      "minutes_seals",
      ok({
        ...seal,
        bundle: { ...seal.bundle, statusText: "Confirmed by 2 of 2." },
      }),
    );
    expect((await verifySeal(SEAL_ID))?.result).toBe("altered");
    process.env.MINUTES_SIGNING_PRIVATE_KEY = pem("ed25519");
    queue("minutes_seals", ok(seal));
    expect((await verifySeal(SEAL_ID))?.result).toBe("altered");
  });
});
