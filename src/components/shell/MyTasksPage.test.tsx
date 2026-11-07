// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import MyTasksPage from "./MyTasksPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/projects/TaskDrawer", () => ({
  default: ({ taskId }: { taskId: string }) => (
    <div data-testid="drawer">{taskId}</div>
  ),
}));

const base = {
  description: null,
  priority: "medium",
  position: 0,
  assigneeId: "u1",
  assigneeName: "Me",
  sourceMeetingId: null,
  completionKind: null,
  completedAt: null,
  version: 1,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  projectId: "p1",
  projectName: "Apollo",
};
const tasks = [
  {
    ...base,
    id: "t1",
    key: "APO-1",
    number: 1,
    title: "Late thing",
    status: "todo",
    dueDate: "2026-11-01",
  },
  {
    ...base,
    id: "t2",
    key: "APO-2",
    number: 2,
    title: "Review thing",
    status: "in_review",
    dueDate: "2026-11-12",
  },
  {
    ...base,
    id: "t3",
    key: "ZED-1",
    number: 1,
    title: "Other project",
    status: "todo",
    dueDate: null,
    projectId: "p2",
    projectName: "Zed",
  },
];

const mockFetch = (body: unknown) => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
};

beforeEach(() => mockFetch({ today: "2026-11-08", tasks, truncated: false }));
afterEach(() => cleanup());

describe("My Tasks page (AC-77)", () => {
  it("tab counts follow the data and Overdue uses the server date", async () => {
    render(<MyTasksPage />);
    await screen.findByText("Late thing");
    const tabs = within(screen.getByRole("group", { name: "Task status" }));
    expect(tabs.getByRole("button", { name: /^All 3$/ })).toBeTruthy();
    expect(tabs.getByRole("button", { name: /^To Do 2$/ })).toBeTruthy();
    expect(tabs.getByRole("button", { name: /^Overdue 1$/ })).toBeTruthy();
    fireEvent.click(tabs.getByRole("button", { name: /^Overdue/ }));
    expect(screen.queryByText("Review thing")).toBeNull();
    expect(screen.getByText("Late thing")).toBeTruthy();
  });

  it("narrows by project and search, and counts follow", async () => {
    render(<MyTasksPage />);
    await screen.findByText("Late thing");
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: "p2" },
    });
    expect(screen.queryByText("Late thing")).toBeNull();
    expect(screen.getByText("Other project")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByPlaceholderText("Search my tasks"), {
      target: { value: "apo-2" },
    });
    expect(screen.getByText("Review thing")).toBeTruthy();
    expect(screen.queryByText("Late thing")).toBeNull();
  });

  it("opens the task drawer from a row", async () => {
    render(<MyTasksPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Open APO-2" }));
    expect(screen.getByTestId("drawer").textContent).toBe("t2");
  });

  it("shows the truncated line when the server cut the list", async () => {
    mockFetch({ today: "2026-11-08", tasks, truncated: true });
    render(<MyTasksPage />);
    expect(
      await screen.findByText(/more open tasks than this list shows/i),
    ).toBeTruthy();
  });

  it("shows the empty state when nothing is assigned", async () => {
    mockFetch({ today: "2026-11-08", tasks: [], truncated: false });
    render(<MyTasksPage />);
    expect(await screen.findByText("Nothing assigned to you yet")).toBeTruthy();
  });
});
