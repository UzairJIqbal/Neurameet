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
import type { ProjectFull, ProjectMembersResponse } from "@/lib/project-types";
import type { MeetingListItem } from "@/lib/meeting-types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/projects/p1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/MeetingModel", () => ({ default: () => null }));

const client = vi.hoisted(() => ({
  listMembers: vi.fn(),
  transferOwnership: vi.fn(),
  deleteProject: vi.fn(),
  updateProject: vi.fn(),
  listProjectMeetings: vi.fn(),
  listProposals: vi.fn(),
  getProjectLedger: vi.fn(),
  listActivity: vi.fn(),
  listTasks: vi.fn(),
  prepareMeeting: vi.fn(),
}));
vi.mock("@/lib/project-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-client")>(
    "@/lib/project-client",
  );
  return { ...actual, ...client };
});

import { resolveTab, tabsForRole } from "./ProjectDetailView";
import ProjectHeader from "./ProjectHeader";
import OverviewTab, { nextMeetingOf } from "./OverviewTab";
import ProjectSettingsTab from "./ProjectSettingsTab";

const project: ProjectFull = {
  id: "p1",
  name: "NeuraMeet Core",
  taskPrefix: "NM",
  role: "owner",
  memberCount: 3,
  meetingCount: 2,
  createdAt: "2026-11-01T00:00:00Z",
  description: null,
  status: "active",
  projectType: "web",
  icon: "folder",
  color: "primary",
  ownerName: "Olivia",
  avatars: [],
  taskTotals: {
    todo: 1,
    in_progress: 1,
    in_review: 0,
    completed: 2,
    blocked: 0,
  },
  openTaskCount: 2,
  overdueTaskCount: 0,
  upcomingMeetingCount: 1,
  processedMeetingCount: 1,
  decisionCount: 0,
  linkedPrCount: 0,
  github: { connected: false, repos: [], lastSyncedAt: null },
};

const members: ProjectMembersResponse = {
  me: "u-owner",
  myRole: "owner",
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

const meeting = (over: Partial<MeetingListItem>): MeetingListItem =>
  ({
    id: "m1",
    title: "Planning",
    status: "scheduled",
    startedAt: "2026-11-10T10:00:00Z",
    streamCallId: "call-1",
    ...over,
  }) as MeetingListItem;

beforeEach(() => {
  vi.clearAllMocks();
  client.listMembers.mockResolvedValue(members);
  client.listProjectMeetings.mockResolvedValue({ meetings: [meeting({})] });
  client.listProposals.mockResolvedValue({ proposals: [], canReview: true });
  client.getProjectLedger.mockResolvedValue({
    canReview: true,
    reviewCount: 0,
  });
  client.listActivity.mockResolvedValue({ rows: [] });
  client.listTasks.mockResolvedValue({ tasks: [], truncated: {} });
});
afterEach(cleanup);

describe("project tabs", () => {
  it("gives each role the tabs AC-70 lists", () => {
    expect(tabsForRole("owner")).toHaveLength(6);
    expect(tabsForRole("admin")).toHaveLength(6);
    expect(tabsForRole("developer")).toHaveLength(6);
    expect(tabsForRole("developer")).toContain("github");
    const viewer = tabsForRole("viewer");
    expect(viewer).not.toContain("github");
    expect(viewer).not.toContain("assistant");
    expect(viewer).not.toContain("settings");
  });

  it("keeps old links working and sends the rest to Overview", () => {
    expect(resolveTab("board", "viewer")).toBe("tasks");
    expect(resolveTab("proposals", "developer")).toBe("tasks");
    expect(resolveTab("github", "owner")).toBe("github");
    expect(resolveTab("github", "viewer")).toBe("overview");
    expect(resolveTab("settings", "developer")).toBe("overview");
    expect(resolveTab("nonsense", "owner")).toBe("overview");
    expect(resolveTab(null, "owner")).toBe("overview");
  });
});

describe("ProjectHeader", () => {
  const renderHeader = (role: ProjectFull["role"]) =>
    render(
      <ProjectHeader
        project={{ ...project, role }}
        onAddMember={vi.fn()}
        onSchedule={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

  it("shows the Owner both buttons", () => {
    renderHeader("owner");
    expect(screen.getByRole("button", { name: "Add Member" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Schedule Meeting" }),
    ).toBeTruthy();
    expect(screen.getByText("GitHub not connected")).toBeTruthy();
  });

  it("gives a Developer Schedule Meeting but not Add Member", () => {
    renderHeader("developer");
    expect(screen.queryByRole("button", { name: "Add Member" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Schedule Meeting" }),
    ).toBeTruthy();
  });

  it("gives a Viewer neither", () => {
    renderHeader("viewer");
    expect(screen.queryByRole("button", { name: "Add Member" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Schedule Meeting" }),
    ).toBeNull();
  });
});

describe("nextMeetingOf", () => {
  const now = new Date("2026-11-07T00:00:00Z").getTime();

  it("takes the earliest meeting still ahead, never a missed one", () => {
    const missed = meeting({ id: "a", startedAt: "2026-11-01T00:00:00Z" });
    const later = meeting({ id: "b", startedAt: "2026-11-20T00:00:00Z" });
    const soon = meeting({ id: "c", startedAt: "2026-11-08T00:00:00Z" });
    expect(nextMeetingOf([missed, later, soon], now)?.id).toBe("c");
  });

  it("returns null when nothing is ahead", () => {
    expect(nextMeetingOf([meeting({ status: "ended" })], now)).toBeNull();
    expect(nextMeetingOf([], now)).toBeNull();
  });
});

describe("OverviewTab", () => {
  const renderOverview = (role: ProjectFull["role"] = "owner") =>
    render(
      <OverviewTab
        project={{ ...project, role }}
        onSchedule={vi.fn()}
        onAddMember={vi.fn()}
      />,
    );

  it("runs no AI on load, and Prepare calls it once on click", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-11-07T00:00:00Z"),
    });
    client.prepareMeeting.mockResolvedValue({
      suggestions: {
        context: ["A line of context"],
        openActionItems: [],
        discussionPoints: [],
        questionsToAsk: [],
      },
    });
    renderOverview();
    const prepare = await screen.findByRole("button", { name: "Prepare" });
    expect(client.prepareMeeting).not.toHaveBeenCalled();
    fireEvent.click(prepare);
    expect(await screen.findByText("A line of context")).toBeTruthy();
    expect(client.prepareMeeting).toHaveBeenCalledTimes(1);
    expect(client.prepareMeeting).toHaveBeenCalledWith("Planning");
    vi.useRealTimers();
  });

  it("blanks only the card whose call failed", async () => {
    client.listActivity.mockRejectedValue(new Error("boom"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    renderOverview();
    expect(
      await screen.findByText("We couldn't load recent activity."),
    ).toBeTruthy();
    expect(await screen.findByText("Dana")).toBeTruthy();
    consoleError.mockRestore();
  });

  it("hides the review card and Prepare from a Viewer, and asks for no proposals", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-11-07T00:00:00Z"),
    });
    renderOverview("viewer");
    await screen.findByText("Planning");
    expect(screen.queryByText("Waiting for review")).toBeNull();
    expect(screen.queryByRole("button", { name: "Prepare" })).toBeNull();
    expect(client.listProposals).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("ProjectSettingsTab", () => {
  it("enables Delete project only when the typed name matches exactly", async () => {
    client.deleteProject.mockResolvedValue({ ok: true });
    render(<ProjectSettingsTab project={project} onProjectChanged={vi.fn()} />);
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
    render(<ProjectSettingsTab project={project} onProjectChanged={vi.fn()} />);
    const select = (await screen.findByLabelText(
      "New owner",
    )) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Choose an Admin",
      "Adam",
    ]);
  });

  it("shows an Admin the details read only, with no Transfer or Delete", () => {
    render(
      <ProjectSettingsTab
        project={{ ...project, role: "admin" }}
        onProjectChanged={vi.fn()}
      />,
    );
    expect(screen.getByText("Only the Owner changes these.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByText("Transfer ownership")).toBeNull();
    expect(screen.queryByText("Delete project")).toBeNull();
  });
});
