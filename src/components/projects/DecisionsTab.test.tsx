// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import DecisionsTab from "./DecisionsTab";
import type { ProjectDetail } from "@/lib/project-types";

const { mockLedger, mockMeetings } = vi.hoisted(() => ({
  mockLedger: vi.fn(),
  mockMeetings: vi.fn(),
}));
vi.mock("@/lib/project-client", () => ({
  getProjectLedger: mockLedger,
  listProjectMeetings: mockMeetings,
}));
vi.mock("@/components/ui/loader", () => ({
  LoaderOne: () => <div>loading</div>,
}));
vi.mock("./TaskDrawer", () => ({ default: () => null }));

const project = { id: "p1", name: "App" } as ProjectDetail;

const empty = {
  items: [],
  nextCursor: null,
  canReview: false,
  needsReview: [],
  reviewCount: 0,
};

const reviewRow = {
  id: "l1",
  evidenceKind: "meeting",
  relation: "kept",
  confidence: 0.9,
  quote: "I sent it",
  speaker: "Ali",
  lineNumber: 9,
  evidenceMeetingId: "m2",
  item: { id: "i1", statement: "Ali sends the survey" },
  meeting: { id: "m1", title: "Standup" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMeetings.mockResolvedValue({ meetings: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(cleanup);

describe("DecisionsTab", () => {
  it("tells you what to do when the project has no items", async () => {
    mockLedger.mockResolvedValue(empty);
    render(<DecisionsTab project={project} />);
    expect(
      await screen.findByText(/Decisions and promises show up here/),
    ).toBeTruthy();
  });

  it("refetches from the first page when a filter changes", async () => {
    mockLedger.mockResolvedValue(empty);
    render(<DecisionsTab project={project} />);
    await screen.findByText(/Decisions and promises show up here/);
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "overdue" },
    });
    await waitFor(() =>
      expect(mockLedger).toHaveBeenLastCalledWith(
        "p1",
        expect.objectContaining({ kind: "", status: "overdue" }),
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByText(/Nothing matches these filters/),
    ).toBeTruthy();
    const firstSignal = mockLedger.mock.calls[0][2] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
  });

  it("hides the review group when you can't review", async () => {
    mockLedger.mockResolvedValue(empty);
    render(<DecisionsTab project={project} />);
    await screen.findByText(/Decisions and promises show up here/);
    expect(screen.queryByText("Needs your review")).toBeNull();
  });

  it("shows the capped group with the exact total", async () => {
    mockLedger.mockResolvedValue({
      ...empty,
      canReview: true,
      needsReview: [reviewRow],
      reviewCount: 72,
    });
    render(<DecisionsTab project={project} />);
    expect(await screen.findByText("Needs your review")).toBeTruthy();
    expect(
      screen.getByText("Showing 50 of 72, review these to see the rest"),
    ).toBeTruthy();
  });
});

describe("DecisionsTab filters (AC-70l)", () => {
  const item = {
    id: "i1",
    kind: "decision",
    statement: "Use Postgres",
    assignee: null,
    dueDate: null,
    derivedStatus: "open",
    links: [],
    outcome: {
      said: { state: "typed" },
      task: { state: "decision" },
      shipped: { state: "not_applicable" },
      kept: { state: "no_promise" },
    },
    tag: "Engineering",
    participants: [
      { name: "Sara Khan", imageUrl: null },
      { name: "Omar Ali", imageUrl: null },
    ],
    meeting: { id: "m1", title: "Standup", startedAt: "2026-11-01T00:00:00Z" },
  };
  const withItem = { ...empty, items: [item] };

  it("sends a search after a pause, and only one request", async () => {
    mockLedger.mockResolvedValue(empty);
    render(<DecisionsTab project={project} />);
    await screen.findByText(/Decisions and promises show up here/);
    const before = mockLedger.mock.calls.length;
    const box = screen.getByLabelText("Search decisions");
    fireEvent.change(box, { target: { value: "po" } });
    fireEvent.change(box, { target: { value: "postgres" } });
    await waitFor(() =>
      expect(mockLedger).toHaveBeenLastCalledWith(
        "p1",
        expect.objectContaining({ q: "postgres" }),
        expect.any(AbortSignal),
      ),
    );
    expect(mockLedger.mock.calls.length).toBe(before + 1);
  });

  it("filters by tag chip", async () => {
    mockLedger.mockResolvedValue(empty);
    render(<DecisionsTab project={project} />);
    fireEvent.click(await screen.findByRole("button", { name: "Design" }));
    await waitFor(() =>
      expect(mockLedger).toHaveBeenLastCalledWith(
        "p1",
        expect.objectContaining({ tag: "Design" }),
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByText(/Nothing matches these filters/),
    ).toBeTruthy();
  });

  it("filters by meeting", async () => {
    mockMeetings.mockResolvedValue({
      meetings: [{ id: "m9", title: "Retro" }],
    });
    mockLedger.mockResolvedValue(empty);
    render(<DecisionsTab project={project} />);
    await screen.findByRole("option", { name: "Retro" });
    fireEvent.change(screen.getByLabelText("Filter by meeting"), {
      target: { value: "m9" },
    });
    await waitFor(() =>
      expect(mockLedger).toHaveBeenLastCalledWith(
        "p1",
        expect.objectContaining({ meetingId: "m9" }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("still works when the meeting list fails", async () => {
    mockMeetings.mockRejectedValue(new Error("nope"));
    mockLedger.mockResolvedValue(withItem);
    render(<DecisionsTab project={project} />);
    expect(await screen.findByText("Use Postgres")).toBeTruthy();
    expect(screen.getByRole("option", { name: "All meetings" })).toBeTruthy();
  });

  it("shows the tag, a link to the source meeting, and the people", async () => {
    mockLedger.mockResolvedValue(withItem);
    render(<DecisionsTab project={project} />);
    await screen.findByText("Use Postgres");
    expect(
      screen.getByRole("link", { name: /Standup/ }).getAttribute("href"),
    ).toBe("/meeting-intelligence/m1");
    expect(screen.getAllByText("Engineering").length).toBeGreaterThan(1);
    expect(screen.getByTitle("Sara Khan")).toBeTruthy();
    expect(screen.getByTitle("Omar Ali")).toBeTruthy();
  });
});
