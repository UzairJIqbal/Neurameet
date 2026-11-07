// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Proposal } from "@/lib/task-types";
import ProposalsPanel from "./ProposalsPanel";

const client = vi.hoisted(() => ({
  listProposals: vi.fn(),
  listMembers: vi.fn(),
  reviewProposal: vi.fn(),
}));

vi.mock("@/lib/project-client", () => {
  class ProjectClientError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { ...client, ProjectClientError };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const row = (id: string, extra: Partial<Proposal> = {}): Proposal => ({
  id,
  meetingId: "m1",
  meetingTitle: "Auth review",
  meetingDate: "2026-11-01",
  title: `Task ${id}`,
  assignee: null,
  dueDate: null,
  quote: `Quote ${id}`,
  quoteSpeaker: "Ali",
  quoteLine: 3,
  quoteVerified: true,
  proposedAssigneeId: null,
  duplicate: null,
  ...extra,
});

const setup = async (proposals: Proposal[], canReview = true) => {
  client.listProposals.mockResolvedValue({ proposals, canReview });
  client.listMembers.mockResolvedValue({
    members: [],
    myRole: "owner",
    me: "u1",
  });
  const onChanged = vi.fn();
  const view = render(
    <ProposalsPanel
      project={{ id: "p1" }}
      meetingId="m1"
      onChanged={onChanged}
    />,
  );
  await waitFor(() => expect(client.listMembers).toHaveBeenCalled());
  return { ...view, onChanged };
};

const bulk = (count: number) =>
  screen.findByRole("button", { name: `Confirm and Create Tasks (${count})` });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Meeting proposals bulk confirm (spec 0004 AC-70w)", () => {
  it("filters to this meeting under the review banner", async () => {
    await setup([row("a"), row("b", { meetingId: "other" })]);
    expect(await screen.findByText("Human review required")).toBeTruthy();
    expect(screen.getByText("Task a")).toBeTruthy();
    expect(screen.queryByText("Task b")).toBeNull();
  });

  it("is not shown when no row belongs to this meeting", async () => {
    const { container } = await setup([row("b", { meetingId: "other" })]);
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("calls the route once per row and lists only the row that failed", async () => {
    const { ProjectClientError } = await import("@/lib/project-client");
    client.reviewProposal.mockImplementation(async (id: string) => {
      if (id === "b") throw new ProjectClientError(422, "That assignee left");
      return { task: { key: id } };
    });
    const { onChanged } = await setup([row("a"), row("b"), row("c")]);
    fireEvent.click(await bulk(3));

    await waitFor(() => expect(client.reviewProposal).toHaveBeenCalledTimes(3));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Task b: That assignee left");
    expect(alert.textContent).not.toContain("Task a");
    expect(screen.queryByText("Task a")).toBeNull();
    expect(screen.getByText("Task b", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("Task c")).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(await bulk(1)).toBeTruthy();
  });

  it("never confirms a row with no verified quote through the bulk button", async () => {
    client.reviewProposal.mockResolvedValue({ task: { key: "a" } });
    await setup([row("a"), row("x", { quoteVerified: false, quote: null })]);
    fireEvent.click(await bulk(1));
    await waitFor(() => expect(client.reviewProposal).toHaveBeenCalledTimes(1));
    expect(client.reviewProposal.mock.calls[0][0]).toBe("a");
    expect(screen.getByText("No matching transcript line")).toBeTruthy();
    expect(screen.queryByLabelText("Select Task x")).toBeNull();
  });

  it("sends confirmWithoutQuote only from that row's own confirm step", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    client.reviewProposal.mockResolvedValue({ task: { key: "x" } });
    await setup([row("x", { quoteVerified: false, quote: null })]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm without a quote" }),
    );
    await waitFor(() => expect(client.reviewProposal).toHaveBeenCalledTimes(1));
    expect(window.confirm).toHaveBeenCalled();
    expect(client.reviewProposal.mock.calls[0][1]).toMatchObject({
      decision: "confirm",
      confirmWithoutQuote: true,
    });
  });

  it("leaves an unchecked row out and uses edits in the bulk call", async () => {
    client.reviewProposal.mockResolvedValue({ task: { key: "a" } });
    await setup([row("a"), row("b")]);
    fireEvent.click(await screen.findByLabelText("Select Task b"));
    const edit = screen.getAllByRole("button", { name: "Edit" })[0];
    fireEvent.click(edit);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Renamed" },
    });
    fireEvent.click(await bulk(1));
    await waitFor(() => expect(client.reviewProposal).toHaveBeenCalledTimes(1));
    expect(client.reviewProposal.mock.calls[0]).toEqual([
      "a",
      expect.objectContaining({ decision: "confirm", title: "Renamed" }),
    ]);
  });

  it("leaves a likely duplicate unchecked until someone picks it", async () => {
    await setup([
      row("a", {
        duplicate: { taskId: "t1", key: "NM-1", title: "Old", score: 0.9 },
      }),
    ]);
    expect(await bulk(0)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Select Task a"));
    expect(await bulk(1)).toBeTruthy();
  });

  it("dismisses one row with a reject", async () => {
    client.reviewProposal.mockResolvedValue({});
    await setup([row("a")]);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(client.reviewProposal).toHaveBeenCalledWith("a", {
        decision: "reject",
      }),
    );
  });

  it("is read only for a Developer", async () => {
    await setup(
      [row("a"), row("x", { quoteVerified: false, quote: null })],
      false,
    );
    expect(
      await screen.findByText("An Owner or Admin reviews these proposals."),
    ).toBeTruthy();
    expect(screen.getByText("Task a")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
