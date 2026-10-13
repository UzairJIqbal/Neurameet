// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FloatingChat from "./FloatingChat";

// jsdom has no layout engine, so this asserts the expanded panel carries the
// responsive height tokens (min-h-[60vh] sm:min-h-[52vh] / max-h capped so it
// never covers small phones or tablets) and no longer the old fixed
// min-h-[600px]. The visual outcome at 375 and 768 is verified manually via
// /check verify.

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => nav.pathname,
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { firstName: "Test", imageUrl: "" } }),
}));
vi.mock("./meeting-intelligence/ChatPanel", () => ({ default: () => null }));
vi.mock("@/lib/chatHistory", () => ({
  listConversations: () => [],
  relativeTime: () => "",
}));

describe("Floating chat expanded height (P13.3)", () => {
  it("caps the expanded panel height on phones instead of a fixed 600px", () => {
    render(<FloatingChat />);
    fireEvent.click(screen.getByLabelText("Open support chat"));
    const panel = screen.getByRole("dialog") as HTMLElement;
    const tokens = panel.className.split(" ");
    expect(tokens).toContain("min-h-[60vh]");
    expect(tokens).toContain("sm:min-h-[52vh]");
    expect(tokens).toContain("sm:max-h-[min(720px,88vh)]");
    expect(tokens).not.toContain("min-h-[600px]");
  });
});

describe("Floating chat route changes", () => {
  it("survives navigating to and from /ai-chat (stable hook order)", () => {
    nav.pathname = "/dashboard";
    const { rerender, container } = render(<FloatingChat />);
    nav.pathname = "/ai-chat";
    expect(() => rerender(<FloatingChat />)).not.toThrow();
    expect(container.innerHTML).toBe("");
    nav.pathname = "/dashboard";
    expect(() => rerender(<FloatingChat />)).not.toThrow();
    expect(screen.getByLabelText("Open support chat")).toBeTruthy();
    nav.pathname = "/dashboard";
  });
});
