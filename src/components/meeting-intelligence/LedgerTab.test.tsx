// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import toast from "react-hot-toast";
import LedgerTab from "./LedgerTab";
import { LEDGER_MATCH_FAILED_MESSAGE } from "@/lib/ledger-match-client";
import type {
  LedgerIncomingLink,
  LedgerItemView,
  LedgerLinkState,
  LedgerRelation,
  LedgerResponse,
} from "@/lib/meeting-types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const incoming = (
  id: string,
  relation: LedgerRelation,
  state: LedgerLinkState,
): LedgerIncomingLink => ({
  id,
  itemId: `item-${id}`,
  evidenceMeetingId: "m2",
  relation,
  quote: `new quote ${id}`,
  speaker: "Ali",
  lineNumber: 4,
  confidence: 0.9,
  state,
  decidedAt: state === "suggested" ? null : "2026-10-30T00:00:00.000Z",
  createdAt: "2026-10-30T00:00:00.000Z",
  item: {
    id: `item-${id}`,
    meetingId: "m1",
    actionItemId: null,
    kind: "decision",
    statement: `Statement ${id}`,
    quote: `earlier quote ${id}`,
    quoteLanguage: "en",
    speaker: "Sara",
    assignee: null,
    dueDate: null,
    lineNumber: 2,
    status: "open",
    createdAt: "2026-10-01T00:00:00.000Z",
  },
  sourceMeeting: {
    id: "m1",
    title: "Kickoff",
    startedAt: "2026-10-01T00:00:00.000Z",
  },
});

const response = (
  links: LedgerIncomingLink[],
  reversalCount = 0,
): LedgerResponse => ({
  items: [],
  incoming: links,
  reversalCount,
});

let ledgerResponses: LedgerResponse[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/review")) {
      return { ok: true, json: async () => ({}) };
    }
    const next =
      ledgerResponses.length > 1 ? ledgerResponses.shift() : ledgerResponses[0];
    return { ok: true, json: async () => next };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(toast.error).mockClear();
});

const ledgerCalls = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith("/api/ledger?"),
  );

describe("LedgerTab review (slice 3)", () => {
  it("shows Confirm and Not a match on a suggested link", async () => {
    ledgerResponses = [response([incoming("a", "kept", "suggested")])];
    render(<LedgerTab meetingId="m2" />);
    expect(await screen.findByRole("button", { name: "Confirm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not a match" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("shows Undo on a confirmed link", async () => {
    ledgerResponses = [response([incoming("a", "kept", "confirmed")])];
    render(<LedgerTab meetingId="m2" />);
    expect(await screen.findByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("posts the decision to the link's review route, then refetches", async () => {
    ledgerResponses = [
      response([incoming("a", "kept", "suggested")]),
      response([incoming("a", "kept", "confirmed")]),
    ];
    render(<LedgerTab meetingId="m2" />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByRole("button", { name: "Undo" })).toBeTruthy();
    const reviewCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/review"),
    );
    expect(reviewCall?.[0]).toBe("/api/ledger/links/a/review");
    expect(JSON.parse(String((reviewCall?.[1] as RequestInit).body))).toEqual({
      decision: "confirm",
    });
    expect(ledgerCalls()).toHaveLength(2);
  });

  it("shows the reversal card only when reversalCount is above 0", async () => {
    ledgerResponses = [response([incoming("a", "kept", "suggested")])];
    render(<LedgerTab meetingId="m2" />);
    await screen.findByRole("button", { name: "Confirm" });
    expect(screen.queryByText(/reversed in this meeting/)).toBeNull();
    cleanup();

    ledgerResponses = [response([incoming("b", "reversed", "suggested")], 1)];
    render(<LedgerTab meetingId="m2" />);
    expect(
      await screen.findByText(
        "1 earlier decision was reversed in this meeting",
      ),
    ).toBeTruthy();
  });

  it("hands the reversal count to onReversalCount", async () => {
    ledgerResponses = [
      response(
        [
          incoming("b", "reversed", "suggested"),
          incoming("c", "reversed", "confirmed"),
        ],
        2,
      ),
    ];
    const onReversalCount = vi.fn();
    render(<LedgerTab meetingId="m2" onReversalCount={onReversalCount} />);
    await waitFor(() => expect(onReversalCount).toHaveBeenCalledWith(2));
    expect(
      screen.getByText("2 earlier decisions were reversed in this meeting"),
    ).toBeTruthy();
  });
});

const ownItem = (overrides: Partial<LedgerItemView> = {}): LedgerItemView => ({
  id: "own-1",
  meetingId: "m2",
  actionItemId: null,
  kind: "promise",
  statement: "Ali sends the survey",
  quote: "main Friday tak survey bhej dunga",
  quoteLanguage: "mixed",
  speaker: "Ali",
  assignee: "Ali",
  dueDate: "2026-10-02",
  lineNumber: 8,
  status: "open",
  createdAt: "2026-10-01T00:00:00.000Z",
  derivedStatus: "open",
  links: [],
  ...overrides,
});

// Routes every call: the ledger GET, review POSTs, and the match POST.
const routeFetch = (handlers: {
  ledger?: () => unknown;
  review?: () => unknown;
  match?: () => unknown;
}) =>
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("/review"))
      return handlers.review?.() ?? { ok: true, json: async () => ({}) };
    if (u === "/api/ledger/match")
      return (
        handlers.match?.() ?? { ok: true, json: async () => ({ matched: 0 }) }
      );
    return (
      handlers.ledger?.() ?? { ok: true, json: async () => ledgerResponses[0] }
    );
  });

describe("LedgerTab said in this meeting (AC-1, AC-10)", () => {
  it("shows the quote, speaker, line, assignee and an Overdue pill", async () => {
    ledgerResponses = [
      {
        items: [ownItem({ derivedStatus: "overdue" })],
        incoming: [],
        reversalCount: 0,
      },
    ];
    render(<LedgerTab meetingId="m2" />);

    expect(await screen.findByText("Ali sends the survey")).toBeTruthy();
    expect(screen.getByText("main Friday tak survey bhej dunga")).toBeTruthy();
    expect(screen.getByText("Ali · line 8")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
  });

  it("lists a later meeting link under the item (AC-6)", async () => {
    const link = incoming("x", "kept", "confirmed");
    ledgerResponses = [
      {
        items: [ownItem({ derivedStatus: "kept", links: [link] })],
        incoming: [],
        reversalCount: 0,
      },
    ];
    render(<LedgerTab meetingId="m2" />);

    expect(await screen.findByText("Kept")).toBeTruthy();
    expect(screen.getByText("Later meeting · kept · confirmed")).toBeTruthy();
    expect(screen.getByText("new quote x")).toBeTruthy();
  });

  it("shows both empty states when nothing was found", async () => {
    ledgerResponses = [response([])];
    render(<LedgerTab meetingId="m2" />);
    expect(
      await screen.findByText(
        "No decisions or promises found in this meeting.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("No earlier promises were mentioned here yet."),
    ).toBeTruthy();
  });
});

describe("LedgerTab review failure", () => {
  it("toasts and keeps the card as it was when the review is not saved", async () => {
    ledgerResponses = [response([incoming("a", "kept", "suggested")])];
    routeFetch({
      review: () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LedgerTab meetingId="m2" />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save your review. Try again.",
      ),
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(ledgerCalls()).toHaveLength(1);
  });
});

describe("LedgerTab Check again (AC-6, AC-14)", () => {
  it("runs matching, then reloads the ledger", async () => {
    ledgerResponses = [response([])];
    routeFetch({});
    render(<LedgerTab meetingId="m2" />);

    fireEvent.click(await screen.findByRole("button", { name: "Check again" }));

    await waitFor(() => expect(ledgerCalls()).toHaveLength(2));
    const matchCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/ledger/match",
    );
    expect(JSON.parse(String((matchCall?.[1] as RequestInit).body))).toEqual({
      meetingId: "m2",
    });
  });

  it("shows Checking while matching runs", async () => {
    ledgerResponses = [response([])];
    let finish: (v: unknown) => void = () => {};
    routeFetch({ match: () => new Promise((r) => (finish = r)) });
    render(<LedgerTab meetingId="m2" />);

    fireEvent.click(await screen.findByRole("button", { name: "Check again" }));

    const busy = await screen.findByRole("button", { name: "Checking…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true, json: async () => ({ matched: 0 }) });
    expect(
      await screen.findByRole("button", { name: "Check again" }),
    ).toBeTruthy();
  });

  it("toasts the match failure and keeps the current list (AC-14)", async () => {
    ledgerResponses = [response([incoming("a", "kept", "confirmed")])];
    routeFetch({
      match: () => ({ ok: false, status: 502, json: async () => ({}) }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LedgerTab meetingId="m2" />);

    fireEvent.click(await screen.findByRole("button", { name: "Check again" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(LEDGER_MATCH_FAILED_MESSAGE),
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(ledgerCalls()).toHaveLength(1);
  });
});

describe("LedgerTab loading guard (AC-17)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows LoadError and a toast when the ledger fails, and Retry reloads it", async () => {
    ledgerResponses = [response([])];
    let fail = true;
    routeFetch({
      ledger: () =>
        fail
          ? { ok: false, status: 500, json: async () => ({ error: "boom" }) }
          : { ok: true, json: async () => ledgerResponses[0] },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LedgerTab meetingId="m2" />);

    expect(
      await screen.findByText("We couldn't load the ledger."),
    ).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith("Could not load the ledger.");

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("Matches found in this meeting"),
    ).toBeTruthy();
  });

  it("stops spinning and shows LoadError when the load never settles", async () => {
    vi.useFakeTimers();
    routeFetch({ ledger: () => new Promise(() => {}) });
    render(<LedgerTab meetingId="m2" />);

    expect(screen.queryByText("We couldn't load the ledger.")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(screen.getByText("We couldn't load the ledger.")).toBeTruthy();
  });
});
