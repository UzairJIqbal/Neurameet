// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { Sidebar_Com } from "./Sidebar";

// Mutable pathname so we can simulate a route change between renders.
let pathname = "/upcoming";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: vi.fn(), openUserProfile: vi.fn() }),
  useUser: () => ({
    user: {
      fullName: "Test User",
      primaryEmailAddress: { emailAddress: "test@example.com" },
      imageUrl: "",
    },
  }),
  SignedIn: ({ children }: { children?: React.ReactNode }) => children,
  UserButton: () => null,
}));
vi.mock("@/components/FloatingChat", () => ({ default: () => null }));

// The page components Sidebar_Com can render are never mounted in this test
// (we pass `children`), but their modules are imported eagerly and some pull
// in `server-only` (via actions/libs). Mock them so the suite loads in jsdom.
vi.mock("@/components/DashboardContent", () => ({ default: () => null }));
vi.mock("./PreviousPage", () => ({ default: () => null }));
vi.mock("./RecordingPage", () => ({ default: () => null }));
vi.mock("./UpcomingPage", () => ({ default: () => null }));
vi.mock("./PersonalRoomPage", () => ({ default: () => null }));
vi.mock("./JoinMeetingPage", () => ({ default: () => null }));
vi.mock("./meeting-intelligence/MeetingList", () => ({ default: () => null }));
vi.mock("./follow-ups/FollowUpList", () => ({ default: () => null }));
vi.mock("./SettingsPage", () => ({ default: () => null }));
vi.mock("./meeting-intelligence/GeneralChat", () => ({ default: () => null }));
vi.mock("./SearchPage", () => ({ default: () => null }));
vi.mock("./PrepPage", () => ({ default: () => null }));

const Stub = () => <div>page body</div>;

const tokens = (c: HTMLElement) => getAside(c).className.split(" ");
const getAside = (c: HTMLElement) => c.querySelector("aside") as HTMLElement;
const isOpen = (c: HTMLElement) => tokens(c).includes("translate-x-0");
const isClosed = (c: HTMLElement) => tokens(c).includes("-translate-x-full");

afterEach(() => {
  document.body.style.overflow = "";
  cleanup();
});

describe("Sidebar_Com drawer (P13.1)", () => {
  it("starts closed", () => {
    const { container } = render(<Sidebar_Com type="upcomingPage"><Stub /></Sidebar_Com>);
    expect(isClosed(container)).toBe(true);
    expect(isOpen(container)).toBe(false);
  });

  it("opens via the Navbar hamburger", () => {
    const { container } = render(<Sidebar_Com type="upcomingPage"><Stub /></Sidebar_Com>);
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(isOpen(container)).toBe(true);
  });

  it("closes on Escape", () => {
    const { container } = render(<Sidebar_Com type="upcomingPage"><Stub /></Sidebar_Com>);
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(isOpen(container)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(isClosed(container)).toBe(true);
  });

  it("closes on backdrop click", () => {
    const { container } = render(<Sidebar_Com type="upcomingPage"><Stub /></Sidebar_Com>);
    fireEvent.click(screen.getByLabelText("Open menu"));
    const backdrop = container.querySelector("div.fixed.inset-0") as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(isClosed(container)).toBe(true);
  });

  it("closes when a nav link is clicked (route-close)", () => {
    const { container } = render(<Sidebar_Com type="upcomingPage"><Stub /></Sidebar_Com>);
    fireEvent.click(screen.getByLabelText("Open menu"));
    const firstLink = within(getAside(container)).getAllByRole("link")[0];
    fireEvent.click(firstLink);
    expect(isClosed(container)).toBe(true);
  });

  it("closes when the pathname changes (route-change)", () => {
    const { container, rerender } = render(
      <Sidebar_Com type="upcomingPage"><Stub /></Sidebar_Com>,
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(isOpen(container)).toBe(true);
    pathname = "/previous";
    rerender(<Sidebar_Com type="upcomingPage"><Stub /></Sidebar_Com>);
    expect(isClosed(container)).toBe(true);
  });

  it("locks background scroll while open and releases on close", () => {
    const { container } = render(<Sidebar_Com type="upcomingPage"><Stub /></Sidebar_Com>);
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });

  it("renders the account menu trigger (Manage account / Sign out reachable)", () => {
    render(<Sidebar_Com type="upcomingPage"><Stub /></Sidebar_Com>);
    const trigger = screen.getByRole("button", { name: /Test User/i });
    expect(trigger).toBeTruthy();
  });
});
