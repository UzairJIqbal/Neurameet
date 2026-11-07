// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

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
      externalAccounts: [
        { provider: "google", emailAddress: "uzair@gmail.example" },
      ],
    },
  }),
}));

const { nav } = vi.hoisted(() => ({
  nav: { tab: "", replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.tab),
}));

import SettingsPage from "./SettingsPage";

describe("Settings responsive (P13.7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.tab = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          emailNotifications: true,
          digestEmails: false,
          connected: true,
          login: "octo",
          authorizeUrl: null,
        }),
      })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

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
    const avatar = screen.getByRole("img", {
      name: /Uzair Javaid/i,
    }) as HTMLElement;
    expect(avatar.className.split(" ")).toContain("shrink-0");

    const name = screen.getByText("Uzair Javaid") as HTMLElement;
    expect(name.className.split(" ")).toContain("truncate");
    // Name + email sit in a min-w-0 box so truncate has a bounded width and
    // neither pushes the row wide on a 375px screen.
    const nameBox = name.parentElement as HTMLElement;
    expect(nameBox.className.split(" ")).toContain("min-w-0");
  });

  it("each preference row spreads label and toggle apart and keeps the toggle fixed width", async () => {
    nav.tab = "tab=notifications";
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

  it("opens the tab in the URL and falls back to Account", () => {
    nav.tab = "tab=nonsense";
    render(<SettingsPage />);
    expect(
      screen
        .getByRole("tab", { name: "Account" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Manage password")).toBeTruthy();
  });

  it("selecting a tab updates the URL", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(nav.replace).toHaveBeenCalledWith("/settings?tab=appearance", {
      scroll: false,
    });
  });

  it("shows the stored digest toggle and reverts it on a failed save", async () => {
    render(<SettingsPage />);
    const digest = screen.getByRole("switch", { name: "Daily digest" });
    await waitFor(() =>
      expect(digest.getAttribute("aria-checked")).toBe("false"),
    );
    vi.mocked(fetch).mockRejectedValueOnce(new Error("down"));
    fireEvent.click(digest);
    await waitFor(() =>
      expect(digest.getAttribute("aria-checked")).toBe("false"),
    );
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(
      "/api/settings/notifications",
      expect.objectContaining({ body: JSON.stringify({ digestEmails: true }) }),
    );
  });

  it("shows both connected accounts", async () => {
    nav.tab = "tab=connected";
    render(<SettingsPage />);
    expect(await screen.findByText("Signed in as @octo")).toBeTruthy();
    expect(screen.getByText("uzair@gmail.example")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  it("reports a callback outcome once and strips it from the URL", async () => {
    nav.tab = "tab=connected&github=already_linked";
    render(<SettingsPage />);
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/settings?tab=connected", {
        scroll: false,
      }),
    );
  });
});
