// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import LandingHero from "./LandingHero";
import MeetingHistory from "./MeetingHistory";

// P13.2 regression guards for the two decorative-mockup responsive fixes.
// jsdom has no layout engine, so these assert the responsive tokens are
// present on the right elements (a revert would drop them). The actual visual
// outcome at 375/768 is verified manually via /check verify.

describe("Landing page responsive mockups (P13.2)", () => {
  it("LandingHero mockup sidebar is hidden below sm so the 3 stat cards get full width", () => {
    const { container } = render(<LandingHero />);
    const sidebar = container.querySelector("div.w-48") as HTMLElement;
    expect(sidebar).toBeTruthy();
    const tokens = sidebar.className.split(" ");
    expect(tokens).toContain("hidden");
    expect(tokens).toContain("sm:block");
  });

  it("MeetingHistory search/filter row wraps instead of clipping at 375", () => {
    const { getByText } = render(<MeetingHistory />);
    const heading = getByText("Meeting Intelligence");
    const row = heading.parentElement as HTMLElement;
    const tokens = row.className.split(" ");
    expect(tokens).toContain("flex");
    expect(tokens).toContain("flex-wrap");
    expect(tokens).toContain("justify-between");
    expect(tokens).toContain("gap-4");
  });
});
