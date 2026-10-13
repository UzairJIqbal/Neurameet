// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import MeetingTabs from "./MeetingTabs";
import type { MeetingDetailData, MeetingInsights, ActionItem } from "@/lib/meeting-types";

// CategoryTab pulls in @/actions/meetings, which imports `server-only`. Stub it
// so the suite loads in jsdom (the Category tab is not exercised here).
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
    const cardText = (await screen.findByText("Attendance Report")) as HTMLElement;
    const card = (cardText.parentElement?.parentElement as HTMLElement) ?? cardText;
    const tokens = card.className.split(" ");
    expect(tokens).toContain("flex-col");
    expect(tokens).toContain("sm:flex-row");
  });
});
