// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import ActivityTab from "./ActivityTab";
import type { ProjectDetail } from "@/lib/project-types";
import type { ActivityRow } from "@/lib/proof-types";

const { mockList, mockMembers } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockMembers: vi.fn(),
}));
vi.mock("@/lib/project-client", () => ({
  listActivity: mockList,
  listMembers: mockMembers,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/loader", () => ({
  LoaderOne: () => <div>loading</div>,
}));

const project = { id: "p1", name: "App" } as ProjectDetail;

const row = (id: string, memberName: string): ActivityRow => ({
  id,
  kind: "member.joined",
  occurredAt: "2026-11-01T00:00:00Z",
  actorName: null,
  subjectType: "member",
  subjectId: id,
  memberName,
});

let intersect: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  intersect = null;
  mockMembers.mockResolvedValue({ members: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActivityTab", () => {
  it("tells you what to expect on an empty project", async () => {
    mockList.mockResolvedValueOnce({ rows: [], nextBefore: null });
    render(<ActivityTab project={project} />);
    expect(
      await screen.findByText(
        /Task, meeting, and GitHub events will show up here/,
      ),
    ).toBeTruthy();
  });

  it("shows LoadError with a retry when the first load fails", async () => {
    mockList.mockRejectedValueOnce(new Error("nope"));
    render(<ActivityTab project={project} />);
    expect(
      await screen.findByText("We couldn't load the activity."),
    ).toBeTruthy();
  });

  it("loads more on scroll, and offers Load more after a failed page", async () => {
    mockList.mockResolvedValueOnce({
      rows: [row("a", "Sara")],
      nextBefore: "c1",
    });
    render(<ActivityTab project={project} />);
    expect(await screen.findByText("Sara joined")).toBeTruthy();

    mockList.mockRejectedValueOnce(new Error("nope"));
    await act(async () => intersect?.());
    const retry = await screen.findByRole("button", { name: /Load more/ });
    expect(mockList.mock.calls[1][1]).toBe("c1");

    mockList.mockResolvedValueOnce({
      rows: [row("b", "Ali")],
      nextBefore: null,
    });
    fireEvent.click(retry);
    expect(await screen.findByText("Ali joined")).toBeTruthy();
    expect(screen.getByText("Sara joined")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull(),
    );
  });
});

describe("ActivityTab filters (AC-70m)", () => {
  const counts = { all: 22, github: 9, tasks: 8, meetings: 3, members: 2 };
  const first = (rows: ActivityRow[], nextBefore: string | null = null) => ({
    rows,
    nextBefore,
    categoryCounts: counts,
  });

  it("shows counts on the chips and asks the server for a category", async () => {
    mockList.mockResolvedValue(first([row("a", "Sara")]));
    render(<ActivityTab project={project} />);
    fireEvent.click(await screen.findByRole("button", { name: "GitHub 9" }));
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(
        "p1",
        null,
        expect.any(AbortSignal),
        { category: "github", actorId: "" },
      ),
    );
    expect(
      screen
        .getByRole("button", { name: "GitHub 9" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("asks the server for one person", async () => {
    mockMembers.mockResolvedValue({
      members: [{ userId: "user_1", name: "Sara", imageUrl: null }],
    });
    mockList.mockResolvedValue(first([row("a", "Sara")]));
    render(<ActivityTab project={project} />);
    await screen.findByRole("option", { name: "Sara" });
    fireEvent.change(screen.getByLabelText("Filter by person"), {
      target: { value: "user_1" },
    });
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(
        "p1",
        null,
        expect.any(AbortSignal),
        { category: "", actorId: "user_1" },
      ),
    );
  });

  it("keeps the filters when a filter finds nothing", async () => {
    mockList.mockResolvedValueOnce(first([row("a", "Sara")]));
    mockList.mockResolvedValueOnce(first([]));
    render(<ActivityTab project={project} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tasks 8" }));
    expect(
      await screen.findByText("Nothing matches these filters."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Filter by person")).toBeTruthy();
  });

  it("searches loaded rows only, says so, and never calls the server", async () => {
    mockList.mockResolvedValue(
      first([row("a", "Sara"), row("b", "Omar")], "c1"),
    );
    render(<ActivityTab project={project} />);
    await screen.findByText(/Sara joined/);
    const calls = mockList.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Search activity"), {
      target: { value: "omar" },
    });
    expect(screen.getByText(/rows loaded so far/)).toBeTruthy();
    expect(screen.queryByText(/Sara joined/)).toBeNull();
    expect(screen.getByText(/Omar joined/)).toBeTruthy();
    expect(mockList.mock.calls.length).toBe(calls);
    // Paging stays in your hands while you search.
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
  });

  it("groups rows by day", async () => {
    mockList.mockResolvedValue(
      first([
        { ...row("a", "Sara"), occurredAt: "2026-11-05T12:00:00" },
        { ...row("b", "Omar"), occurredAt: "2026-11-05T09:00:00" },
        { ...row("c", "Ali"), occurredAt: "2026-11-02T12:00:00" },
      ]),
    );
    render(<ActivityTab project={project} />);
    await screen.findByText(/Sara joined/);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });
});
