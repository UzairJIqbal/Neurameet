// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type { LiveAgreementState } from "@/lib/live-ledger-types";

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError } }));

import { AgreementPrompt } from "./AgreementPrompt";

const open: LiveAgreementState = {
  agreementId: "a1",
  statement: "We launch Friday",
  agree: 1,
  notYet: 0,
  myVote: null,
  result: null,
};

describe("AgreementPrompt", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing without an agreement", () => {
    render(<AgreementPrompt agreement={null} onVote={vi.fn()} />);
    expect(screen.queryByTestId("agreement-prompt")).toBeNull();
  });

  it("votes and marks the chosen button", async () => {
    const onVote = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <AgreementPrompt agreement={open} onVote={onVote} />,
    );
    expect(screen.getByText("1 agree · 0 not yet")).toBeTruthy();
    fireEvent.click(screen.getByText("Not yet"));
    await waitFor(() => expect(onVote).toHaveBeenCalledWith("a1", "not_yet"));
    rerender(
      <AgreementPrompt
        agreement={{ ...open, myVote: "not_yet", notYet: 1 }}
        onVote={onVote}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Not yet" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("toasts when the vote fails", async () => {
    const onVote = vi.fn().mockRejectedValue(new Error("Agreement is closed"));
    render(<AgreementPrompt agreement={open} onVote={onVote} />);
    fireEvent.click(screen.getByText("Agree"));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Agreement is closed"),
    );
  });

  it("shows 'Agreed by N of M' once closed, and can be hidden", () => {
    render(
      <AgreementPrompt
        agreement={{ ...open, result: { agreed: 2, total: 3 } }}
        onVote={vi.fn()}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Agreed by 2 of 3");
    expect(screen.queryByText("Agree")).toBeNull();
    fireEvent.click(screen.getByLabelText("Hide the agreement result"));
    expect(screen.queryByTestId("agreement-prompt")).toBeNull();
  });
});
