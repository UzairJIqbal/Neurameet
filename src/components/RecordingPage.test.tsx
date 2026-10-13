// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RecordingPage from "./RecordingPage";

// jsdom has no layout engine, so these assert the responsive tokens are present
// on the list header and rows (a revert would drop them). The actual visual reflow
// at 375/768 is verified manually via /check verify.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const recordings = [
  {
    id: "r1",
    filename: "Recording one",
    start_time: new Date().toISOString(),
    url: "https://example.com/r1",
  },
];

beforeEach(() => {
  global.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes("/api/recordings")) {
      return { ok: true, json: async () => ({ recordings }) };
    }
    if (u.includes("/api/meetings")) {
      return { ok: true, json: async () => ({ meetings: [] }) };
    }
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Recordings list responsive (P13.5)", () => {
  it("header reflows: Recording col-span-6 md:col-span-5, Date col-span-6 md:col-span-3, Action col-span-12 hidden md:col-span-4 md:block", async () => {
    render(<RecordingPage />);
    const recordingHeader = (await screen.findByText("Recording")) as HTMLElement;
    expect(recordingHeader.className.split(" ")).toEqual(
      expect.arrayContaining(["col-span-6", "md:col-span-5"]),
    );
    const dateHeader = (await screen.findByText("Date")) as HTMLElement;
    expect(dateHeader.className.split(" ")).toEqual(
      expect.arrayContaining(["col-span-6", "md:col-span-3"]),
    );
    const actionHeader = (await screen.findByText("Action")) as HTMLElement;
    expect(actionHeader.className.split(" ")).toEqual(
      expect.arrayContaining([
        "col-span-12",
        "hidden",
        "md:col-span-4",
        "md:block",
      ]),
    );
  });

  it("row action cell drops below on mobile (col-span-12 md:col-span-4 md:flex-nowrap)", async () => {
    render(<RecordingPage />);
    const viewInsightsBtn = (await screen.findByRole("button", {
      name: /View insights/i,
    })) as HTMLButtonElement;
    const actionCell = viewInsightsBtn.parentElement as HTMLElement;
    const tokens = actionCell.className.split(" ");
    expect(tokens).toContain("col-span-12");
    expect(tokens).toContain("md:col-span-4");
    expect(tokens).toContain("md:flex-nowrap");
  });
});
