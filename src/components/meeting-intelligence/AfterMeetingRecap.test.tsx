// @vitest-environment jsdom
//
// Component regression test for the recap-page language selector removal
// (2026-08-23). The "Transcript language" dropdown (Auto-detect / English /
// Urdu) was deleted from AfterMeetingRecap; the Generate Transcript button now
// always downloads the auto-detect language .txt. This test locks that in:
// the selector must be absent, the button present, and the download POST must
// NOT carry a `language` field (the route falls back to auto-detect).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import AfterMeetingRecap from "./AfterMeetingRecap";
import type { MeetingRecap } from "@/lib/meeting-recap";

// The component imports only the `MeetingRecap` TYPE from this module; mock it
// so no server-only / Supabase code is pulled into the jsdom test runtime.
vi.mock("@/lib/meeting-recap", () => ({}));

let mockUser = { id: "user_test", primaryEmailAddress: { emailAddress: "user_test@example.com" } };
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isSignedIn: true, user: mockUser }),
  useClerk: () => ({ redirectToSignIn: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const recap: MeetingRecap = {
  id: "meeting_test",
  title: "Test Meeting",
  description: "",
  status: "ended",
  startedAt: null,
  endedAt: null,
  streamCallId: "call_test",
  createdAt: "2026-08-23T00:00:00.000Z",
  user_id: "user_test",
  participants: [],
};

describe("AfterMeetingRecap transcript language selector", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  afterEach(cleanup);

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/transcript/status")) {
        return { ok: true, json: async () => ({ hasInsights: false }) };
      }
      if (typeof url === "string" && url.includes("/api/transcript/download")) {
        return {
          ok: true,
          json: async () => ({ status: "ok", transcript: "Speaker: hi" }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    // jsdom has no object-URL API; stub it so the download path can run.
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("renders the Generate Transcript button and no language selector", () => {
    render(<AfterMeetingRecap recap={recap} />);

    expect(
      screen.getByRole("button", { name: /generate transcript/i }),
    ).toBeTruthy();
    // The removed control and its helper text must be gone.
    expect(document.querySelector("#transcript-language")).toBeNull();
    expect(screen.queryByText(/transcript language/i)).toBeNull();
    expect(screen.queryByText(/arabic-script/i)).toBeNull();
  });

  it("posts to /api/transcript/download without a language field", async () => {
    render(<AfterMeetingRecap recap={recap} />);

    fireEvent.click(
      screen.getByRole("button", { name: /generate transcript/i }),
    );

    await waitFor(() => {
      const called = fetchMock.mock.calls.some((c) =>
        String(c[0]).includes("/api/transcript/download"),
      );
      expect(called).toBe(true);
    });

    const downloadCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/transcript/download"),
    )!;
    const body = JSON.parse((downloadCall[1] as RequestInit).body as string);

    expect(body).not.toHaveProperty("language");
    expect(body).toEqual({
      meetingId: "meeting_test",
      streamCallId: "call_test",
      streamCallType: "default",
    });
  });
});

// P13.8 (2026-08-30): light responsive verification pass. jsdom has no layout
// engine, so these assert the responsive class tokens are present (a revert
// would drop them). Visual reflow at 375/768 is verified manually via
// /check verify. AfterMeetingRecap was already responsive (stats grid reflows
// 2->3 cols, participant rows and the transcript button row wrap), so the
// deliverable is revert-guard tests for that token pattern.
const recapWithParticipant: MeetingRecap = {
  ...recap,
  startedAt: "2026-08-23T10:00:00.000Z",
  endedAt: "2026-08-23T10:30:00.000Z",
  participants: [
    {
      userId: "user_a",
      name: "Ada Lovelace",
      email: "ada@example.com",
      joinedAt: "2026-08-23T10:00:00.000Z",
      leftAt: "2026-08-23T10:30:00.000Z",
      talkTimeSeconds: 120,
    },
  ],
};

// P13.9 (2026-09-06): guests with null userId must still render as
// distinct rows — React keys must not collide when userId is null.
const recapWithGuestParticipants: MeetingRecap = {
  ...recap,
  startedAt: "2026-08-23T10:00:00.000Z",
  endedAt: "2026-08-23T10:30:00.000Z",
  participants: [
    {
      userId: null,
      name: "Alice Guest",
      email: "alice@example.com",
      joinedAt: "2026-08-23T10:00:00.000Z",
      leftAt: "2026-08-23T10:30:00.000Z",
      talkTimeSeconds: 30,
    },
    {
      userId: null,
      name: "Bob Guest",
      email: "bob@example.com",
      joinedAt: "2026-08-23T10:05:00.000Z",
      leftAt: "2026-08-23T10:25:00.000Z",
      talkTimeSeconds: 20,
    },
  ],
};

describe("AfterMeetingRecap responsive (P13.8)", () => {
  afterEach(cleanup);

  it("stats grid reflows 2 columns on mobile to 3 at sm+", () => {
    render(<AfterMeetingRecap recap={recap} />);
    const card = screen.getByText(/total time/i).closest("div") as HTMLElement;
    const grid = card.parentElement as HTMLElement;
    const tokens = grid.className.split(" ");
    expect(tokens).toContain("grid");
    expect(tokens).toContain("grid-cols-2");
    expect(tokens).toContain("gap-4");
    expect(tokens).toContain("sm:grid-cols-3");
  });

  it("participant row lays out name and time with gap-4 on mobile", () => {
    render(<AfterMeetingRecap recap={recapWithParticipant} />);
    // The name also appears in the call timeline, so pick the one inside a <li>
    // (the participants list row), not the timeline.
    const name = screen
      .getAllByText("Ada Lovelace")
      .map((n) => n.closest("li"))
      .find((el): el is HTMLLIElement => el !== null) as HTMLElement;
    const tokens = name.className.split(" ");
    expect(tokens).toContain("flex");
    expect(tokens).toContain("items-center");
    expect(tokens).toContain("justify-between");
    expect(tokens).toContain("gap-4");
  });

  it("transcript action buttons wrap on small screens (flex-wrap)", () => {
    render(<AfterMeetingRecap recap={recap} />);
    const btn = screen.getByRole("button", {
      name: /generate transcript/i,
    }) as HTMLElement;
    const row = btn.parentElement as HTMLElement;
    const tokens = row.className.split(" ");
    expect(tokens).toContain("flex");
    expect(tokens).toContain("flex-wrap");
    expect(tokens).toContain("gap-3");
  });
});

// P13.9 (2026-09-06): after-meeting page must render all participants
// distinctly even when userId is null (guests). React requires unique
// keys; before the fix, key={p.userId} collapsed multiple guests into
// one rendered element.
describe("AfterMeetingRecap renders all participants distinctly", () => {
  afterEach(cleanup);

  it("renders both guest participants in the timeline", () => {
    render(<AfterMeetingRecap recap={recapWithGuestParticipants} />);
    const names = screen.getAllByText("Alice Guest");
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it("renders both guest participants in the participants list", () => {
    render(<AfterMeetingRecap recap={recapWithGuestParticipants} />);
    const listItems = screen.getAllByRole("listitem");
    // Each guest is one <li> plus the timeline rows are <div> not <li>.
    // The participants section has exactly 2 <li> elements.
    const participantLis = listItems.filter(
      (el) =>
        el.textContent?.includes("Alice Guest") ||
        el.textContent?.includes("Bob Guest"),
    );
    expect(participantLis.length).toBe(2);
  });
});

describe("AfterMeetingRecap keeps attendee emails private", () => {
  afterEach(cleanup);

  it("never renders participant emails on the public recap", () => {
    render(<AfterMeetingRecap recap={recapWithGuestParticipants} />);
    expect(screen.queryByText(/@example\.com/)).toBeNull();
  });
});

describe("AfterMeetingRecap call timeline presence and talk time clarity", () => {
  afterEach(cleanup);

  const recapWithLobbyGap: MeetingRecap = {
    ...recap,
    // Meeting created in lobby 15 seconds before host actually joins
    startedAt: "2026-08-23T10:00:00.000Z",
    endedAt: "2026-08-23T10:00:45.000Z",
    participants: [
      {
        userId: "user_test",
        name: "Host User",
        email: "host@example.com",
        joinedAt: "2026-08-23T10:00:15.000Z",
        leftAt: "2026-08-23T10:00:45.000Z",
        talkTimeSeconds: 0,
      },
    ],
  };

  it("anchors timeline to earliest join so host presence spans 100% rather than starting with empty lobby gap", () => {
    render(<AfterMeetingRecap recap={recapWithLobbyGap} />);
    expect(
      screen.getByText(/Participant presence across the meeting duration/i),
    ).toBeDefined();

    // Check that host presence bar is styled from 0% with 100% width
    const presenceBar = document.querySelector(".bg-primary[style*='left']") as HTMLElement;
    expect(presenceBar).toBeDefined();
    expect(presenceBar.style.left).toBe("0%");
    expect(presenceBar.style.width).toBe("100%");
  });

  it("explicitly shows 0s talk time when participant did not speak", () => {
    render(<AfterMeetingRecap recap={recapWithLobbyGap} />);
    expect(screen.getByText(/0s talk time/i)).toBeDefined();
  });
});

// F-series regression (2026-09-19): after-meeting page must NEVER show
// the "Recordings are still being processed" message and the "No recording
// was captured" message simultaneously. Before the fix, `noRecordingTimedOut`
// guarded message 3 on its own — any transient render where noRecordingTimedOut
// was true while gen was still "pending" caused both messages to appear.
describe("AfterMeetingRecap — no contradictory transcript messages (F-series regression)", () => {
  afterEach(cleanup);

  it("shows only the timed-out message after poll cap, never both simultaneously", async () => {
    vi.useFakeTimers();

    const noRecordingFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "no_recording", message: "no recordings yet" }),
    }));
    vi.stubGlobal("fetch", noRecordingFetch);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });

    render(<AfterMeetingRecap recap={recap} />);

    // Click Generate — enters "pending" state and starts the poll.
    fireEvent.click(screen.getByRole("button", { name: /generate transcript/i }));

    // Allow the initial fetch to resolve.
    await vi.runAllTimersAsync();

    // Simulate 20 poll ticks (NO_RECORDING_POLL_CAP) at 15s intervals.
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(15000);
    }

    // After cap: the "processing" message must be gone.
    expect(
      screen.queryByText(/recordings are still being processed/i),
    ).toBeNull();

    // And only the timed-out message must appear.
    expect(
      screen.getByText(/no recording was captured for this meeting/i),
    ).toBeTruthy();

    vi.useRealTimers();
  });
});

describe("AfterMeetingRecap polling never overlaps a running request", () => {
  afterEach(cleanup);

  it("skips poll ticks while a download request is still in flight", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          json: async () => ({ status: "no_recording", message: "wait" }),
        };
      }
      // The first poll request hangs for 40s (longer than two poll ticks).
      await new Promise((r) => setTimeout(r, 40000));
      return { ok: true, json: async () => ({ status: "no_recording" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AfterMeetingRecap recap={recap} />);
    fireEvent.click(screen.getByRole("button", { name: /generate transcript/i }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Tick 1 starts the slow request; ticks 2 and 3 land while it is running.
    await vi.advanceTimersByTimeAsync(45000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
