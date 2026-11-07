// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import CommandPalette from "./CommandPalette";

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const groups = {
  projects: [],
  tasks: [
    {
      id: "t1",
      title: "Ship it",
      subtitle: "ABC-12 · Alpha",
      href: "/projects/p1?tab=tasks&task=t1",
    },
  ],
  meetings: [],
  decisions: [],
};

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", RO);
    Element.prototype.scrollIntoView = vi.fn();
    push.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => groups })),
    );
  });
  afterEach(cleanup);

  const openIt = () => {
    render(<CommandPalette />);
    act(() => {
      fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    });
  };

  it("opens on Ctrl K, shows Go to links when empty, and closes on Escape", async () => {
    openIt();
    expect(await screen.findByText("Recordings")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("makes one debounced call, groups the rows, and ends with the content search row", async () => {
    openIt();
    const input = await screen.findByPlaceholderText(/search projects/i);
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ship" } });
    expect(await screen.findByText("Ship it")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toBe("/api/projects/search?q=ship");
    fireEvent.click(screen.getByText(/Search meeting content/));
    expect(push).toHaveBeenCalledWith("/search?q=ship");
  });
});
