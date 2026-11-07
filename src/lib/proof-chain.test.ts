import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  keptForItem,
  keptForTask,
  saidForItem,
  saidForTask,
  shippedStep,
  taskStepForItem,
  type ProofLinkRow,
} from "./proof-chain";

const item = {
  meetingId: "m1",
  meetingTitle: "Standup",
  quote: "main Friday tak bhej dunga",
  speaker: "Ali",
  lineNumber: 4,
};

const said = {
  quote: null,
  quoteSpeaker: null,
  quoteLine: null,
  hasSource: false,
  meetingId: null,
  meetingTitle: null,
  mergedItems: [],
};

const link = (over: Partial<ProofLinkRow> = {}): ProofLinkRow => ({
  task_id: "t1",
  state: "merged",
  closes: true,
  base_ref: "main",
  repo_id: 1,
  merged_at: "2026-11-01T00:00:00Z",
  reverted_at: null,
  repo_full_name: "acme/app",
  pr_number: 7,
  pr_url: "https://github.com/acme/app/pull/7",
  ...over,
});

const branches = new Map([[1, "main"]]);
const open = { completion_kind: null, completion_evidence: null };

describe("Said", () => {
  it("shows the quote, speaker, and line", () => {
    expect(saidForItem(item, false)).toMatchObject({
      state: "quoted",
      quote: item.quote,
      speaker: "Ali",
      lineNumber: 4,
      meetingId: "m1",
    });
  });

  it("hides the quote from a Viewer but keeps the meeting", () => {
    const step = saidForItem(item, true);
    expect(step).toEqual({
      state: "hidden",
      meetingId: "m1",
      meetingTitle: "Standup",
    });
  });

  it("reads typed for a task with no source", () => {
    expect(saidForTask(said, false)).toEqual({ state: "typed" });
    expect(saidForTask(said, true)).toEqual({ state: "typed" });
  });

  it("reads no quote when a source was confirmed without one", () => {
    expect(
      saidForTask({ ...said, hasSource: true, meetingId: "m1" }, false).state,
    ).toBe("no_quote");
  });

  it("uses the earliest merged item and counts the others", () => {
    const step = saidForTask(
      { ...said, mergedItems: [item, { ...item, quote: "second" }] },
      false,
    );
    expect(step).toMatchObject({
      state: "quoted",
      quote: item.quote,
      moreCount: 1,
    });
  });

  it("counts every merged item when the task has its own source", () => {
    const step = saidForTask(
      { ...said, hasSource: true, quote: "own", mergedItems: [item] },
      false,
    );
    expect(step).toMatchObject({ quote: "own", moreCount: 1 });
  });

  it("hides a merged quote from a Viewer", () => {
    const step = saidForTask({ ...said, mergedItems: [item] }, true);
    expect(step.state).toBe("hidden");
    expect(step.quote).toBeUndefined();
  });
});

describe("Task", () => {
  const task = { id: "t1", number: 3, status: "in_progress" };

  it("reads a decision before anything else", () => {
    expect(taskStepForItem("decision", task, null, "NM", false)).toEqual({
      state: "decision",
    });
  });

  it("links the task with its key", () => {
    expect(
      taskStepForItem("promise", task, "rejected", "NM", false),
    ).toMatchObject({
      state: "linked",
      taskId: "t1",
      key: "NM-3",
    });
  });

  it("reads waiting and rejected from the proposal", () => {
    expect(
      taskStepForItem("promise", null, "proposed", null, false).state,
    ).toBe("waiting");
    expect(
      taskStepForItem("promise", null, "rejected", null, false).state,
    ).toBe("rejected");
    expect(taskStepForItem("promise", null, null, null, false).state).toBe(
      "none",
    );
  });

  it("gives a Viewer no proposal state", () => {
    expect(taskStepForItem("promise", null, "proposed", null, true).state).toBe(
      "none",
    );
    expect(taskStepForItem("promise", null, "rejected", null, true).state).toBe(
      "none",
    );
  });
});

describe("Shipped", () => {
  it("reads not yet with no task or no PR", () => {
    expect(shippedStep(null, [], branches, false).state).toBe("none");
    expect(shippedStep(open, [], branches, false).state).toBe("none");
  });

  it("shows the merged PR into the default branch", () => {
    expect(shippedStep(open, [link()], branches, false)).toEqual({
      state: "merged",
      repoFullName: "acme/app",
      prNumber: 7,
      prUrl: "https://github.com/acme/app/pull/7",
    });
  });

  it("gives a Viewer the word merged and nothing else", () => {
    expect(shippedStep(open, [link()], branches, true)).toEqual({
      state: "merged",
    });
  });

  it("ignores a side branch", () => {
    expect(
      shippedStep(open, [link({ base_ref: "feature/x" })], branches, false)
        .state,
    ).toBe("none");
  });

  it("ignores a PR that does not close the task", () => {
    expect(
      shippedStep(open, [link({ closes: false })], branches, false).state,
    ).toBe("none");
  });

  it("ignores a repo that was unlinked", () => {
    expect(shippedStep(open, [link()], new Map(), false).state).toBe("none");
  });

  it("reads reverted once the only qualifying PR is reverted", () => {
    const reverted = link({ reverted_at: "2026-11-02T00:00:00Z" });
    expect(shippedStep(open, [reverted], branches, false)).toEqual({
      state: "reverted",
    });
  });

  it("stays merged when a second PR still stands after a revert", () => {
    const step = shippedStep(
      open,
      [link({ reverted_at: "2026-11-02T00:00:00Z" }), link({ pr_number: 8 })],
      branches,
      false,
    );
    expect(step).toMatchObject({ state: "merged", prNumber: 8 });
  });

  it("names the PR the merge completion recorded", () => {
    const step = shippedStep(
      {
        completion_kind: "merge",
        completion_evidence: "https://github.com/acme/app/pull/9",
      },
      [
        link(),
        link({
          pr_number: 9,
          pr_url: "https://github.com/acme/app/pull/9",
          merged_at: "2026-10-01T00:00:00Z",
        }),
      ],
      branches,
      false,
    );
    expect(step).toMatchObject({ state: "merged", prNumber: 9 });
  });

  it("reads manual for a task completed by hand", () => {
    expect(
      shippedStep({ completion_kind: "manual" }, [], branches, false).state,
    ).toBe("manual");
  });
});

describe("Kept", () => {
  it("follows the item's status and its review state", () => {
    expect(keptForItem("kept", false).state).toBe("kept");
    expect(keptForItem("reversed", true).state).toBe("reversed");
    expect(keptForItem("open", true).state).toBe("review");
    expect(keptForItem("open", false).state).toBe("none");
  });

  const open1 = { status: "open" as const, hasSuggested: false };
  const kept1 = { status: "kept" as const, hasSuggested: false };

  it("reads no promise on a task with no items", () => {
    expect(keptForTask([]).state).toBe("no_promise");
  });

  it("reads 1 of 2 kept for a merged proposal", () => {
    expect(keptForTask([kept1, open1])).toEqual({
      state: "partial",
      keptCount: 1,
      total: 2,
    });
  });

  it("reads kept only when every item is kept", () => {
    expect(keptForTask([kept1, kept1]).state).toBe("kept");
  });

  it("lets a reversal win, then a review", () => {
    expect(
      keptForTask([kept1, { status: "reversed", hasSuggested: false }]).state,
    ).toBe("reversed");
    expect(
      keptForTask([kept1, { status: "open", hasSuggested: true }]).state,
    ).toBe("review");
  });
});
