// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import PrepPage from "./PrepPage";

// jsdom has no layout engine, so these assert the responsive class tokens are
// present (a revert would drop them). Visual reflow at 375/768 is verified
// manually via /check verify. P13.8 is a light verification pass: PrepPage was
// already responsive (the form is a vertical stack and the suggestions list
// stacks), so the deliverable is revert-guard tests for that token pattern.

describe("Prep page responsive (P13.8)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          suggestions: {
            context: ["Know the roadmap"],
            openActionItems: [],
            discussionPoints: [],
            questionsToAsk: [],
          },
        }),
      })),
    );
  });

  it("input + notes + button form stacks vertically on mobile (flex-col)", () => {
    const { container } = render(<PrepPage />);
    const form = container.querySelector("form") as HTMLElement;
    const tokens = form.className.split(" ");
    expect(tokens).toContain("flex");
    expect(tokens).toContain("w-full");
    expect(tokens).toContain("flex-col");
    expect(tokens).toContain("gap-3");
  });

  it("Generate prep button is inline, not full width (w-fit)", () => {
    render(<PrepPage />);
    const btn = screen.getByRole("button", { name: /generate prep/i });
    expect(btn.className.split(" ")).toContain("w-fit");
  });

  it("suggestions list stacks full width (flex-col) once generated", async () => {
    const { container } = render(<PrepPage />);
    fireEvent.change(screen.getByLabelText(/upcoming meeting title/i), {
      target: { value: "Q3 Sync" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText(/context to know/i)).toBeTruthy();
    });

    const heading = screen.getByText(/context to know/i);
    const wrapper = (heading.closest("div") as HTMLElement).parentElement
      ?.parentElement as HTMLElement;
    const tokens = wrapper.className.split(" ");
    expect(tokens).toContain("flex");
    expect(tokens).toContain("w-full");
    expect(tokens).toContain("max-w-2xl");
    expect(tokens).toContain("flex-col");
    expect(tokens).toContain("gap-4");
  });
});

describe("Prep page Promise Ledger section (AC-15)", () => {
  afterEach(cleanup);

  const ledgerItem = {
    id: "li-1",
    kind: "promise",
    statement: "Ali sends the survey",
    quote: "main Friday tak survey bhej dunga",
    assignee: "Ali",
    dueDate: "2026-10-03",
    derivedStatus: "overdue",
    sourceMeeting: {
      id: "m1",
      title: "Survey kickoff",
      startedAt: "2026-10-01T12:00:00.000Z",
    },
  };

  const respond = (suggestions: Record<string, string[]>) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ suggestions, ledgerItems: [ledgerItem] }),
      })),
    );

  const submit = () => {
    const { container } = render(<PrepPage />);
    fireEvent.change(screen.getByLabelText(/upcoming meeting title/i), {
      target: { value: "Survey sync" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLElement);
  };

  it("lists open items with the overdue badge and a source meeting link", async () => {
    respond({
      context: ["Know the roadmap"],
      openActionItems: [],
      discussionPoints: [],
      questionsToAsk: [],
    });
    submit();

    await waitFor(() => {
      expect(screen.getByText(/open promises and decisions/i)).toBeTruthy();
    });
    expect(screen.getByText("Ali sends the survey")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    const link = screen.getByRole("link", { name: /from survey kickoff/i });
    expect(link.getAttribute("href")).toBe("/meeting-intelligence/m1");
  });

  it("shows ledger items instead of the empty state when the LLM lists are empty", async () => {
    respond({
      context: [],
      openActionItems: [],
      discussionPoints: [],
      questionsToAsk: [],
    });
    submit();

    await waitFor(() => {
      expect(screen.getByText(/open promises and decisions/i)).toBeTruthy();
    });
    expect(screen.queryByText(/no prep suggestions yet/i)).toBeNull();
  });
});
