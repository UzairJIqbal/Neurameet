// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// jsdom has no layout engine, so these assert the responsive class tokens are
// present (a revert would drop them). Visual reflow at 375/768 is verified
// manually via /check verify. No component code change: P13.7 is a verification
// pass like P13.5 (audit already rated Settings responsive; it has no dropdowns
// on this page, so the P13.10 dropdown tokens don't apply here).

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      fullName: "Uzair Javaid",
      primaryEmailAddress: { emailAddress: "uzair@example.com" },
      imageUrl: "https://example.com/avatar.png",
    },
  }),
}));

import SettingsPage from "./SettingsPage";

describe("Settings responsive (P13.7)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("stacks as a single column on mobile (section is flex-col, full width)", () => {
    const { container } = render(<SettingsPage />);
    const section = container.querySelector("section") as HTMLElement;
    const tokens = section.className.split(" ");
    expect(tokens).toContain("flex");
    expect(tokens).toContain("flex-col");
    expect(tokens).toContain("w-full");
  });

  it("account card avatar is shrink-0 and the name truncates inside a bounded box", () => {
    render(<SettingsPage />);
    const avatar = screen.getByRole("img", { name: /Uzair Javaid/i }) as HTMLElement;
    expect(avatar.className.split(" ")).toContain("shrink-0");

    const name = screen.getByText("Uzair Javaid") as HTMLElement;
    expect(name.className.split(" ")).toContain("truncate");
    // Name + email sit in a min-w-0 box so truncate has a bounded width and
    // neither pushes the row wide on a 375px screen.
    const nameBox = name.parentElement as HTMLElement;
    expect(nameBox.className.split(" ")).toContain("min-w-0");
  });

  it("each preference row spreads label and toggle apart and keeps the toggle fixed width", async () => {
    render(<SettingsPage />);
    for (const label of [
      "Email notifications",
      "AI auto-summary on upload",
      "Desktop reminders",
    ]) {
      const text = screen.getByText(label) as HTMLElement;
      // text -> inner min-w-0 div -> row flex container.
      const row = text.parentElement?.parentElement as HTMLElement;
      const rowTokens = row.className.split(" ");
      expect(rowTokens).toContain("flex");
      expect(rowTokens).toContain("justify-between");
      expect(rowTokens).toContain("gap-4");
    }
    // All three toggles keep their fixed width on every breakpoint so a long
    // hint string can never squeeze them off the row.
    const switches = (await screen.findAllByRole("switch")) as HTMLElement[];
    expect(switches.length).toBe(3);
    for (const sw of switches) {
      expect(sw.className.split(" ")).toContain("shrink-0");
    }
  });
});
