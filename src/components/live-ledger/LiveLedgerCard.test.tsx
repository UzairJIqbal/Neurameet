// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  toCardEvent,
  type CheckinItem,
  type LiveCardState,
} from "@/lib/live-ledger-types";
import { LiveLedgerCard } from "./LiveLedgerCard";

const item: CheckinItem = {
  id: "i1",
  statement: "Ali sends the survey",
  quote: "main Friday tak survey bhej dunga",
  assignee: "Ali",
  dueDate: "2026-10-20",
  derivedStatus: "overdue",
  sourceMeeting: { id: "m1", title: "Kickoff", startedAt: "2026-10-01" },
};
const live: LiveCardState = { card: toCardEvent(item), mark: null };

describe("LiveLedgerCard", () => {
  afterEach(cleanup);

  it("renders nothing without a card", () => {
    render(<LiveLedgerCard live={null} cardSeq={0} />);
    expect(screen.queryByTestId("live-ledger-card")).toBeNull();
  });

  it("shows the quote and the live mark", () => {
    render(<LiveLedgerCard live={{ ...live, mark: "kept" }} cardSeq={1} />);
    const card = screen.getByLabelText("Promise check-in");
    expect(card.textContent).toContain("main Friday tak survey bhej dunga");
    expect(card.textContent).toContain("Still open?");
    expect(screen.getByRole("status").textContent).toBe("Marked kept");
  });

  it("dismisses locally until the next raise", () => {
    const { rerender } = render(<LiveLedgerCard live={live} cardSeq={1} />);
    fireEvent.click(screen.getByLabelText("Hide this card on my screen"));
    expect(screen.queryByTestId("live-ledger-card")).toBeNull();
    rerender(<LiveLedgerCard live={{ ...live, mark: "open" }} cardSeq={1} />);
    expect(screen.queryByTestId("live-ledger-card")).toBeNull();
    rerender(<LiveLedgerCard live={live} cardSeq={2} />);
    expect(screen.getByTestId("live-ledger-card")).toBeTruthy();
  });
});
