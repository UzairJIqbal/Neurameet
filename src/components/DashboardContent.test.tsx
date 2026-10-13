// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DashboardContent from "./DashboardContent";

// jsdom has no layout engine, so these assert the responsive tokens are present
// on the dashboard inline rows and the mobile search bar (a revert would drop
// them). The actual visual reflow at 375/768 is verified manually via /check verify.

const meetings = [
  {
    id: "m1",
    title: "Weekly Sync",
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];
const followUps = [
  {
    id: "f1",
    actionTitle: "Send the recap",
    meetingTitle: "Weekly Sync",
    dueDate: new Date().toISOString(),
    status: "pending",
  },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { firstName: "Test" } }),
}));
// MeetingModel / UploadTranscriptModal are only mounted when a modal opens; their
// modules pull in Stream + server-only code, so stub them so the suite loads in jsdom.
vi.mock("./MeetingModel", () => ({ default: () => null }));
vi.mock("./UploadTranscriptModal", () => ({ default: () => null }));

beforeEach(() => {
  global.fetch = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes("follow-ups")
        ? { followUps }
        : { meetings },
  })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
});

describe("Dashboard inline rows responsive (P13.3)", () => {
  it("renders a mobile-only search bar bound to the query state", async () => {
    render(<DashboardContent />);
    // The header search shares this aria-label; the mobile one lives inside the
    // sm:hidden wrapper div (the input itself carries w-full, not sm:hidden).
    const inputs = screen.getAllByLabelText(
      "Search meetings and follow-ups",
    ) as HTMLInputElement[];
    const mobile = inputs.find(
      (i) => (i.parentElement?.className ?? "").includes("sm:hidden"),
    );
    expect(mobile).toBeTruthy();
    const tokens = (mobile as HTMLInputElement).className.split(" ");
    expect(tokens).toContain("w-full");
  });

  it("hides the list header Action column on mobile (shown at md+)", async () => {
    render(<DashboardContent />);
    // The Action header column is static markup, so it is present on mount.
    const actionHeaders = (await screen.findAllByText("Action")) as HTMLElement[];
    const actionHeader = actionHeaders[0];
    const tokens = actionHeader.className.split(" ");
    expect(tokens).toContain("hidden");
    expect(tokens).toContain("md:block");
  });

  it("Meeting Intelligence row reflows: title md:col-span-5, date md:col-span-3, action wraps below", async () => {
    render(<DashboardContent />);
    const openBtn = (await screen.findByRole("button", {
      name: /Open Insights/i,
    })) as HTMLButtonElement;
    const actionCell = openBtn.parentElement as HTMLElement;
    const row = actionCell.parentElement as HTMLElement;
    const titleCell = row.children[0] as HTMLElement;
    const dateCell = row.children[1] as HTMLElement;

    expect(titleCell.className.split(" ")).toContain("md:col-span-5");
    expect(dateCell.className.split(" ")).toContain("md:col-span-3");
    const actionTokens = actionCell.className.split(" ");
    expect(actionTokens).toContain("col-span-12");
    expect(actionTokens).toContain("flex");
    expect(actionTokens).toContain("flex-wrap");
  });

  it("Follow-ups row reflows the same way", async () => {
    render(<DashboardContent />);
    const openBtn = (await screen.findByRole("button", {
      name: /^Open$/i,
    })) as HTMLButtonElement;
    const actionCell = openBtn.parentElement as HTMLElement;
    const row = actionCell.parentElement as HTMLElement;
    const titleCell = row.children[0] as HTMLElement;

    expect(titleCell.className.split(" ")).toContain("md:col-span-5");
    const actionTokens = actionCell.className.split(" ");
    expect(actionTokens).toContain("col-span-12");
    expect(actionTokens).toContain("flex");
    expect(actionTokens).toContain("flex-wrap");
  });
});
