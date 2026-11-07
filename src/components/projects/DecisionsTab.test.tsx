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

const { mockLedger } = vi.hoisted(() => ({ mockLedger: vi.fn() }));
vi.mock("@/lib/project-client", () => ({ getProjectLedger: mockLedger }));
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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(cleanup);

describe("DecisionsTab", () => {
  it("tells you what to do when the project has no items", async () => {
    mockLedger.mockResolvedValue(empty);
    render(<DecisionsTab project={project} />);
    expect(
      await screen.findByText(/No decisions or promises yet/),
    ).toBeTruthy();
  });

  it("refetches from the first page when a filter changes", async () => {
    mockLedger.mockResolvedValue(empty);
    render(<DecisionsTab project={project} />);
    await screen.findByText(/No decisions or promises yet/);
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "overdue" },
    });
    await waitFor(() =>
      expect(mockLedger).toHaveBeenLastCalledWith(
        "p1",
        { kind: "", status: "overdue" },
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
    await screen.findByText(/No decisions or promises yet/);
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
