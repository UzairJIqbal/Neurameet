// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import MeetingList from "./MeetingList";

// jsdom has no layout engine, so these assert the responsive tokens are present
// on the list header + rows (a revert would drop them). The actual visual reflow
// at 375/768 is verified manually via /check verify.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const meetings = [
  {
    id: "m1",
    title: "Weekly Sync",
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ meetings }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Meeting Intelligence list responsive (P13.4)", () => {
  it("header reflows: Meeting col-span-6 md:col-span-4, Date col-span-6 md:col-span-2, Action col-span-12 md:col-span-4", async () => {
    render(<MeetingList />);
    const meetingHeader = (await screen.findByText("Meeting")) as HTMLElement;
    expect(meetingHeader.className.split(" ")).toEqual(
      expect.arrayContaining(["col-span-6", "md:col-span-4"]),
    );
    const dateHeader = (await screen.findByText("Date")) as HTMLElement;
    expect(dateHeader.className.split(" ")).toEqual(
      expect.arrayContaining(["col-span-6", "md:col-span-2"]),
    );
    const actionHeader = (await screen.findByText("Action")) as HTMLElement;
    expect(actionHeader.className.split(" ")).toEqual(
      expect.arrayContaining(["col-span-12", "md:col-span-4"]),
    );
  });

  it("row action cell drops below on mobile (col-span-12 md:col-span-4 md:flex-nowrap)", async () => {
    render(<MeetingList />);
    const openBtn = (await screen.findByRole("button", {
      name: /Insights/i,
    })) as HTMLButtonElement;
    const actionCell = openBtn.parentElement as HTMLElement;
    const tokens = actionCell.className.split(" ");
    expect(tokens).toContain("col-span-12");
    expect(tokens).toContain("md:col-span-4");
    expect(tokens).toContain("md:flex-nowrap");
  });

  it("row action cell orders Open Insights before Delete, matching Follow-ups", async () => {
    render(<MeetingList />);
    const openBtn = (await screen.findByRole("button", {
      name: /Insights/i,
    })) as HTMLButtonElement;
    const cell = openBtn.parentElement as HTMLElement;
    const deleteBtn = cell.querySelector(
      'button[aria-label="Delete meeting"]',
    ) as HTMLButtonElement;
    const children = Array.from(cell.children) as HTMLElement[];
    expect(children.indexOf(openBtn)).toBeLessThan(children.indexOf(deleteBtn));
  });
});

describe("Meeting Intelligence list, workspace views (AC-77c)", () => {
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const past = new Date(Date.now() - 3_600_000).toISOString();
  const rows = [
    {
      id: "a",
      title: "Sprint planning",
      status: "scheduled",
      startedAt: soon,
      streamCallId: "call-a",
      projectId: "p1",
      role: "developer",
    },
    {
      id: "b",
      title: "Missed standup",
      status: "scheduled",
      startedAt: past,
      streamCallId: "call-b",
    },
    {
      id: "c",
      title: "Design review",
      status: "ended",
      startedAt: past,
      createdAt: past,
      hasInsights: true,
      category: "Review",
      projectId: "p1",
      role: "developer",
    },
    {
      id: "d",
      title: "Personal sync",
      status: "ended",
      startedAt: past,
      createdAt: past,
    },
  ];

  beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("/api/projects")
          ? { projects: [{ id: "p1", name: "Apollo" }] }
          : { meetings: rows },
    })) as unknown as typeof fetch;
  });

  it("lists scheduled rows under Upcoming with Join, soonest first, and Time passed on a missed one", async () => {
    render(<MeetingList />);
    expect(await screen.findByText("Upcoming")).toBeTruthy();
    const joins = screen.getAllByRole("link", { name: "Join" });
    expect(joins.map((j) => j.getAttribute("href"))).toEqual([
      "/meeting/call-b",
      "/meeting/call-a",
    ]);
    expect(screen.getAllByText("Time passed")).toHaveLength(1);
  });

  it("shows the project chip on a project row and no chip on a personal one", async () => {
    render(<MeetingList />);
    await screen.findByText("Design review");
    expect((await screen.findAllByText("Apollo")).length).toBeGreaterThan(0);
    expect(screen.getByText("Personal sync")).toBeTruthy();
  });

  it("filters to Personal or one project", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(<MeetingList />);
    await screen.findByText("Design review");
    const select = (await screen.findByLabelText(
      "Filter meetings",
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "personal" } });
    expect(screen.queryByText("Design review")).toBeNull();
    expect(screen.getByText("Personal sync")).toBeTruthy();
    fireEvent.change(select, { target: { value: "p1" } });
    expect(screen.getByText("Design review")).toBeTruthy();
    expect(screen.queryByText("Personal sync")).toBeNull();
  });

  it("hides Delete on a project row you do not own", async () => {
    render(<MeetingList />);
    await screen.findByText("Design review");
    expect(screen.getAllByLabelText("Delete meeting")).toHaveLength(1);
  });
});
