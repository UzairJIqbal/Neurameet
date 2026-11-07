// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import MeetingTabs from "./MeetingTabs";
import type {
  MeetingDetailData,
  MeetingInsights,
  ActionItem,
} from "@/lib/meeting-types";

// CategoryTab pulls in @/actions/meetings, which imports `server-only`. Stub it
// so the suite loads in jsdom (the Category tab is not exercised here).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/actions/meetings", () => ({
  updateMeetingCategory: () => Promise.resolve({ ok: true, error: "" }),
}));

// jsdom has no layout engine, so these assert the responsive tokens are present
// (revert guards). The actual horizontal-scroll tab behavior and the Overview
// card stack at 375 are verified manually via /check verify.

const baseProps = {
  meeting: {} as unknown as MeetingDetailData,
  insights: null as MeetingInsights | null,
  actionItems: [] as ActionItem[],
  meetingId: "m1",
  attendanceCount: 0,
  isOwner: true,
  onRetry: () => {},
};

afterEach(() => {
  cleanup();
});

describe("Meeting Intelligence tabs responsive (P13.4)", () => {
  it("tab strip is a contained horizontal scroll area (overflow-x-auto), not page-level overflow", () => {
    const { container } = render(<MeetingTabs {...baseProps} />);
    const strip = container.querySelector(".overflow-x-auto");
    expect(strip).not.toBeNull();
  });

  it("Overview attendance card stacks on mobile (flex-col sm:flex-row)", async () => {
    render(<MeetingTabs {...baseProps} />);
    const cardText = (await screen.findByText(
      "Attendance Report",
    )) as HTMLElement;
    const card =
      (cardText.parentElement?.parentElement as HTMLElement) ?? cardText;
    const tokens = card.className.split(" ");
    expect(tokens).toContain("flex-col");
    expect(tokens).toContain("sm:flex-row");
  });
});

describe("Ledger tab reversal badge (spec 0001 AC-11)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubLedger = (reversalCount: number) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: [], incoming: [], reversalCount }),
      })),
    );

  it("shows the reversed count on the Ledger tab for owners", async () => {
    stubLedger(2);
    render(<MeetingTabs {...baseProps} />);
    expect(await screen.findByLabelText("2 reversed")).toBeTruthy();
  });

  it("shows no badge when nothing was reversed", async () => {
    stubLedger(0);
    render(<MeetingTabs {...baseProps} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByLabelText(/reversed/)).toBeNull();
  });
});

describe("Ledger tab is owner only (spec 0001 AC-12)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides the Ledger tab and skips the ledger fetch for a participant", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<MeetingTabs {...baseProps} isOwner={false} />);

    expect(await screen.findByText("Attendance Report")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Decisions and Promises/ }),
    ).toBeNull();
    expect(screen.queryByText("Decisions and Promises")).toBeNull();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes("/api/ledger")),
    ).toBe(false);
  });

  it("shows the Ledger tab for the owner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: [], incoming: [], reversalCount: 0 }),
      })),
    );
    render(<MeetingTabs {...baseProps} />);
    expect(await screen.findByText("Decisions and Promises")).toBeTruthy();
  });

  // Spec 0004 AC-58b: on a project meeting every member reads the tab.
  it("shows the Ledger tab to a non creator on a project meeting", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [], incoming: [], reversalCount: 0 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MeetingTabs
        {...baseProps}
        isOwner={false}
        projectId="p1"
        canManage={false}
      />,
    );
    expect(await screen.findByText("Decisions and Promises")).toBeTruthy();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((args: unknown[]) =>
          String(args[0]).includes("/api/ledger"),
        ),
      ).toBe(true),
    );
    expect(screen.queryByText("Recording")).toBeNull();
  });

  it("shows the Minutes tab to a participant but not Ledger or Recording (spec 0003)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<MeetingTabs {...baseProps} isOwner={false} />);
    expect(await screen.findByRole("button", { name: "Minutes" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Decisions and Promises/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Recording" })).toBeNull();
  });
});

describe("Meeting Details tabs (spec 0004 AC-70v, AC-70w)", () => {
  const stubFetch = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(url).includes("/proposals")
            ? { proposals: [], canReview: true }
            : String(url).includes("/members")
              ? { members: [], myRole: "owner", me: "u1" }
              : { items: [], incoming: [], reversalCount: 0 },
      })),
    );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const tabLabels = () =>
    screen
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t) =>
        [
          "Overview",
          "AI Summary",
          "Transcript",
          "Decisions and Promises",
          "Action Items",
          "Recording",
          "Category",
          "Minutes",
          "Engagement",
          "AI Chat",
        ].includes(t ?? ""),
      );

  it("keeps every shipped tab, in the new order", () => {
    stubFetch();
    render(<MeetingTabs {...baseProps} />);
    expect(tabLabels()).toEqual([
      "Overview",
      "AI Summary",
      "Transcript",
      "Decisions and Promises",
      "Action Items",
      "Recording",
      "Category",
      "Minutes",
      "Engagement",
      "AI Chat",
    ]);
  });

  it("hides the Transcript tab from a Viewer", () => {
    stubFetch();
    render(
      <MeetingTabs
        {...baseProps}
        isOwner={false}
        projectId="p1"
        role="viewer"
      />,
    );
    expect(screen.queryByRole("button", { name: "Transcript" })).toBeNull();
  });

  it("shows the transcript text on its tab", async () => {
    stubFetch();
    render(<MeetingTabs {...baseProps} transcriptText="Ali: hello" />);
    fireEvent.click(screen.getByRole("button", { name: "Transcript" }));
    expect(await screen.findByText("Ali: hello")).toBeTruthy();
  });

  const items: ActionItem[] = [
    {
      id: "a",
      title: "Listed confirmed",
      assignee: null,
      dueDate: null,
      reviewState: "confirmed",
    },
    {
      id: "b",
      title: "Waiting proposed",
      assignee: null,
      dueDate: null,
      reviewState: "proposed",
    },
    {
      id: "c",
      title: "Dropped rejected",
      assignee: null,
      dueDate: null,
      reviewState: "rejected",
    },
  ];

  it("keeps proposed and rejected rows out of a project meeting's list", async () => {
    stubFetch();
    render(
      <MeetingTabs
        {...baseProps}
        actionItems={items}
        projectId="p1"
        role="owner"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Action Items" }));
    expect(await screen.findByText("Listed confirmed")).toBeTruthy();
    expect(screen.queryByText("Waiting proposed")).toBeNull();
    expect(screen.queryByText("Dropped rejected")).toBeNull();
  });

  it("never asks a Viewer for proposals", async () => {
    stubFetch();
    render(
      <MeetingTabs
        {...baseProps}
        isOwner={false}
        projectId="p1"
        role="viewer"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Action Items" }));
    await screen.findByText("No action items yet.");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([u]) => String(u).includes("/proposals")),
    ).toBe(false);
  });
});
