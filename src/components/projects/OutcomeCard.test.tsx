// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import OutcomeCard from "./OutcomeCard";
import type { Outcome } from "@/lib/proof-types";

const outcome = (over: Partial<Outcome> = {}): Outcome => ({
  said: { state: "typed" },
  task: { state: "none" },
  shipped: { state: "none" },
  kept: { state: "none" },
  ...over,
});

afterEach(cleanup);

describe("OutcomeCard wording (AC-60)", () => {
  it.each<[Partial<Outcome>, string]>([
    [{ said: { state: "typed" } }, "Typed by hand, no quote"],
    [{ said: { state: "no_quote" } }, "Confirmed without a quote"],
    [{ said: { state: "hidden" } }, "Hidden for viewers"],
    [{ task: { state: "waiting" } }, "Waiting in proposals"],
    [{ task: { state: "rejected" } }, "Proposal rejected"],
    [{ task: { state: "none" } }, "No task yet"],
    [{ task: { state: "decision" } }, "No task, this is a decision"],
    [{ shipped: { state: "reverted" } }, "Reverted"],
    [{ shipped: { state: "manual" } }, "Completed by hand, no PR"],
    [{ shipped: { state: "not_applicable" } }, "Not needed"],
    [{ shipped: { state: "merged" } }, "Merged"],
    [{ kept: { state: "partial", keptCount: 1, total: 2 } }, "1 of 2 kept"],
    [{ kept: { state: "reversed" } }, "Reversed"],
    [{ kept: { state: "review" } }, "Waiting for review"],
    [{ kept: { state: "no_promise" } }, "No promise linked"],
  ])("%j reads %s", (over, words) => {
    render(<OutcomeCard outcome={outcome(over)} />);
    expect(screen.getAllByText(words).length).toBeGreaterThan(0);
  });

  it("reads Kept as the last step's value, beside its label", () => {
    render(<OutcomeCard outcome={outcome({ kept: { state: "kept" } })} />);
    expect(screen.getAllByText("Kept")).toHaveLength(2);
  });

  it("shows the quote, its speaker and line, and the count of others", () => {
    render(
      <OutcomeCard
        outcome={outcome({
          said: {
            state: "quoted",
            quote: "main bhej dunga",
            speaker: "Ali",
            lineNumber: 4,
            meetingId: "m1",
            meetingTitle: "Standup",
            moreCount: 2,
          },
        })}
      />,
    );
    expect(screen.getByText("main bhej dunga")).toBeTruthy();
    expect(screen.getByText("Ali · line 4")).toBeTruthy();
    expect(screen.getByText("+2 more")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Standup" }).getAttribute("href"),
    ).toBe("/meeting-intelligence/m1");
  });

  it("links the merged PR", () => {
    render(
      <OutcomeCard
        outcome={outcome({
          shipped: {
            state: "merged",
            repoFullName: "acme/app",
            prNumber: 7,
            prUrl: "https://github.com/acme/app/pull/7",
          },
        })}
      />,
    );
    expect(
      screen.getByRole("link", { name: "acme/app #7" }).getAttribute("href"),
    ).toBe("https://github.com/acme/app/pull/7");
  });

  it("opens the task when a handler is given, and stays plain text without one", () => {
    const task: Outcome["task"] = {
      state: "linked",
      taskId: "t1",
      key: "NM-3",
      status: "done",
    };
    const onOpenTask = vi.fn();
    const { rerender } = render(
      <OutcomeCard outcome={outcome({ task })} onOpenTask={onOpenTask} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /NM-3/ }));
    expect(onOpenTask).toHaveBeenCalledWith("t1");
    rerender(<OutcomeCard outcome={outcome({ task })} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/NM-3/)).toBeTruthy();
  });
});
