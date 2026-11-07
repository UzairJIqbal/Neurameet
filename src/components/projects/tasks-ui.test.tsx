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
  act,
} from "@testing-library/react";
import type { DropResult } from "@hello-pangea/dnd";
import type {
  ProjectDetail,
  ProjectMembersResponse,
} from "@/lib/project-types";
import type { Proposal, Task } from "@/lib/task-types";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// The board's drag library, reduced to its render props so a test can call
// onDragEnd directly (jsdom has no layout for a real drag).
const dnd = vi.hoisted(() => ({
  onDragEnd: null as ((r: DropResult) => void) | null,
}));
vi.mock("@hello-pangea/dnd", () => {
  const provided = {
    innerRef: () => {},
    droppableProps: {},
    draggableProps: {},
    dragHandleProps: {},
    placeholder: null,
  };
  return {
    DragDropContext: ({
      onDragEnd,
      children,
    }: {
      onDragEnd: (r: DropResult) => void;
      children: React.ReactNode;
    }) => {
      dnd.onDragEnd = onDragEnd;
      return <>{children}</>;
    },
    Droppable: ({
      children,
    }: {
      children: (p: typeof provided) => React.ReactNode;
    }) => <>{children(provided)}</>,
    Draggable: ({
      children,
    }: {
      children: (p: typeof provided) => React.ReactNode;
    }) => <>{children(provided)}</>,
  };
});

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/projects/p1",
  useSearchParams: () => nav.params,
}));

// The drawer loads its own data and has its own rules. Here only opening and
// closing it matter.
vi.mock("./TaskDrawer", () => ({
  default: ({ taskId, onClose }: { taskId: string; onClose: () => void }) => (
    <button onClick={onClose}>Close drawer {taskId}</button>
  ),
}));

const client = vi.hoisted(() => ({
  getTask: vi.fn(),
  listMembers: vi.fn(),
  listTasks: vi.fn(),
  updateTask: vi.fn(),
  listProposals: vi.fn(),
  reviewProposal: vi.fn(),
}));
vi.mock("@/lib/project-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-client")>(
    "@/lib/project-client",
  );
  return { ...actual, ...client };
});

import toast from "react-hot-toast";
import { ProjectClientError } from "@/lib/project-client";
import TasksBoard from "./TasksBoard";
import ProposalsPanel from "./ProposalsPanel";

const project: ProjectDetail = {
  id: "p1",
  name: "NeuraMeet Core",
  taskPrefix: "NM",
  role: "developer",
  memberCount: 2,
  meetingCount: 1,
  createdAt: "2026-11-01T00:00:00Z",
};

const members = (myRole: "developer" | "owner"): ProjectMembersResponse => ({
  me: "u-dev",
  myRole,
  members: [
    {
      userId: "u-dev",
      role: myRole,
      joinedAt: "2026-11-01T00:00:00Z",
      name: "Dana",
      email: null,
    },
  ],
});

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  key: "NM-1",
  number: 1,
  title: "Fix login",
  description: null,
  status: "todo",
  position: 1,
  assigneeId: "u-dev",
  assigneeName: "Dana",
  dueDate: null,
  sourceMeetingId: null,
  completionKind: null,
  completedAt: null,
  version: 2,
  createdAt: "2026-11-03",
  updatedAt: "2026-11-03",
  ...over,
});

const drop = (to: string): DropResult =>
  ({
    draggableId: "t1",
    source: { droppableId: "todo", index: 0 },
    destination: { droppableId: to, index: 0 },
    reason: "DROP",
    mode: "FLUID",
    type: "DEFAULT",
    combine: null,
  }) as DropResult;

const column = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  client.getTask.mockResolvedValue({ task: task() });
  client.listMembers.mockResolvedValue(members("developer"));
  client.listTasks.mockResolvedValue({ tasks: [task()], truncated: {} });
});
afterEach(cleanup);

describe("TasksBoard", () => {
  it("puts the card back and refetches on a 409", async () => {
    client.updateTask.mockRejectedValue(
      new ProjectClientError(409, "stale", null),
    );
    render(<TasksBoard project={project} />);
    await screen.findByText("Fix login");

    act(() => dnd.onDragEnd!(drop("in_progress")));

    await waitFor(() =>
      expect(client.updateTask).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ status: "in_progress", ifVersion: 2 }),
      ),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Someone else changed this task. The board was refreshed.",
      ),
    );
    expect(within(column("To do")).getByText("Fix login")).toBeTruthy();
    expect(client.listTasks).toHaveBeenCalledTimes(2);
  });

  it("asks for evidence on Completed and puts the card back on cancel", async () => {
    render(<TasksBoard project={project} />);
    await screen.findByText("Fix login");

    act(() => dnd.onDragEnd!(drop("completed")));
    expect(within(column("Completed")).getByText("Fix login")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(within(column("To do")).getByText("Fix login")).toBeTruthy();
    expect(client.updateTask).not.toHaveBeenCalled();
  });

  it("refuses a Developer moving someone else's task before any request", async () => {
    client.listTasks.mockResolvedValue({
      tasks: [task({ assigneeId: "u-other" })],
      truncated: {},
    });
    render(<TasksBoard project={project} />);
    await screen.findByText("Fix login");

    act(() => dnd.onDragEnd!(drop("in_progress")));

    expect(toast.error).toHaveBeenCalledWith(
      "You can only change your own or unassigned tasks",
    );
    expect(client.updateTask).not.toHaveBeenCalled();
  });

  it("opens no drawer and asks for no task without ?task=", async () => {
    render(<TasksBoard project={project} />);
    await screen.findByText("Fix login");
    expect(client.getTask).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Close drawer/ })).toBeNull();
  });

  it("opens the drawer from ?task=, and closing it removes only that param", async () => {
    nav.params = new URLSearchParams("tab=tasks&task=t9");
    render(<TasksBoard project={project} />);

    const close = await screen.findByRole("button", {
      name: "Close drawer t9",
    });
    expect(client.getTask).toHaveBeenCalledWith("t9", expect.anything());
    expect(nav.replace).not.toHaveBeenCalled();

    fireEvent.click(close);

    expect(nav.replace).toHaveBeenCalledWith("/projects/p1?tab=tasks", {
      scroll: false,
    });
    expect(screen.queryByRole("button", { name: /Close drawer/ })).toBeNull();
  });

  it("toasts and clears a ?task= you can't read, with no drawer", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    client.getTask.mockRejectedValue(
      new ProjectClientError(404, "Not found", null),
    );
    nav.params = new URLSearchParams("tab=tasks&task=bad");
    render(<TasksBoard project={project} />);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("We couldn't open that task."),
    );
    expect(nav.replace).toHaveBeenCalledWith("/projects/p1?tab=tasks", {
      scroll: false,
    });
    expect(screen.queryByRole("button", { name: /Close drawer/ })).toBeNull();
    spy.mockRestore();
  });
});

const proposal: Proposal = {
  id: "a1",
  meetingId: "m1",
  meetingTitle: "Standup",
  meetingDate: "2026-11-02T10:00:00Z",
  title: "Ship the login fix",
  assignee: "Dana",
  dueDate: null,
  quote: "I will ship the login fix",
  quoteSpeaker: "Dana",
  quoteLine: 3,
  quoteVerified: true,
  proposedAssigneeId: "u-dev",
  duplicate: null,
};

describe("ProposalsPanel", () => {
  it("is read only for a Developer", async () => {
    client.listProposals.mockResolvedValue({
      proposals: [proposal],
      canReview: false,
    });
    render(<ProposalsPanel project={project} />);

    await screen.findByText("An Owner or Admin reviews these proposals.");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(
      (screen.getByDisplayValue("Ship the login fix") as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it("confirms for a reviewer and removes the card", async () => {
    client.listMembers.mockResolvedValue(members("owner"));
    client.listProposals.mockResolvedValue({
      proposals: [proposal],
      canReview: true,
    });
    client.reviewProposal.mockResolvedValue({ task: task({ key: "NM-4" }) });
    render(<ProposalsPanel project={{ ...project, role: "owner" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(client.reviewProposal).toHaveBeenCalledWith("a1", {
        decision: "confirm",
        title: "Ship the login fix",
        assigneeId: "u-dev",
        dueDate: null,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("NM-4 created"),
    );
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Ship the login fix")).toBeNull(),
    );
  });
});
