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
import type {
  ProjectDetail,
  ProjectMembersResponse,
} from "@/lib/project-types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const client = vi.hoisted(() => ({
  createProject: vi.fn(),
  listMembers: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  transferOwnership: vi.fn(),
  deleteProject: vi.fn(),
  listInvitations: vi.fn(),
  listJoinRequests: vi.fn(),
}));
vi.mock("@/lib/project-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-client")>(
    "@/lib/project-client",
  );
  return { ...actual, ...client };
});

import { ProjectClientError } from "@/lib/project-client";
import CreateProjectDialog from "./CreateProjectDialog";
import MembersTab from "./MembersTab";

const project: ProjectDetail = {
  id: "p1",
  name: "NeuraMeet Core",
  taskPrefix: "NM",
  role: "owner",
  memberCount: 3,
  meetingCount: 2,
  createdAt: "2026-11-01T00:00:00Z",
};

function membersAs(myRole: "owner" | "developer"): ProjectMembersResponse {
  const me = myRole === "owner" ? "u-owner" : "u-dev";
  return {
    me,
    myRole,
    members: [
      {
        userId: "u-owner",
        role: "owner",
        joinedAt: "2026-11-01T00:00:00Z",
        name: "Olivia",
        email: "o@x.dev",
        imageUrl: null,
        githubLogin: null,
        openTaskCount: 0,
      },
      {
        userId: "u-admin",
        role: "admin",
        joinedAt: "2026-11-02T00:00:00Z",
        name: "Adam",
        email: null,
        imageUrl: null,
        githubLogin: null,
        openTaskCount: 0,
      },
      {
        userId: "u-dev",
        role: "developer",
        joinedAt: "2026-11-02T00:00:00Z",
        name: "Dana",
        email: "d@x.dev",
        imageUrl: null,
        githubLogin: null,
        openTaskCount: 0,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  client.listInvitations.mockResolvedValue({ invitations: [] });
  client.listJoinRequests.mockResolvedValue({ requests: [] });
});
afterEach(cleanup);

describe("CreateProjectDialog", () => {
  it("suggests the prefix from the name until you edit it", () => {
    render(<CreateProjectDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    const name = screen.getByPlaceholderText("e.g. NeuraMeet Core");
    const prefix = screen.getByPlaceholderText("NM") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "NeuraMeet Core" } });
    expect(prefix.value).toBe("NC");
    fireEvent.change(prefix, { target: { value: "NM" } });
    fireEvent.change(name, { target: { value: "Something Else" } });
    expect(prefix.value).toBe("NM");
  });

  it("shows a 422 prefix message under the prefix field", async () => {
    client.createProject.mockRejectedValue(
      new ProjectClientError(422, "Prefix must be 2 to 5 capital letters"),
    );
    const onCreated = vi.fn();
    render(<CreateProjectDialog onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. NeuraMeet Core"), {
      target: { value: "Core" },
    });
    fireEvent.change(screen.getByPlaceholderText("NM"), {
      target: { value: "nm1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Prefix must be 2 to 5 capital letters",
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("CreateProjectDialog success", () => {
  const card = { id: "p9", name: "Core" };

  it("offers Connect GitHub only when you asked for it, and goes to the tab", async () => {
    client.createProject.mockResolvedValue({ project: card });
    const onCreated = vi.fn();
    render(<CreateProjectDialog onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. NeuraMeet Core"), {
      target: { value: "Core" },
    });
    fireEvent.change(screen.getByPlaceholderText("NM"), {
      target: { value: "CR" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Connect GitHub next" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect GitHub" }),
    );
    expect(onCreated).toHaveBeenCalledWith(card);
    expect(push).toHaveBeenCalledWith("/projects/p9?tab=github");
  });

  it("shows only Open project by default", async () => {
    client.createProject.mockResolvedValue({ project: card });
    render(<CreateProjectDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. NeuraMeet Core"), {
      target: { value: "Core" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    expect(
      await screen.findByRole("button", { name: "Open project" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect GitHub" })).toBeNull();
  });
});

describe("MembersTab", () => {
  it("gives a Developer no role or remove controls, only Leave", async () => {
    client.listMembers.mockResolvedValue(membersAs("developer"));
    render(
      <MembersTab
        project={{ ...project, role: "developer" }}
        onProjectChanged={vi.fn()}
      />,
    );
    await screen.findByText("Olivia");
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for Dana" }),
      {
        key: "Enter",
      },
    );
    expect(
      await screen.findByRole("menuitem", { name: "Leave project" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Actions for Olivia" }),
    ).toBeNull();
    expect(screen.queryByText("Delete project")).toBeNull();
  });

  it("gives the Owner role selects for others but not for themselves", async () => {
    client.listMembers.mockResolvedValue(membersAs("owner"));
    render(<MembersTab project={project} onProjectChanged={vi.fn()} />);
    await screen.findByLabelText("Role for Adam");
    expect(screen.getByLabelText("Role for Adam")).toBeTruthy();
    expect(screen.getByLabelText("Role for Dana")).toBeTruthy();
    expect(screen.queryByLabelText("Role for Olivia")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Actions for Olivia" }),
    ).toBeNull();
  });

  it("filters by search and by role chip, with counts", async () => {
    client.listMembers.mockResolvedValue(membersAs("owner"));
    render(<MembersTab project={project} onProjectChanged={vi.fn()} />);
    await screen.findByText("Dana");
    expect(screen.getByRole("button", { name: "All (3)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Admins (1)" }));
    expect(screen.getByText("Adam")).toBeTruthy();
    expect(screen.queryByText("Dana")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All (3)" }));
    fireEvent.change(screen.getByLabelText("Search members"), {
      target: { value: "d@x" },
    });
    expect(screen.getByText("Dana")).toBeTruthy();
    expect(screen.queryByText("Adam")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search members"), {
      target: { value: "nobody" },
    });
    expect(screen.getByText("No members match your search.")).toBeTruthy();
  });

  it("shows the GitHub username and open task count", async () => {
    const data = membersAs("owner");
    data.members[2] = {
      ...data.members[2],
      githubLogin: "dana-dev",
      openTaskCount: 4,
    };
    client.listMembers.mockResolvedValue(data);
    render(<MembersTab project={project} onProjectChanged={vi.fn()} />);
    expect(await screen.findByText("dana-dev")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("asks before removing someone", async () => {
    client.listMembers.mockResolvedValue(membersAs("owner"));
    client.removeMember.mockResolvedValue({});
    render(<MembersTab project={project} onProjectChanged={vi.fn()} />);
    await screen.findByText("Dana");
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for Dana" }),
      {
        key: "Enter",
      },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(client.removeMember).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "Remove Dana" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(client.removeMember).toHaveBeenCalledWith(project.id, "u-dev"),
    );
  });

  it("keeps the empty state for a project of one", async () => {
    const data = membersAs("owner");
    data.members = [data.members[0]];
    client.listMembers.mockResolvedValue(data);
    const onAdd = vi.fn();
    render(
      <MembersTab
        project={project}
        onProjectChanged={vi.fn()}
        onAddMember={onAdd}
      />,
    );
    expect(await screen.findByText("Only you are here so far.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Member" }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("shows a load error when the list fails", async () => {
    client.listMembers.mockRejectedValue(new Error("down"));
    render(<MembersTab project={project} onProjectChanged={vi.fn()} />);
    expect(
      await screen.findByText("We couldn't load the members."),
    ).toBeTruthy();
  });
});
