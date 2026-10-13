// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import SearchPage from "./SearchPage";

// jsdom has no layout engine, so these assert the responsive class tokens are
// present (a revert would drop them). Visual reflow at 375/768 is verified
// manually via /check verify. P13.8 is a light verification pass: the search
// bar was the one genuine small-screen defect (the input kept its intrinsic
// min width inside a single-row flex form and could overflow on the smallest
// phones); the fix is min-w-0 on the input, guarded below.

const result = {
  id: "chunk_test",
  meetingId: "meeting_test",
  meetingTitle: "A very long meeting title that should wrap on small screens",
  chunkText: "some matching text",
  similarity: 0.91,
};

vi.mock("@/agent/rag", () => ({ CrossMeetingHit: {} }));

describe("Search page responsive (P13.8)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: [result] }),
      })),
    );
  });

  it("search bar is a single flex row whose input can shrink (min-w-0)", () => {
    const { container } = render(<SearchPage />);
    const form = container.querySelector("form") as HTMLElement;
    const tokens = form.className.split(" ");
    expect(tokens).toContain("flex");
    expect(tokens).toContain("items-center");
    expect(tokens).toContain("gap-2");

    const input = screen.getByLabelText(/search across your meetings/i);
    expect(input.className.split(" ")).toContain("min-w-0");
  });

  it("placeholder is short enough to fit the narrow input on phones", () => {
    render(<SearchPage />);
    const input = screen.getByLabelText(
      /search across your meetings/i,
    ) as HTMLInputElement;
    // A text input clips its placeholder instead of wrapping, so the visible
    // placeholder must stay short; a revert to the long phrase would clip it on
    // small screens.
    expect(input.placeholder).toBe("Search meetings…");
  });

  it("result group header wraps and the meeting title breaks words", async () => {
    const { container } = render(<SearchPage />);
    const input = screen.getByLabelText(/search across your meetings/i);
    fireEvent.change(input, { target: { value: "topic" } });
    fireEvent.submit(container.querySelector("form") as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText(/A very long meeting title/i)).toBeTruthy();
    });

    const title = screen.getByText(/A very long meeting title/i) as HTMLElement;
    expect(title.className.split(" ")).toContain("break-words");

    const header = title.closest("div") as HTMLElement;
    const headerTokens = header.className.split(" ");
    expect(headerTokens).toContain("flex");
    expect(headerTokens).toContain("flex-wrap");
    expect(headerTokens).toContain("justify-between");
  });
});
