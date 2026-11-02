// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type { CheckinItem } from "@/lib/live-ledger-types";
import { toCardEvent } from "@/lib/live-ledger-types";
import type {
  LiveLedgerActions,
  LiveLedgerRoomState,
} from "@/hooks/useLiveLedger";

const { mockFetchCheckin, mockToastError } = vi.hoisted(() => ({
  mockFetchCheckin: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock("@/lib/live-ledger-client", () => ({ fetchCheckin: mockFetchCheckin }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError } }));

import { LiveLedgerPanel } from "./LiveLedgerPanel";

const item = (over: Partial<CheckinItem>): CheckinItem => ({
  id: "i1",
  statement: "Ali sends the survey",
  quote: "main Friday tak survey bhej dunga",
  assignee: "Ali",
  dueDate: "2026-10-20",
  derivedStatus: "overdue",
  sourceMeeting: { id: "m1", title: "Kickoff", startedAt: "2026-10-01" },
  ...over,
});

const EMPTY: LiveLedgerRoomState = { card: null, agreement: null, cardSeq: 0 };

const makeActions = (): LiveLedgerActions => ({
  raise: vi.fn().mockResolvedValue(undefined),
  mark: vi.fn().mockResolvedValue(undefined),
  closeCard: vi.fn().mockResolvedValue(undefined),
  openAgreement: vi.fn().mockResolvedValue(undefined),
  closeAgreement: vi.fn().mockResolvedValue(undefined),
  vote: vi.fn().mockResolvedValue(undefined),
});

const renderPanel = (
  live: LiveLedgerRoomState = EMPTY,
  actions: LiveLedgerActions = makeActions(),
) => {
  render(
    <LiveLedgerPanel
      callId="c1"
      onClose={() => {}}
      live={live}
      actions={actions}
    />,
  );
  return actions;
};

describe("LiveLedgerPanel", () => {
  beforeEach(() => {
    mockFetchCheckin.mockResolvedValue({
      items: [
        item({}),
        item({
          id: "i2",
          statement: "Sara ships the doc",
          quote: "I will ship the doc",
          assignee: "Sara",
          dueDate: null,
          derivedStatus: "open",
        }),
      ],
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists the ranked items and words overdue as 'Still open?'", async () => {
    renderPanel();
    expect(await screen.findByText("Ali sends the survey")).toBeTruthy();
    expect(screen.getByText("Sara ships the doc")).toBeTruthy();
    expect(screen.getByText("Still open?")).toBeTruthy();
    expect(screen.queryByText(/overdue/i)).toBeNull();
    expect(mockFetchCheckin).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("narrows the list with the search box", async () => {
    renderPanel();
    await screen.findByText("Ali sends the survey");
    fireEvent.change(screen.getByLabelText("Search promises"), {
      target: { value: "sara" },
    });
    expect(screen.queryByText("Ali sends the survey")).toBeNull();
    expect(screen.getByText("Sara ships the doc")).toBeTruthy();
  });

  it("previews privately, then shows the card to everyone", async () => {
    const actions = renderPanel();
    fireEvent.click(await screen.findByText("Ali sends the survey"));
    const preview = screen.getByLabelText("Card preview");
    expect(preview.textContent).toContain("main Friday tak survey bhej dunga");
    expect(preview.textContent).toContain("From Kickoff");
    expect(actions.raise).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Show to everyone"));
    await waitFor(() =>
      expect(actions.raise).toHaveBeenCalledWith(
        expect.objectContaining({ id: "i1" }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Card preview")).toBeNull(),
    );
  });

  it("toasts and keeps the preview when the raise fails", async () => {
    const actions = makeActions();
    actions.raise = vi
      .fn()
      .mockRejectedValue(new Error("Could not reach everyone, try again"));
    renderPanel(EMPTY, actions);
    fireEvent.click(await screen.findByText("Ali sends the survey"));
    fireEvent.click(screen.getByText("Show to everyone"));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Could not reach everyone, try again",
      ),
    );
    expect(screen.getByLabelText("Card preview")).toBeTruthy();
  });

  it("marks and closes the live card", async () => {
    const live: LiveLedgerRoomState = {
      card: { card: toCardEvent(item({})), mark: "kept" },
      agreement: null,
      cardSeq: 1,
    };
    const actions = renderPanel(live);
    await screen.findByText("Ali sends the survey");
    const kept = screen.getByRole("button", { name: "Kept" });
    expect(kept.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Reversed" }));
    await waitFor(() =>
      expect(actions.mark).toHaveBeenCalledWith("i1", "reversed"),
    );
    fireEvent.click(screen.getByText("Close card"));
    await waitFor(() => expect(actions.closeCard).toHaveBeenCalledWith("i1"));
  });

  it("asks everyone with a trimmed statement and clears the box", async () => {
    const actions = renderPanel();
    const box = screen.getByLabelText(
      "Decision to agree on",
    ) as HTMLTextAreaElement;
    expect(
      (screen.getByText("Ask everyone") as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(box, { target: { value: "  We launch Friday  " } });
    fireEvent.click(screen.getByText("Ask everyone"));
    await waitFor(() =>
      expect(actions.openAgreement).toHaveBeenCalledWith("We launch Friday"),
    );
    await waitFor(() => expect(box.value).toBe(""));
  });

  it("shows the tally and closes an open agreement", async () => {
    const live: LiveLedgerRoomState = {
      card: null,
      agreement: {
        agreementId: "a1",
        statement: "We launch Friday",
        agree: 2,
        notYet: 1,
        myVote: null,
        result: null,
      },
      cardSeq: 0,
    };
    const actions = renderPanel(live);
    expect(screen.getByText("2 agree · 1 not yet")).toBeTruthy();
    fireEvent.click(screen.getByText("Close and save"));
    await waitFor(() =>
      expect(actions.closeAgreement).toHaveBeenCalledWith("a1"),
    );
  });

  it("shows the empty state when there are no open promises", async () => {
    mockFetchCheckin.mockResolvedValue({ items: [] });
    renderPanel();
    expect(
      await screen.findByText("No open promises from your earlier meetings."),
    ).toBeTruthy();
  });

  it("shows a retryable error when the load fails", async () => {
    mockFetchCheckin.mockRejectedValueOnce(new Error("Meeting not found"));
    renderPanel();
    expect(await screen.findByText("Meeting not found")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(await screen.findByText("Ali sends the survey")).toBeTruthy();
  });
});
