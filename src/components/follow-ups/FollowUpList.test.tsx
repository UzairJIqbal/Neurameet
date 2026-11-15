// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import FollowUpList, { groupByMeeting, isOverdue } from "./FollowUpList";
import type { FollowUpItem } from "@/lib/meeting-types";

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/actions/follow-ups", () => ({ updateFollowUpStatus: mockUpdate }));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const item = (over: Partial<FollowUpItem>): FollowUpItem => ({
  id: "f1",
  meetingId: "m1",
  actionItemId: "a1",
  status: "pending",
  priority: "medium",
  notes: null,
  updatedAt: "2026-11-10T10:00:00.000Z",
  meetingTitle: "Weekly Sync",
  meetingStartedAt: "2026-11-10T09:00:00.000Z",
  actionTitle: "Send the recap",
  assignee: null,
  dueDate: null,
  ...over,
});

let followUps: FollowUpItem[] = [];

beforeEach(() => {
  mockUpdate.mockResolvedValue({ ok: true });
  followUps = [
    item({ id: "f1", actionTitle: "Send the recap" }),
    item({ id: "f2", actionTitle: "Book the room", status: "completed" }),
    item({
      id: "f3",
      meetingId: "m2",
      meetingTitle: "Planning",
      meetingStartedAt: "2026-11-12T09:00:00.000Z",
      actionTitle: "Draft the plan",
      assignee: "Sara",
    }),
  ];
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ followUps }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("groupByMeeting", () => {
  it("groups newest meeting first and counts progress over every item", () => {
    const groups = groupByMeeting(followUps, "open");
    expect(groups.map((g) => g.meetingId)).toEqual(["m2", "m1"]);
    const sync = groups[1];
    expect(sync.items.map((i) => i.id)).toEqual(["f1"]);
    expect(sync).toMatchObject({ doneCount: 1, totalCount: 2 });
  });

  it("drops a meeting with nothing matching the filter", () => {
    expect(
      groupByMeeting(followUps, "completed").map((g) => g.meetingId),
    ).toEqual(["m1"]);
  });
});

describe("isOverdue", () => {
  const now = new Date(2026, 10, 15, 12);
  it("flags a past due date on an open item", () => {
    expect(isOverdue(item({ dueDate: "2026-11-14" }), now)).toBe(true);
  });
  it("does not flag today, a done item, or no date", () => {
    expect(isOverdue(item({ dueDate: "2026-11-15" }), now)).toBe(false);
    expect(
      isOverdue(item({ dueDate: "2026-11-01", status: "completed" }), now),
    ).toBe(false);
    expect(isOverdue(item({}), now)).toBe(false);
  });
});

describe("Follow-ups page", () => {
  it("shows one card per meeting with a link to the meeting and progress", async () => {
    render(<FollowUpList />);
    const link = await screen.findByRole("link", { name: "Weekly Sync" });
    expect(link.getAttribute("href")).toBe("/meeting-intelligence/m1");
    expect(
      screen.getByRole("link", { name: "Planning" }).getAttribute("href"),
    ).toBe("/meeting-intelligence/m2");
    expect(screen.getByText("1 of 2 done")).toBeTruthy();
    expect(screen.getByText("0 of 1 done")).toBeTruthy();
  });

  it("opens on Open and switches to Completed and All", async () => {
    render(<FollowUpList />);
    expect(await screen.findByRole("tab", { name: "Open (2)" })).toBeTruthy();
    expect(screen.queryByText("Book the room")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Completed (1)" }));
    expect(screen.getByText("Book the room")).toBeTruthy();
    expect(screen.queryByText("Send the recap")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "All (3)" }));
    expect(screen.getByText("Send the recap")).toBeTruthy();
    expect(screen.getByText("Book the room")).toBeTruthy();
  });

  it("ticking an item saves it as completed and updates the counts", async () => {
    render(<FollowUpList />);
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: /Mark done: Send the recap/,
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith("f1", "completed");
    // The meeting has nothing open left, so it leaves the Open view.
    await waitFor(() =>
      expect(screen.queryByText("Send the recap")).toBeNull(),
    );
    expect(screen.getByRole("tab", { name: "Open (1)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Completed (2)" }));
    expect(screen.getByText("2 of 2 done")).toBeTruthy();
  });

  it("puts the item back when the save fails", async () => {
    mockUpdate.mockResolvedValue({ ok: false, error: "Update failed" });
    render(<FollowUpList />);
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: /Mark done: Send the recap/,
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("Send the recap")).toBeTruthy(),
    );
    expect(screen.getByText("1 of 2 done")).toBeTruthy();
  });

  it("marks an overdue open item", async () => {
    followUps = [item({ dueDate: "2020-01-01" })];
    render(<FollowUpList />);
    const card = (
      await screen.findByRole("link", { name: "Weekly Sync" })
    ).closest("article")!;
    expect(within(card as HTMLElement).getByText("Overdue")).toBeTruthy();
  });

  it("explains where follow-ups come from when there are none", async () => {
    followUps = [];
    render(<FollowUpList />);
    expect(await screen.findByText("No follow-ups yet.")).toBeTruthy();
    expect(
      screen.getByText(/appear after a meeting's summary is created/),
    ).toBeTruthy();
  });
});
