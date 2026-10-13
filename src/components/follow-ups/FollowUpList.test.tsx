// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import FollowUpList from "./FollowUpList";

// jsdom has no layout engine, so these assert the responsive tokens are present
// on the list header and rows (a revert would drop them). The actual visual reflow
// at 375/768 is verified manually via /check verify.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const followUps = [
  {
    id: "f1",
    actionTitle: "Send the recap",
    meetingTitle: "Weekly Sync",
    status: "pending",
    dueDate: new Date().toISOString(),
  },
];

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ followUps }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Follow-ups list responsive (P13.5)", () => {
  it("header reflows: Action item col-span-6 md:col-span-5, Meeting col-span-6 md:col-span-3, Open col-span-12 hidden md:col-span-4 md:block", async () => {
    render(<FollowUpList />);
    const actionItemHeader = (await screen.findByText("Action item")) as HTMLElement;
    expect(actionItemHeader.className.split(" ")).toEqual(
      expect.arrayContaining(["col-span-6", "md:col-span-5"]),
    );
    const meetingHeader = (await screen.findByText("Meeting")) as HTMLElement;
    expect(meetingHeader.className.split(" ")).toEqual(
      expect.arrayContaining(["col-span-6", "md:col-span-3"]),
    );
    // "Open" appears in both the header (a div) and the row link; the header is
    // first in DOM order, so it is element [0].
    const openHeaders = (await screen.findAllByText("Open")) as HTMLElement[];
    const openHeader = openHeaders[0];
    expect(openHeader.className.split(" ")).toEqual(
      expect.arrayContaining([
        "col-span-12",
        "hidden",
        "md:col-span-4",
        "md:block",
      ]),
    );
  });

  it("row action cell drops below on mobile (col-span-12 md:col-span-4 md:flex-nowrap)", async () => {
    render(<FollowUpList />);
    const openLink = (await screen.findByRole("link", {
      name: /Open/i,
    })) as HTMLAnchorElement;
    const actionCell = openLink.closest("div") as HTMLElement;
    const tokens = actionCell.className.split(" ");
    expect(tokens).toContain("col-span-12");
    expect(tokens).toContain("md:col-span-4");
    expect(tokens).toContain("md:flex-nowrap");
  });
});
