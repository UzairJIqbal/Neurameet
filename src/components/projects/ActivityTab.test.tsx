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

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));
vi.mock("@/lib/project-client", () => ({ listActivity: mockList }));
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
      await screen.findByText(/Nothing has happened here yet/),
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
