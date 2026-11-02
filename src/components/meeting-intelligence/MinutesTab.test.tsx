// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MinutesTab from "./MinutesTab";
import type {
  MinutesDraft,
  MinutesResponse,
  MinutesReviewState,
} from "@/lib/minutes-types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const draft: MinutesDraft = {
  version: 1,
  lines: [
    {
      section: "summary",
      text: "Hosting was discussed",
      evidence: [
        { quote: "We go with Vercel", lineNumber: 1, speaker: "Sara" },
      ],
      supported: true,
      speakerLabels: ["Sara"],
      actionItemId: null,
      assignee: null,
    },
    {
      section: "decision",
      text: "Move to AWS",
      evidence: [],
      supported: false,
      speakerLabels: [],
      actionItemId: null,
      assignee: null,
    },
    {
      section: "action_item",
      text: "Send the survey",
      evidence: [{ quote: "survey bhej dunga", lineNumber: 2, speaker: null }],
      supported: true,
      speakerLabels: [],
      actionItemId: "ai-1",
      assignee: "Ali",
    },
  ],
  dissentSuggestions: [],
  coverage: { lastLine: 2, totalLines: 3 },
};

const reviewState = (
  over: Partial<MinutesReviewState> = {},
): MinutesReviewState => ({
  state: "review",
  status: "open",
  reviewId: "r1",
  isOwner: false,
  myUserId: "p1",
  deadlineAt: "2026-11-11T18:59:59Z",
  deadlineDays: 7,
  coverageText: "These minutes cover transcript lines 1 to 2 of 3",
  transcriptSource: "upload",
  lines: [
    {
      id: "l1",
      position: 0,
      section: "decision",
      text: "Use Vercel",
      evidence: [
        {
          quote: "We go with Vercel",
          lineNumber: 1,
          speaker: "Ali",
          lineText: "Ali: We go with Vercel",
        },
      ],
      supported: true,
      speakerLabels: ["Ali"],
      assignee: null,
      mine: true,
      canView: true,
      myAnswer: null,
      answers: [],
    },
  ],
  speakers: [
    {
      key: "ali",
      label: "Ali",
      holderId: "p1",
      holderName: "Ali",
      claimedBy: "self",
      locked: false,
      suggested: false,
    },
    {
      key: "bilal",
      label: "Bilal",
      holderId: null,
      holderName: null,
      claimedBy: null,
      locked: false,
      suggested: true,
    },
  ],
  attesters: [
    { userId: "owner", displayName: "Sara", isOwner: true, done: false },
    { userId: "p1", displayName: "Ali", isOwner: false, done: false },
  ],
  mySuggestions: [],
  progress: { done: 0, total: 2 },
  myDoneAt: null,
  sealBlocker: null,
  seal: null,
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
const respond = (body: MinutesResponse | { error: string }, ok = true) =>
  fetchMock.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MinutesTab", () => {
  it("groups the draft by section with line numbers, speakers, and coverage", async () => {
    respond({ state: "draft", draft, transcriptSource: "upload" });
    render(<MinutesTab meetingId="m1" />);

    expect(
      await screen.findByText(
        "These minutes cover transcript lines 1 to 2 of 3",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Summary" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Decisions" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Action items" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Key points" })).toBeNull();
    expect(screen.getByText("Line 1 · Sara")).toBeTruthy();
    expect(screen.getByText("Line 2")).toBeTruthy();
    expect(screen.getByText("Ali")).toBeTruthy();
    expect(screen.getAllByText("Unsupported")).toHaveLength(1);
    expect(
      screen.queryByText("Quotes are English translations of the recording"),
    ).toBeNull();
    expect(
      screen.getByText(
        "Each attendee confirms the lines they said before you seal.",
      ),
    ).toBeTruthy();
  });

  it("opens a review with the chosen deadline and shows it", async () => {
    respond({ state: "draft", draft, transcriptSource: "upload" });
    render(<MinutesTab meetingId="m1" />);
    const open = await screen.findByRole("button", { name: "Open review" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "7" } });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ reviewId: "r1" }),
    });
    respond(reviewState());
    fireEvent.click(open);
    expect(await screen.findByText("Your lines")).toBeTruthy();
    const [path, init] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(path).toBe("/api/minutes/review");
    expect(JSON.parse(init.body)).toEqual({
      meetingId: "m1",
      action: "open",
      deadlineDays: 7,
    });
  });

  it("shows your lines with Confirm and Correct, and blocks Finish until you answer", async () => {
    respond(reviewState());
    render(<MinutesTab meetingId="m1" />);
    expect(await screen.findByText("Your lines")).toBeTruthy();
    expect(screen.getByText("Yours")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Correct" })).toBeTruthy();
    expect(screen.getByText("Answer your lines first (1 left)")).toBeTruthy();
    const finish = screen.getByRole("button", {
      name: "Finish my review",
    }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    expect(screen.getByText("This looks like you")).toBeTruthy();
  });

  it("confirms a line and refetches", async () => {
    respond(reviewState());
    render(<MinutesTab meetingId="m1" />);
    const confirm = await screen.findByRole("button", { name: "Confirm" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ answer: {} }),
    });
    respond(reviewState());
    fireEvent.click(confirm);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [path, init] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(path).toBe("/api/minutes/attest");
    expect(JSON.parse(init.body)).toMatchObject({
      meetingId: "m1",
      action: "confirm",
      lineId: "l1",
    });
  });

  it("disables Seal for the owner and says why", async () => {
    respond(
      reviewState({
        isOwner: true,
        sealBlocker: "Finish your own review first.",
      }),
    );
    render(<MinutesTab meetingId="m1" />);
    const seal = (await screen.findByRole("button", {
      name: "Seal the minutes",
    })) as HTMLButtonElement;
    expect(seal.disabled).toBe(true);
    expect(screen.getByText("Finish your own review first.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel review" })).toBeTruthy();
  });

  it("shows the seal, its hash, the check link, and the PDF button once sealed", async () => {
    respond(
      reviewState({
        status: "sealed",
        seal: {
          id: "seal-1",
          hash: "f".repeat(64),
          statusText: "Confirmed by 2 of 3. 1 did not respond.",
          sealedAt: "2026-11-04T08:00:00Z",
          verifyPath: "/minutes/verify/seal-1",
        },
      }),
    );
    render(<MinutesTab meetingId="m1" />);
    expect(await screen.findByText("Sealed minutes")).toBeTruthy();
    expect(
      screen.getByText("Confirmed by 2 of 3. 1 did not respond."),
    ).toBeTruthy();
    expect(screen.getByText("f".repeat(64))).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Check the seal/u })
        .getAttribute("href"),
    ).toBe("/minutes/verify/seal-1");
    expect(screen.getByRole("button", { name: /Download PDF/u })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Finish my review" }),
    ).toBeNull();
  });

  it("notes translated quotes for a recording transcript", async () => {
    respond({ state: "draft", draft, transcriptSource: "recording" });
    render(<MinutesTab meetingId="m1" />);
    expect(
      await screen.findByText(
        "Quotes are English translations of the recording",
      ),
    ).toBeTruthy();
  });

  it("tells a participant the minutes are not open", async () => {
    respond({ state: "not_open" });
    render(<MinutesTab meetingId="m1" />);
    expect(
      await screen.findByText("Minutes not open for review yet"),
    ).toBeTruthy();
  });

  it("explains how to create minutes for an older meeting", async () => {
    respond({ state: "no_draft" });
    render(<MinutesTab meetingId="m1" />);
    expect(
      await screen.findByText(/made before Verified Minutes/),
    ).toBeTruthy();
  });

  it("shows a load error and refetches on retry", async () => {
    respond({ error: "boom" }, false);
    render(<MinutesTab meetingId="m1" />);
    expect(
      await screen.findByText("We couldn't load the minutes."),
    ).toBeTruthy();

    respond({ state: "not_open" });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(
      await screen.findByText("Minutes not open for review yet"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
