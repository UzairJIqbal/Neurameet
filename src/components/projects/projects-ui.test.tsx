// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
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
      },
      {
        userId: "u-admin",
        role: "admin",
        joinedAt: "2026-11-02T00:00:00Z",
        name: "Adam",
        email: null,
      },
      {
        userId: "u-dev",
        role: "developer",
        joinedAt: "2026-11-02T00:00:00Z",
        name: "Dana",
        email: "d@x.dev",
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
    expect(prefix.value).toBe("NMC");
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
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Prefix must be 2 to 5 capital letters",
    );
    expect(onCreated).not.toHaveBeenCalled();
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
    expect(screen.getByRole("button", { name: "Leave project" })).toBeTruthy();
    expect(screen.queryByText("Delete project")).toBeNull();
  });

  it("gives the Owner role selects for others but not for themselves", async () => {
    client.listMembers.mockResolvedValue(membersAs("owner"));
    render(<MembersTab project={project} onProjectChanged={vi.fn()} />);
    await screen.findByLabelText("Role for Adam");
    expect(screen.getByLabelText("Role for Adam")).toBeTruthy();
    expect(screen.getByLabelText("Role for Dana")).toBeTruthy();
    expect(screen.queryByLabelText("Role for Olivia")).toBeNull();
    expect(screen.queryByRole("button", { name: "Leave project" })).toBeNull();
  });

  it("enables Delete project only when the typed name matches exactly", async () => {
    client.listMembers.mockResolvedValue(membersAs("owner"));
    client.deleteProject.mockResolvedValue({ ok: true });
    render(<MembersTab project={project} onProjectChanged={vi.fn()} />);
    await screen.findByLabelText("Role for Adam");
    const button = screen.getByRole("button", {
      name: "Delete project",
    }) as HTMLButtonElement;
    const input = screen.getByLabelText("Type the project name to confirm");
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "neurameet core" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "NeuraMeet Core" } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() =>
      expect(client.deleteProject).toHaveBeenCalledWith("p1", "NeuraMeet Core"),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects"));
  });

  it("offers only Admins as the new owner", async () => {
    client.listMembers.mockResolvedValue(membersAs("owner"));
    render(<MembersTab project={project} onProjectChanged={vi.fn()} />);
    const select = (await screen.findByLabelText(
      "New owner",
    )) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toEqual(["Choose an Admin", "Adam"]);
  });
});
