// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import NotificationsPage from "./NotificationsPage";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const row = (over: Record<string, unknown> = {}) => ({
  id: "n1",
  projectId: "p1",
  projectName: "Apollo",
  kind: "task_assigned",
  category: "tasks",
  title: "You were assigned NM-7",
  body: "Fix login",
  link: "/projects/p1?tab=tasks&task=t1",
  readAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

const page = (items: unknown[], nextCursor: string | null = null) => ({
  items,
  unreadCount: 1,
  categoryCounts: { all: 10, tasks: 4, meetings: 2, github: 2, projects: 2 },
  nextCursor,
});

const fetchMock = vi.fn();
const respond = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  push.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => respond(page([row()])));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const urlAt = (i: number) => String(fetchMock.mock.calls[i]?.[0]);

describe("NotificationsPage (AC-72a)", () => {
  it("says who it is for and shows each filter's count", async () => {
    render(<NotificationsPage />);
    await screen.findByText("You were assigned NM-7");
    expect(
      screen.getByText("1 unread, only notifications addressed to you"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "All 10" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unread 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "GitHub 2" })).toBeTruthy();
  });

  it("opens the filter from ?filter=github", async () => {
    render(<NotificationsPage initialFilter="github" />);
    await screen.findByText("You were assigned NM-7");
    expect(urlAt(0)).toBe("/api/notifications?category=github");
  });

  it("ignores an unknown filter", async () => {
    render(<NotificationsPage initialFilter="nope" />);
    await screen.findByText("You were assigned NM-7");
    expect(urlAt(0)).toBe("/api/notifications");
  });

  it("asks the server for unread rows on the Unread filter", async () => {
    render(<NotificationsPage />);
    await screen.findByText("You were assigned NM-7");
    fireEvent.click(screen.getByRole("button", { name: "Unread 1" }));
    await waitFor(() => expect(urlAt(1)).toBe("/api/notifications?unread=1"));
  });

  it("marks a row read and opens its link on click", async () => {
    render(<NotificationsPage />);
    fireEvent.click(await screen.findByText("You were assigned NM-7"));
    expect(push).toHaveBeenCalledWith("/projects/p1?tab=tasks&task=t1");
    await waitFor(() => expect(urlAt(1)).toBe("/api/notifications/read"));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      ids: ["n1"],
    });
  });

  it("toggles a read row back to unread", async () => {
    fetchMock.mockImplementation(async () =>
      respond(page([row({ readAt: "2026-11-07T10:00:00.000Z" })])),
    );
    render(<NotificationsPage />);
    fireEvent.click(await screen.findByLabelText("Mark as unread"));
    await waitFor(() => expect(urlAt(1)).toBe("/api/notifications/read"));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      ids: ["n1"],
      unread: true,
    });
  });

  it("appends the next page on Load more", async () => {
    fetchMock.mockImplementationOnce(async () =>
      respond(page([row()], "cursor-1")),
    );
    fetchMock.mockImplementationOnce(async () =>
      respond(page([row({ id: "n2", title: "Second page" })])),
    );
    render(<NotificationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByText("Second page");
    expect(screen.getByText("You were assigned NM-7")).toBeTruthy();
    expect(urlAt(1)).toBe("/api/notifications?cursor=cursor-1");
  });

  it("shows the empty state", async () => {
    fetchMock.mockImplementation(async () => respond(page([])));
    render(<NotificationsPage />);
    await screen.findByText(/Nothing here yet/);
  });
});
