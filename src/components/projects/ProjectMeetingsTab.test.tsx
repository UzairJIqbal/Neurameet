// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingListItem } from "@/lib/meeting-types";
import type { ProjectFull } from "@/lib/project-types";
import ProjectMeetingsTab from "./ProjectMeetingsTab";

const { mockListMeetings, mockListMembers } = vi.hoisted(() => ({
  mockListMeetings: vi.fn(),
  mockListMembers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/project-client", () => ({
  listProjectMeetings: mockListMeetings,
  listMembers: mockListMembers,
}));

const HOUR = 3_600_000;
const inHours = (hours: number) =>
  new Date(Date.now() + hours * HOUR).toISOString();

const meeting = (overrides: Partial<MeetingListItem>): MeetingListItem => ({
  id: "m1",
  title: "Standup",
  status: "scheduled",
  startedAt: inHours(24),
  endedAt: null,
  createdAt: inHours(-1),
  category: null,
  hasInsights: false,
  streamCallId: "call_1",
  ...overrides,
});

const project = (role: ProjectFull["role"]) =>
  ({ id: "p1", role }) as unknown as ProjectFull;

const show = async (role: ProjectFull["role"], meetings: MeetingListItem[]) => {
  mockListMeetings.mockResolvedValue({ meetings });
  render(<ProjectMeetingsTab project={project(role)} onSchedule={vi.fn()} />);
  await waitFor(() => expect(mockListMeetings).toHaveBeenCalled());
};

describe("ProjectMeetingsTab (AC-70d)", () => {
  beforeEach(() => {
    mockListMembers.mockResolvedValue({
      members: [{ userId: "u2", name: "Sana Ali", imageUrl: null }],
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the empty state", async () => {
    await show("developer", []);
    expect(await screen.findByText("No project meetings yet.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Schedule Meeting" }),
    ).toBeTruthy();
  });

  it("orders upcoming soonest first, and links Join and View Details", async () => {
    await show("developer", [
      meeting({
        id: "later",
        title: "Later",
        startedAt: inHours(48),
        streamCallId: "c_later",
      }),
      meeting({
        id: "soon",
        title: "Soon",
        startedAt: inHours(2),
        streamCallId: "c_soon",
      }),
      meeting({
        id: "old",
        title: "Old",
        status: "ended",
        startedAt: inHours(-48),
        endedAt: inHours(-47),
      }),
    ]);
    const upcoming = await screen.findByRole("region", { name: "Upcoming" });
    const joins = within(upcoming).getAllByRole("link", { name: "Join" });
    expect(joins.map((a) => a.getAttribute("href"))).toEqual([
      "/meeting/c_soon",
      "/meeting/c_later",
    ]);
    const history = screen.getByRole("region", { name: "Meeting History" });
    expect(
      within(history)
        .getByRole("link", { name: "View Details" })
        .getAttribute("href"),
    ).toBe("/meeting-intelligence/old");
    expect(within(history).getByText(/1 hr/)).toBeTruthy();
  });

  it("labels a scheduled meeting whose start has passed", async () => {
    await show("developer", [meeting({ startedAt: inHours(-2) })]);
    expect(await screen.findByText("Time passed")).toBeTruthy();
  });

  it("filters by search, status, and date on the loaded list", async () => {
    await show("developer", [
      meeting({ id: "a", title: "Alpha review", startedAt: inHours(24) }),
      meeting({
        id: "b",
        title: "Beta sync",
        status: "ended",
        startedAt: inHours(-240),
      }),
    ]);
    await screen.findByText("Alpha review");
    fireEvent.change(screen.getByLabelText("Search meetings"), {
      target: { value: "beta" },
    });
    expect(screen.queryByText("Alpha review")).toBeNull();
    expect(screen.getByText("Beta sync")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search meetings"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Scheduled" }));
    expect(screen.queryByText("Beta sync")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "last7" },
    });
    expect(screen.getByText("No meetings match these filters.")).toBeTruthy();
    expect(mockListMeetings).toHaveBeenCalledTimes(1);
  });

  it("shows review counts to a Developer", async () => {
    await show("developer", [
      meeting({
        status: "ended",
        startedAt: inHours(-24),
        proposalCount: 2,
        summaryExcerpt: "We agreed the plan.",
        decisionCount: 1,
        actionItemCount: 3,
      }),
    ]);
    expect(await screen.findByText("2 tasks to review")).toBeTruthy();
    expect(screen.getByText("2 awaiting review")).toBeTruthy();
    expect(screen.getByText("We agreed the plan.")).toBeTruthy();
  });

  it("hides Schedule and review counts from a Viewer", async () => {
    await show("viewer", [
      meeting({
        status: "ended",
        startedAt: inHours(-24),
        summaryExcerpt: "We agreed the plan.",
        decisionCount: 1,
        actionItemCount: 1,
      }),
    ]);
    await screen.findByText("We agreed the plan.");
    expect(
      screen.queryByRole("button", { name: "Schedule Meeting" }),
    ).toBeNull();
    expect(screen.queryByText(/to review/)).toBeNull();
    expect(screen.queryByText(/awaiting review/)).toBeNull();
  });

  it("still lists meetings when the members load fails", async () => {
    mockListMembers.mockRejectedValue(new Error("nope"));
    await show("developer", [meeting({ invitedUserIds: ["u2"] })]);
    expect(await screen.findByText("Standup")).toBeTruthy();
  });
});
