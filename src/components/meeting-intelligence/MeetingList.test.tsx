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
    expect(children.indexOf(openBtn)).toBeLessThan(
      children.indexOf(deleteBtn),
    );
  });
});
