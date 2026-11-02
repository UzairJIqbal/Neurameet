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
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
}));
vi.mock("@/lib/project-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-client")>(
    "@/lib/project-client",
  );
  return { ...actual, ...client };
});

import { ProjectClientError } from "@/lib/project-client";
import InviteDialog from "./InviteDialog";
import InviteView from "./InviteView";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const roleOptions = () =>
  Array.from((screen.getByLabelText("Role") as HTMLSelectElement).options).map(
    (o) => o.value,
  );

describe("InviteDialog role picker", () => {
  const open = (myRole: "owner" | "admin") =>
    render(
      <InviteDialog
        projectId="p1"
        myRole={myRole}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

  it("offers Admin to the Owner on an email invite", () => {
    open("owner");
    expect(roleOptions()).toEqual(["admin", "developer", "viewer"]);
  });

  it("never offers Admin on a link invite", () => {
    open("owner");
    fireEvent.click(screen.getByLabelText("By link"));
    expect(roleOptions()).toEqual(["developer", "viewer"]);
  });

  it("never offers Admin to an Admin", () => {
    open("admin");
    expect(roleOptions()).toEqual(["developer", "viewer"]);
  });

  it("shows the link once and says when the email was not sent", async () => {
    client.createInvitation.mockResolvedValue({
      invitation: {},
      link: "https://app/invite/abc",
      emailSent: false,
    });
    open("owner");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "b@x.com" },
    });
    fireEvent.click(screen.getByText("Send invite"));
    expect(
      await screen.findByText("Email not sent, copy the link"),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Invite link") as HTMLInputElement).value,
    ).toBe("https://app/invite/abc");
    expect(client.createInvitation).toHaveBeenCalledWith("p1", {
      kind: "email",
      role: "developer",
      email: "b@x.com",
    });
  });

  it("a sent email shows no warning", async () => {
    client.createInvitation.mockResolvedValue({
      invitation: {},
      link: "https://app/invite/abc",
      emailSent: true,
    });
    open("owner");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "b@x.com" },
    });
    fireEvent.click(screen.getByText("Send invite"));
    await screen.findByLabelText("Invite link");
    expect(screen.queryByText("Email not sent, copy the link")).toBeNull();
  });
});

describe("InviteView states", () => {
  const preview = (over: Record<string, unknown> = {}) =>
    client.previewInvitation.mockResolvedValue({
      projectName: "Core",
      role: "developer",
      kind: "email",
      status: "valid",
      ...over,
    });

  it("valid shows the project, role, and Join; joining goes to the project", async () => {
    preview();
    client.acceptInvitation.mockResolvedValue({
      status: "joined",
      projectId: "p1",
    });
    render(<InviteView token="tok" />);
    expect(await screen.findByText("Core")).toBeTruthy();
    expect(screen.getByText(/invited as Developer/)).toBeTruthy();
    fireEvent.click(screen.getByText("Join"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/p1"));
  });

  it("a link invite becomes Waiting for approval after asking", async () => {
    preview({ kind: "link" });
    client.acceptInvitation.mockResolvedValue({
      status: "pending",
      projectId: "p1",
    });
    render(<InviteView token="tok" />);
    fireEvent.click(await screen.findByText("Ask to join"));
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
    expect(screen.queryByText("Ask to join")).toBeNull();
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
    fireEvent.click(await screen.findByText("Join"));
    expect(
      await screen.findByText("This invite is for a different email"),
    ).toBeTruthy();
  });
});
