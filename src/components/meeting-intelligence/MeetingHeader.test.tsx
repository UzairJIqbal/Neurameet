// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { MeetingDetailData } from "@/lib/meeting-types";
import MeetingHeader from "./MeetingHeader";

const meeting: MeetingDetailData = {
  id: "m1",
  title: "Auth review",
  status: "ended",
  streamCallId: "c1",
  startedAt: "2026-11-09T10:00:00Z",
  endedAt: "2026-11-09T11:30:00Z",
  createdAt: "2026-11-01T10:00:00Z",
  user_id: "u1",
  guestAdmissionMode: "approval",
  description: "Pick an auth approach",
  scheduledEndAt: null,
  meetingType: "architecture",
  organizerName: "Ali Hassan",
  invitedUserIds: ["u2"],
};

const insights = {
  summary: "We picked Clerk.",
  keyPoints: [],
  decisions: [],
  category: "Engineering",
  detectedTopics: [],
};

const member = (userId: string, name: string) => ({
  userId,
  name,
  role: "developer",
  joinedAt: "",
  email: null,
  imageUrl: null,
  githubLogin: null,
  openTaskCount: 0,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stubMembers = (ok = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => ({
        members: [
          member("u1", "Ali Hassan"),
          member("u2", "Sara"),
          member("u3", "Bilal"),
        ],
        myRole: "owner",
        me: "u1",
      }),
    })),
  );

describe("MeetingHeader (spec 0004 AC-70v)", () => {
  it("shows the type chip, project chip, organiser, description, and duration", async () => {
    stubMembers();
    render(
      <MeetingHeader
        meeting={meeting}
        insights={insights}
        projectId="p1"
        projectName="Atlas"
      />,
    );
    expect(screen.getByText("Architecture")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Atlas/ }).getAttribute("href"),
    ).toBe("/projects/p1");
    expect(screen.getByText(/Organised by Ali Hassan/)).toBeTruthy();
    expect(screen.getByText("Pick an auth approach")).toBeTruthy();
    expect(screen.getByText(/1 h 30 min/)).toBeTruthy();
    expect(await screen.findByText("Sara")).toBeTruthy();
    expect(screen.getByText("organizer")).toBeTruthy();
    expect(screen.queryByText("Bilal")).toBeNull();
  });

  it("offers Export summary only when a summary exists", () => {
    stubMembers();
    const { rerender } = render(
      <MeetingHeader
        meeting={meeting}
        insights={insights}
        projectId={null}
        projectName={null}
      />,
    );
    expect(screen.getByRole("button", { name: /Export summary/ })).toBeTruthy();
    rerender(
      <MeetingHeader
        meeting={meeting}
        insights={null}
        projectId={null}
        projectName={null}
      />,
    );
    expect(screen.queryByRole("button", { name: /Export summary/ })).toBeNull();
  });

  it("loads no members on a personal meeting", () => {
    stubMembers();
    render(
      <MeetingHeader
        meeting={meeting}
        insights={null}
        projectId={null}
        projectName={null}
      />,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Participants")).toBeNull();
  });

  it("hides participants when the list fails to load", async () => {
    stubMembers(false);
    render(
      <MeetingHeader
        meeting={meeting}
        insights={null}
        projectId="p1"
        projectName="Atlas"
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText("Participants")).toBeNull();
  });
});
