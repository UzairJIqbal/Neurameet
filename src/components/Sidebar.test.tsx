// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { Sidebar_Com } from "./Sidebar";

// Mutable pathname so we can simulate a route change between renders.
let pathname = "/upcoming";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
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

const COUNTS = { openTasks: 6, upcomingMeetings: 2, unread: 120, prReviews: 1 };
const PROJECTS = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i}`,
  name: `Project ${i}`,
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url.startsWith("/api/my-counts")
        ? COUNTS
        : url.startsWith("/api/projects")
          ? { projects: PROJECTS }
          : {
              items: [],
              unreadCount: 0,
              categoryCounts: {},
              nextCursor: null,
            };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});

const tokens = (c: HTMLElement) => getAside(c).className.split(" ");
const getAside = (c: HTMLElement) => c.querySelector("aside") as HTMLElement;
const isOpen = (c: HTMLElement) => tokens(c).includes("translate-x-0");
const isClosed = (c: HTMLElement) => tokens(c).includes("-translate-x-full");

afterEach(() => {
  document.body.style.overflow = "";
  pathname = "/upcoming";
  cleanup();
  vi.unstubAllGlobals();
});

describe("Sidebar_Com drawer (P13.1)", () => {
  it("starts closed", () => {
    const { container } = render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    expect(isClosed(container)).toBe(true);
    expect(isOpen(container)).toBe(false);
  });

  it("opens via the Navbar hamburger", () => {
    const { container } = render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(isOpen(container)).toBe(true);
  });

  it("closes on Escape", () => {
    const { container } = render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(isOpen(container)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(isClosed(container)).toBe(true);
  });

  it("closes on backdrop click", () => {
    const { container } = render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    const backdrop = container.querySelector(
      "div.fixed.inset-0",
    ) as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(isClosed(container)).toBe(true);
  });

  it("closes when a nav link is clicked (route-close)", () => {
    const { container } = render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    const firstLink = within(getAside(container)).getAllByRole("link")[0];
    fireEvent.click(firstLink);
    expect(isClosed(container)).toBe(true);
  });

  it("closes when the pathname changes (route-change)", () => {
    const { container, rerender } = render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(isOpen(container)).toBe(true);
    pathname = "/previous";
    rerender(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    expect(isClosed(container)).toBe(true);
  });

  it("locks background scroll while open and releases on close", () => {
    const { container } = render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });

  it("renders the account menu trigger (Manage account / Sign out reachable)", () => {
    render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    const trigger = screen.getByRole("button", { name: /Test User/i });
    expect(trigger).toBeTruthy();
  });
});

describe("Sidebar_Com workspace shell (AC-77a)", () => {
  const renderShell = () =>
    render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );

  it("lists the relabelled links and drops the ones that left", () => {
    const { container } = renderShell();
    const aside = within(getAside(container));
    for (const label of [
      "My Dashboard",
      "My Tasks",
      "My Meetings",
      "My Projects",
      "Notifications",
      "AI Assistant",
      "Follow-ups",
      "Personal Room",
      "Settings",
    ]) {
      expect(aside.getByRole("link", { name: new RegExp(label) })).toBeTruthy();
    }
    for (const label of ["Recordings", "Previous Meetings", "Prep", "Search"]) {
      expect(aside.queryByRole("link", { name: new RegExp(label) })).toBeNull();
    }
  });

  it("shows counts from my-counts, with 99+ above 99", async () => {
    const { container } = renderShell();
    const aside = within(getAside(container));
    await waitFor(() => {
      expect(
        aside.getByRole("link", { name: /My Tasks/ }).textContent,
      ).toContain("6");
    });
    expect(
      aside.getByRole("link", { name: /Notifications/ }).textContent,
    ).toContain("99+");
  });

  it("marks a link active on its path and the paths under it", () => {
    pathname = "/projects/abc";
    const { container } = renderShell();
    const link = within(getAside(container)).getByRole("link", {
      name: /My Projects/,
    });
    expect(link.className).toContain("border-primary-container");
  });

  it("caps project shortcuts at 5, plus All projects", async () => {
    const { container } = renderShell();
    const aside = within(getAside(container));
    await waitFor(() => expect(aside.getByText("Project 4")).toBeTruthy());
    expect(aside.queryByText("Project 5")).toBeNull();
    expect(aside.getByRole("link", { name: "All projects" })).toBeTruthy();
  });

  it("remembers the collapsed sidebar", () => {
    const { container, unmount } = renderShell();
    fireEvent.click(screen.getByLabelText("Collapse sidebar"));
    expect(tokens(container)).toContain("lg:w-[76px]");
    unmount();
    const again = renderShell();
    expect(tokens(again.container)).toContain("lg:w-[76px]");
  });

  it("still renders when storage throws", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const { container } = renderShell();
    expect(tokens(container)).not.toContain("lg:w-[76px]");
    getItem.mockRestore();
  });
});

describe("Header (AC-77e)", () => {
  it("shows the header with breadcrumbs, search, bell, help, and account menu on Home too", () => {
    pathname = "/dashboard";
    render(
      <Sidebar_Com type="Home">
        <Stub />
      </Sidebar_Com>,
    );
    expect(
      within(screen.getByLabelText("Breadcrumb")).getByText("My Dashboard"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Search projects, tasks, meetings"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Help")).toBeTruthy();
    expect(screen.getByLabelText("Account menu")).toBeTruthy();
  });

  it("opens and closes the static Help dialog", () => {
    render(
      <Sidebar_Com type="upcomingPage">
        <Stub />
      </Sidebar_Com>,
    );
    fireEvent.click(screen.getByLabelText("Help"));
    expect(screen.getByText("How a promise reaches a merge")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("How a promise reaches a merge")).toBeNull();
  });
});
