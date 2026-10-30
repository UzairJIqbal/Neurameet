// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import LedgerTab from "./LedgerTab";
import type {
  LedgerIncomingLink,
  LedgerLinkState,
  LedgerRelation,
  LedgerResponse,
} from "@/lib/meeting-types";

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
