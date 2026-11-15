// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import ActionItemsTab from "./ActionItemsTab";
import type { ActionItem } from "@/lib/meeting-types";

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));

vi.mock("@/actions/follow-ups", () => ({ updateFollowUpStatus: mockUpdate }));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const items: ActionItem[] = [
  {
    id: "a1",
    title: "Send the recap",
    assignee: null,
    dueDate: null,
    reviewState: "confirmed",
    followUpId: "f1",
    followUpStatus: "pending",
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActionItemsTab follow-up status", () => {
  it("lets the owner tick a follow-up done", async () => {
    mockUpdate.mockResolvedValue({ ok: true });
    render(<ActionItemsTab insights={null} actionItems={items} canManage />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Mark done: Send the recap/ }),
    );
    expect(mockUpdate).toHaveBeenCalledWith("f1", "completed");
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Mark not done/ }),
      ).toBeTruthy(),
    );
    expect(
      screen
        .getByRole("link", { name: /See all follow-ups/ })
        .getAttribute("href"),
    ).toBe("/follow-ups");
  });

  it("shows others a read only status chip", () => {
    render(<ActionItemsTab insights={null} actionItems={items} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("Open")).toBeTruthy();
  });

  it("keeps items without a follow-up (project meetings) as before", () => {
    const plain = [{ ...items[0], followUpId: null, followUpStatus: null }];
    render(<ActionItemsTab insights={null} actionItems={plain} canManage />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("Open")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /See all follow-ups/ }),
    ).toBeNull();
  });
});
