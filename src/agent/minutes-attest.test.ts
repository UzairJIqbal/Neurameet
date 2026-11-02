import { describe, it, expect } from "vitest";
import {
  buildStatusText,
  canRecordView,
  computeDeadline,
  lineHolders,
  linesFromLabel,
  listSpeakerLabels,
  quorumMet,
  sealBlocker,
  type AttesterRef,
  type AttributableLine,
} from "./minutes";

const owner: AttesterRef = {
  userId: "owner",
  displayName: "Sara Khan",
  isOwner: true,
  doneAt: null,
};
const ali: AttesterRef = {
  userId: "p1",
  displayName: "Ali Raza",
  isOwner: false,
  doneAt: null,
};
const done = (a: AttesterRef): AttesterRef => ({
  ...a,
  doneAt: "2026-11-03T10:00:00Z",
});
const line = (over: Partial<AttributableLine> = {}): AttributableLine => ({
  id: "l1",
  section: "key_point",
  supported: true,
  evidence: [{ quote: "Not sure", lineNumber: 2, speaker: "Ali" }],
  assignee: null,
  ...over,
});

describe("computeDeadline", () => {
  it("skips the weekend and ends 23:59:59 Karachi time", () => {
    expect(
      computeDeadline(new Date("2026-11-06T08:00:00Z"), 3).toISOString(),
    ).toBe("2026-11-11T18:59:59.000Z");
  });

  it("counts from the Karachi day, not the UTC day", () => {
    // 20:00 UTC Thursday is already Friday 01:00 in Karachi.
    expect(
      computeDeadline(new Date("2026-11-05T20:00:00Z"), 3).toISOString(),
    ).toBe("2026-11-11T18:59:59.000Z");
  });
});

describe("listSpeakerLabels", () => {
  it("merges labels by key, keeps the first spelling, drops timestamps", () => {
    const raw = "Sara: hi\nALI: hello\n10:30: noise\nali: again\nno label here";
    expect(listSpeakerLabels(raw)).toEqual([
      { key: "sara", label: "Sara" },
      { key: "ali", label: "ALI" },
    ]);
  });
});

describe("lineHolders", () => {
  const claims = [{ speakerLabel: "ali", userId: "p1" }];

  it("gives a line to whoever claimed its evidence speaker", () => {
    expect(lineHolders(line(), [owner, ali], claims)).toEqual(["p1"]);
  });

  it("matches an action item assignee by first name", () => {
    const item = line({
      section: "action_item",
      evidence: [],
      assignee: "Ali",
    });
    expect(lineHolders(item, [owner, ali], [])).toContain("p1");
  });

  it("gives orphan and unsupported lines to the owner", () => {
    expect(lineHolders(line({ evidence: [] }), [owner, ali], claims)).toEqual([
      "owner",
    ]);
    expect(
      lineHolders(line({ supported: false }), [owner, ali], claims),
    ).toEqual(["p1", "owner"]);
  });

  it("leaves an unclaimed speaker's line with no holder", () => {
    expect(lineHolders(line(), [owner, ali], [])).toEqual([]);
  });
});

describe("canRecordView and linesFromLabel", () => {
  it("allows a view on your lines, any decision, and unsupported lines", () => {
    expect(canRecordView(line(), false)).toBe(false);
    expect(canRecordView(line(), true)).toBe(true);
    expect(canRecordView(line({ section: "decision" }), false)).toBe(true);
    expect(canRecordView(line({ supported: false }), false)).toBe(true);
  });

  it("finds the lines that come from one label", () => {
    const lines = [
      line(),
      line({ id: "l2", evidence: [], section: "action_item", assignee: "ali" }),
      line({ id: "l3", evidence: [] }),
    ];
    expect(linesFromLabel(lines, "ali")).toEqual(["l1", "l2"]);
  });
});

describe("quorumMet and sealBlocker", () => {
  const future = "2099-01-01T00:00:00Z";
  const now = new Date("2026-11-04T00:00:00Z");
  const bilal: AttesterRef = {
    userId: "p2",
    displayName: "Bilal",
    isOwner: false,
    doneAt: null,
  };

  it("needs the owner plus more than half of the others", () => {
    expect(quorumMet([owner])).toBe(false);
    expect(quorumMet([done(owner)])).toBe(true);
    expect(quorumMet([done(owner), done(ali), bilal])).toBe(false);
    expect(quorumMet([done(owner), done(ali), done(bilal)])).toBe(true);
  });

  it("explains what blocks the seal until quorum or the deadline", () => {
    expect(sealBlocker([owner, ali], future, now)).toBe(
      "Finish your own review first.",
    );
    expect(sealBlocker([done(owner), ali], future, now)).toMatch(
      /More than half/u,
    );
    expect(
      sealBlocker([done(owner), ali], "2026-11-01T00:00:00Z", now),
    ).toBeNull();
    expect(sealBlocker([done(owner), done(ali)], future, now)).toBeNull();
  });
});

describe("buildStatusText", () => {
  it("states who confirmed, who did not, and the views and corrections", () => {
    const people = [
      { doneAt: "x" },
      { doneAt: "y" },
      { doneAt: null },
      { doneAt: null },
    ];
    const answers = [
      { action: "confirm" as const },
      { action: "view" as const },
      { action: "correct" as const },
    ];
    expect(buildStatusText(people, answers)).toBe(
      "Confirmed by 2 of 4. 2 did not respond. 1 recorded view, 1 correction.",
    );
    expect(buildStatusText([{ doneAt: "x" }], [{ action: "confirm" }])).toBe(
      "Confirmed by 1 of 1.",
    );
  });
});
