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

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const client = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  listInvitations: vi.fn(),
  listJoinRequests: vi.fn(),
  decideJoinRequest: vi.fn(),
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  decideMyInvitation: vi.fn(),
  listMyInvitations: vi.fn(),
  listProjects: vi.fn(),
}));
vi.mock("@/lib/project-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-client")>(
    "@/lib/project-client",
  );
  return { ...actual, ...client };
});

import { ProjectClientError } from "@/lib/project-client";
import AddMembersDialog from "./AddMembersDialog";
import InvitesPanel from "./InvitesPanel";
import InviteView from "./InviteView";
import ProjectList from "./ProjectList";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const radio = (name: RegExp) =>
  screen.getByRole("radio", { name }) as HTMLInputElement;

describe("AddMembersDialog", () => {
  const open = (myRole: "owner" | "admin", onCreated = vi.fn()) =>
    render(
      <AddMembersDialog
        projectId="p1"
        projectName="Core"
        myRole={myRole}
        onClose={vi.fn()}
        onCreated={onCreated}
      />,
    );
  const linkTab = () =>
    fireEvent.click(screen.getByRole("tab", { name: "Invitation link" }));
  const addresses = () => screen.getByLabelText("Email addresses");
  const typeAddress = (value: string) => {
    fireEvent.change(addresses(), { target: { value } });
    fireEvent.keyDown(addresses(), { key: "Enter" });
  };

  it("offers Admin to the Owner on an email invite", () => {
    open("owner");
    expect(radio(/^Admin/).disabled).toBe(false);
    expect(radio(/^Developer/).checked).toBe(true);
  });

  it("disables Admin on the link tab and says approval is always needed", () => {
    open("owner");
    linkTab();
    expect(radio(/^Admin/).disabled).toBe(true);
    expect(
      screen.getByText("The Owner or an Admin always approves link requests."),
    ).toBeTruthy();
  });

  it("falls back to Developer when you pick Admin and then switch to the link tab", async () => {
    client.createInvitation.mockResolvedValue({
      invitation: { id: "i1", expiresAt: "2026-11-14T00:00:00Z" },
      link: "https://app/invite/abc",
    });
    open("owner");
    fireEvent.click(radio(/^Admin/));
    linkTab();
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
    await screen.findByLabelText("Invite link");
    expect(client.createInvitation).toHaveBeenCalledWith("p1", {
      kind: "link",
      role: "developer",
    });
  });

  it("disables Admin for an Admin", () => {
    open("admin");
    expect(radio(/^Admin/).disabled).toBe(true);
  });

  it("splits a pasted list, drops repeats, and caps it at 10", () => {
    open("owner");
    fireEvent.paste(addresses(), {
      clipboardData: { getData: () => "a@x.com, A@x.com b@x.com" },
    });
    expect(screen.getByText("a@x.com")).toBeTruthy();
    expect(screen.getByText("b@x.com")).toBeTruthy();
    expect(screen.queryByText("A@x.com")).toBeNull();
    const many = Array.from({ length: 11 }, (_, i) => `u${i}@x.com`).join(",");
    fireEvent.paste(addresses(), { clipboardData: { getData: () => many } });
    expect(screen.getByText("You can add up to 10 addresses.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(
      10,
    );
  });

  it("reports each address when one of three fails", async () => {
    client.createInvitation.mockImplementation(
      async (_id: string, input: { email?: string }) => {
        if (input.email === "bad") {
          throw new ProjectClientError(422, "Enter a valid email");
        }
        return {
          invitation: { id: "i1" },
          link: `https://app/invite/${input.email}`,
        };
      },
    );
    const onCreated = vi.fn();
    open("owner", onCreated);
    typeAddress("a@x.com");
    typeAddress("bad");
    typeAddress("c@x.com");
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));
    const list = await screen.findByRole("list", { name: "Invite results" });
    expect(list.textContent).toContain("Enter a valid email");
    expect(list.textContent).toContain("Invite created.");
    expect(
      screen.getByRole("button", { name: "Copy link for a@x.com" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy link for c@x.com" }),
    ).toBeTruthy();
    expect(client.createInvitation).toHaveBeenCalledTimes(3);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("sends the text still in the box", async () => {
    client.createInvitation.mockResolvedValue({
      invitation: {},
      link: "https://app/invite/abc",
    });
    open("owner");
    fireEvent.change(addresses(), { target: { value: "b@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));
    await screen.findByRole("list", { name: "Invite results" });
    expect(client.createInvitation).toHaveBeenCalledWith("p1", {
      kind: "email",
      role: "developer",
      email: "b@x.com",
    });
    expect(screen.getByRole("button", { name: "Copy link for b@x.com" })).toBeTruthy();
  });

  it("does not report onCreated when every address fails", async () => {
    client.createInvitation.mockRejectedValue(
      new ProjectClientError(422, "Enter a valid email"),
    );
    const onCreated = vi.fn();
    open("owner", onCreated);
    typeAddress("bad");
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));
    await screen.findByRole("list", { name: "Invite results" });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("generates a link with its expiry and can disable it", async () => {
    client.createInvitation.mockResolvedValue({
      invitation: { id: "i1", expiresAt: "2026-11-14T00:00:00Z" },
      link: "https://app/invite/abc",
    });
    client.revokeInvitation.mockResolvedValue({});
    const onCreated = vi.fn();
    open("owner", onCreated);
    linkTab();
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
    const input = (await screen.findByLabelText(
      "Invite link",
    )) as HTMLInputElement;
    expect(input.value).toBe("https://app/invite/abc");
    expect(screen.getByText(/^Expires /)).toBeTruthy();
    expect(radio(/^Developer/).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(client.revokeInvitation).toHaveBeenCalledWith("p1", "i1"),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Invite link")).toBeNull(),
    );
    expect(onCreated).toHaveBeenCalledTimes(2);
  });
});

describe("InvitesPanel", () => {
  const invite = (over: Record<string, unknown> = {}) => ({
    id: "i1",
    kind: "email",
    email: "b@x.com",
    role: "developer",
    createdBy: "owner",
    createdByName: "Olivia",
    createdAt: "2026-11-01T00:00:00Z",
    expiresAt: "2026-11-14T00:00:00Z",
    ...over,
  });
  const load = (invitations: unknown[], requests: unknown[] = []) => {
    client.listInvitations.mockResolvedValue({ invitations });
    client.listJoinRequests.mockResolvedValue({ requests });
  };
  const show = () =>
    render(<InvitesPanel projectId="p1" onMembersChanged={vi.fn()} />);

  it("offers Resend on an email invite only", async () => {
    load([invite(), invite({ id: "i2", kind: "link", email: null })]);
    show();
    expect(
      await screen.findByRole("button", { name: "Resend invite to b@x.com" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Resend invite to b@x.com" }),
    ).toHaveLength(1);
    expect(screen.getAllByText(/^Invited by Olivia/)).toHaveLength(2);
  });

  it("shows the new link after a resend", async () => {
    load([invite()]);
    client.resendInvitation.mockResolvedValue({
      link: "https://app/invite/new",
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Resend invite to b@x.com" }),
    );
    expect(
      await screen.findByText(/Copy the link and send it yourself/),
    ).toBeTruthy();
    expect(client.resendInvitation).toHaveBeenCalledWith("p1", "i1");
  });

  it("shows join requests with Approve and Reject, and sends deny", async () => {
    load(
      [],
      [
        {
          id: "r1",
          displayName: "Bilal",
          email: null,
          role: "viewer",
          createdAt: "2026-11-01T00:00:00Z",
        },
      ],
    );
    client.decideJoinRequest.mockResolvedValue({});
    show();
    expect(await screen.findByRole("button", { name: "Approve" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(client.decideJoinRequest).toHaveBeenCalledWith("p1", "r1", "deny"),
    );
  });

  it("hides the join requests card when none are waiting", async () => {
    load([]);
    show();
    expect(await screen.findByText("No pending invitations.")).toBeTruthy();
    expect(screen.queryByText("Join requests")).toBeNull();
  });
});

describe("InviteView states", () => {
  const preview = (over: Record<string, unknown> = {}) =>
    client.previewInvitation.mockResolvedValue({
      projectName: "Core",
      role: "developer",
      kind: "email",
      status: "valid",
      inviterName: "Olivia",
      description: "Payments work",
      icon: "folder",
      color: "primary",
      memberCount: 4,
      taskCount: 7,
      meetingCount: 2,
      createdAt: "2026-10-01T00:00:00Z",
      invitedAt: "2026-11-01T00:00:00Z",
      repoConnected: false,
      ...over,
    });

  it("valid shows the project, role, and Accept; accepting goes to the project", async () => {
    preview();
    client.acceptInvitation.mockResolvedValue({
      status: "joined",
      projectId: "p1",
    });
    render(<InviteView token="tok" />);
    expect(await screen.findByText("Core")).toBeTruthy();
    expect(screen.getByText("Olivia invited you to collaborate")).toBeTruthy();
    expect(screen.getByText(/You'll join as/)).toBeTruthy();
    expect(screen.getByText("Developer")).toBeTruthy();
    expect(screen.getByText("Payments work")).toBeTruthy();
    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/p1"));
  });

  it("a link invite becomes Waiting for approval after asking", async () => {
    preview({ kind: "link" });
    client.acceptInvitation.mockResolvedValue({
      status: "pending",
      projectId: "p1",
    });
    render(<InviteView token="tok" />);
    fireEvent.click(await screen.findByText("Accept"));
    expect(await screen.findByText(/Waiting for approval/)).toBeTruthy();
  });

  it("member links to the project", async () => {
    preview({ status: "member", projectId: "p1" });
    render(<InviteView token="tok" />);
    expect(await screen.findByText(/already in this project/)).toBeTruthy();
    expect(screen.getByText("Open the project").getAttribute("href")).toBe(
      "/projects/p1",
    );
  });

  it("pending shows Waiting for approval", async () => {
    preview({ status: "pending", kind: "link" });
    render(<InviteView token="tok" />);
    expect(await screen.findByText(/Waiting for approval/)).toBeTruthy();
    expect(screen.queryByText("Accept")).toBeNull();
  });

  it("gone shows the one plain message", async () => {
    client.previewInvitation.mockRejectedValue(
      new ProjectClientError(410, "This invite is no longer valid"),
    );
    render(<InviteView token="tok" />);
    expect(
      await screen.findByText("This invite is no longer valid"),
    ).toBeTruthy();
  });

  it("a different email shows the server message", async () => {
    preview();
    client.acceptInvitation.mockRejectedValue(
      new ProjectClientError(403, "This invite is for a different email"),
    );
    render(<InviteView token="tok" />);
    fireEvent.click(await screen.findByText("Accept"));
    expect(
      await screen.findByText("This invite is for a different email"),
    ).toBeTruthy();
  });

  it("names a public repo, and hides a private one behind Repository connected", async () => {
    preview({ repoConnected: true, repoName: "acme/open" });
    render(<InviteView token="tok" />);
    expect(await screen.findByText("acme/open")).toBeTruthy();
    cleanup();
    preview({ repoConnected: true });
    render(<InviteView token="tok" />);
    expect(await screen.findByText("Repository connected")).toBeTruthy();
  });

  it("shows no repository row when none is connected", async () => {
    preview();
    render(<InviteView token="tok" />);
    await screen.findByText("Core");
    expect(screen.queryByText("Repository")).toBeNull();
  });

  it("Decline on a link invite just leaves", async () => {
    preview({ kind: "link" });
    render(<InviteView token="tok" />);
    fireEvent.click(await screen.findByText("Decline"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects"));
    expect(client.decideMyInvitation).not.toHaveBeenCalled();
  });

  it("Decline on your email invite records it", async () => {
    preview({ invitationId: "i1", team: [{ name: "Zara", imageUrl: null }] });
    client.decideMyInvitation.mockResolvedValue({
      status: "declined",
      projectId: "p1",
    });
    render(<InviteView token="tok" />);
    fireEvent.click(await screen.findByText("Decline"));
    await waitFor(() =>
      expect(client.decideMyInvitation).toHaveBeenCalledWith("i1", "decline"),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects"));
  });
});

describe("My Projects invitation banner", () => {
  const mine = (id: string, projectName: string) => ({
    id,
    projectId: `project-${id}`,
    projectName,
    description: null,
    icon: "folder",
    color: "primary",
    role: "developer",
    inviterName: "Olivia",
    invitedAt: "2026-11-01T00:00:00Z",
    expiresAt: "2026-11-08T00:00:00Z",
  });

  beforeEach(() => {
    client.listProjects.mockResolvedValue({ projects: [] });
  });

  it("shows nothing without invites or when the load fails", async () => {
    client.listMyInvitations.mockResolvedValue({ invitations: [] });
    render(<ProjectList />);
    await screen.findByText("No projects yet.");
    expect(screen.queryByText("Review invitation")).toBeNull();
    cleanup();
    client.listMyInvitations.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ProjectList />);
    await screen.findByText("No projects yet.");
    expect(screen.queryByText("Review invitation")).toBeNull();
  });

  it("accepting from the banner joins and opens the project", async () => {
    client.listMyInvitations.mockResolvedValue({
      invitations: [mine("i1", "Core")],
    });
    client.decideMyInvitation.mockResolvedValue({
      status: "joined",
      projectId: "project-i1",
    });
    render(<ProjectList />);
    expect(
      await screen.findByText("You have 1 project invitation."),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Review invitation"));
    fireEvent.click(screen.getByRole("button", { name: "Accept Core" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/projects/project-i1"),
    );
  });

  it("declining one leaves the other and updates the count", async () => {
    client.listMyInvitations.mockResolvedValue({
      invitations: [mine("i1", "Core"), mine("i2", "Docs")],
    });
    client.decideMyInvitation.mockResolvedValue({
      status: "declined",
      projectId: "project-i1",
    });
    render(<ProjectList />);
    expect(
      await screen.findByText("You have 2 project invitations."),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Review invitation"));
    fireEvent.click(screen.getByRole("button", { name: "Decline Core" }));
    expect(
      await screen.findByText("You have 1 project invitation."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept Docs" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("drops a row the server says is gone", async () => {
    client.listMyInvitations.mockResolvedValue({
      invitations: [mine("i1", "Core")],
    });
    client.decideMyInvitation.mockRejectedValue(
      new ProjectClientError(410, "This invite is no longer valid"),
    );
    render(<ProjectList />);
    fireEvent.click(await screen.findByText("Review invitation"));
    fireEvent.click(screen.getByRole("button", { name: "Accept Core" }));
    await waitFor(() =>
      expect(screen.queryByText("Review invitation")).toBeNull(),
    );
  });
});
