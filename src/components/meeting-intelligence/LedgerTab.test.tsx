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
  evidenceKind: "meeting",
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
    source: "transcript",
    agreedCount: null,
    totalCount: null,
  },
  sourceMeeting: {
    id: "m1",
    title: "Kickoff",
    startedAt: "2026-10-01T00:00:00.000Z",
  },
  liveMark: null,
});

const response = (
  links: LedgerIncomingLink[],
  reversalCount = 0,
): LedgerResponse => ({
  items: [],
  incoming: links,
  liveOnly: [],
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
    render(<LedgerTab canManage meetingId="m2" />);
    expect(await screen.findByRole("button", { name: "Confirm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not a match" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("shows Undo on a confirmed link", async () => {
    ledgerResponses = [response([incoming("a", "kept", "confirmed")])];
    render(<LedgerTab canManage meetingId="m2" />);
    expect(await screen.findByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("posts the decision to the link's review route, then refetches", async () => {
    ledgerResponses = [
      response([incoming("a", "kept", "suggested")]),
      response([incoming("a", "kept", "confirmed")]),
    ];
    render(<LedgerTab canManage meetingId="m2" />);
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
    render(<LedgerTab canManage meetingId="m2" />);
    await screen.findByRole("button", { name: "Confirm" });
    expect(screen.queryByText(/reversed in this meeting/)).toBeNull();
    cleanup();

    ledgerResponses = [response([incoming("b", "reversed", "suggested")], 1)];
    render(<LedgerTab canManage meetingId="m2" />);
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
    render(<LedgerTab canManage meetingId="m2" onReversalCount={onReversalCount} />);
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
  source: "transcript",
  agreedCount: null,
  totalCount: null,
  liveMark: null,
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
        liveOnly: [],
        reversalCount: 0,
      },
    ];
    render(<LedgerTab canManage meetingId="m2" />);

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
        liveOnly: [],
        reversalCount: 0,
      },
    ];
    render(<LedgerTab canManage meetingId="m2" />);

    expect(await screen.findByText("Kept")).toBeTruthy();
    expect(screen.getByText("Later meeting · kept · confirmed")).toBeTruthy();
    expect(screen.getByText("new quote x")).toBeTruthy();
  });

  it("shows both empty states when nothing was found", async () => {
    ledgerResponses = [response([])];
    render(<LedgerTab canManage meetingId="m2" />);
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
    render(<LedgerTab canManage meetingId="m2" />);

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
    render(<LedgerTab canManage meetingId="m2" />);

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
    render(<LedgerTab canManage meetingId="m2" />);

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
    render(<LedgerTab canManage meetingId="m2" />);

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
    render(<LedgerTab canManage meetingId="m2" />);

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
    render(<LedgerTab canManage meetingId="m2" />);

    expect(screen.queryByText("We couldn't load the ledger.")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(screen.getByText("We couldn't load the ledger.")).toBeTruthy();
  });
});

describe("LedgerTab Live Ledger badges (spec 0002 AC-15)", () => {
  it("shows 'Agreed live by N of M' instead of a line number", async () => {
    ledgerResponses = [
      {
        items: [
          ownItem({
            kind: "decision",
            statement: "We launch Friday",
            quote: "We launch Friday",
            source: "live_agreement",
            agreedCount: 3,
            totalCount: 4,
            lineNumber: 0,
            assignee: null,
            dueDate: null,
          }),
        ],
        incoming: [],
        liveOnly: [],
        reversalCount: 0,
      },
    ];
    render(<LedgerTab canManage meetingId="m2" />);
    expect(await screen.findByText("Agreed live by 3 of 4")).toBeTruthy();
    expect(screen.queryByText(/line 0/)).toBeNull();
  });

  it("badges a live marked item and a live marked match", async () => {
    ledgerResponses = [
      {
        items: [ownItem({ liveMark: "kept" })],
        incoming: [{ ...incoming("y", "kept", "confirmed"), liveMark: "kept" }],
        liveOnly: [],
        reversalCount: 0,
      },
    ];
    render(<LedgerTab canManage meetingId="m2" />);
    await screen.findByText("Ali sends the survey");
    expect(screen.getAllByText("Marked live")).toHaveLength(2);
  });

  it("explains a live mark no transcript evidence backs", async () => {
    const link = incoming("z", "kept", "suggested");
    ledgerResponses = [
      {
        items: [],
        incoming: [],
        liveOnly: [
          { mark: "kept", item: link.item, sourceMeeting: link.sourceMeeting },
        ],
        reversalCount: 0,
      },
    ];
    render(<LedgerTab canManage meetingId="m2" />);
    expect(
      await screen.findByText(
        "Marked live as kept, no transcript evidence found",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Statement z")).toBeTruthy();
    expect(
      screen.queryByText("No earlier promises were mentioned here yet."),
    ).toBeNull();
  });
  it("shows a code link as a merged PR with no line number", async () => {
    const base = incoming("c1", "kept", "suggested");
    const item: LedgerItemView = {
      ...base.item,
      meetingId: "m2",
      statement: "Fix the login bug",
      derivedStatus: "open",
      liveMark: null,
      links: [
        {
          ...base,
          evidenceKind: "code",
          evidenceMeetingId: null,
          lineNumber: null,
          quote: "Closes NM-1",
          pr: {
            repoFullName: "acme/app",
            prNumber: 7,
            prUrl: "https://github.com/acme/app/pull/7",
            reverted: true,
          },
        },
      ],
    };
    ledgerResponses = [{ ...response([], 0), items: [item] }];
    render(<LedgerTab canManage meetingId="m2" />);

    const pr = await screen.findByRole("link", { name: "Closes NM-1" });
    expect(pr.getAttribute("href")).toBe("https://github.com/acme/app/pull/7");
    expect(screen.getByText(/Merged PR · acme\/app #7/)).toBeTruthy();
    expect(screen.getByText(/reverted/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/line null/);
  });
});

describe("LedgerTab controls (spec 0004 AC-58b)", () => {
  const codeItem = (state: "suggested" | "confirmed", reverted = false) => ({
    ...incoming("a", "kept", "suggested").item,
    id: "i1",
    kind: "promise" as const,
    links: [
      {
        id: "cl1",
        itemId: "i1",
        evidenceKind: "code" as const,
        evidenceMeetingId: null,
        relation: "kept" as const,
        quote: "Fix the survey",
        speaker: null,
        lineNumber: null,
        confidence: 0.9,
        state,
        decidedAt: null,
        createdAt: "2026-10-30T00:00:00.000Z",
        pr: {
          repoFullName: "acme/app",
          prNumber: 7,
          prUrl: "https://github.com/acme/app/pull/7",
          reverted,
        },
      },
    ],
    derivedStatus: "open" as const,
    liveMark: null,
  });

  const withItems = (items: unknown[], links: LedgerIncomingLink[] = []): LedgerResponse =>
    ({ ...response(links), items }) as unknown as LedgerResponse;

  it("gives a reader no review button and no Check again", async () => {
    ledgerResponses = [
      withItems([codeItem("suggested")], [incoming("a", "kept", "suggested")]),
    ];
    render(<LedgerTab canManage={false} meetingId="m2" />);
    expect((await screen.findAllByText("earlier quote a")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Not a match" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Check again/ })).toBeNull();
  });

  it("reviews a code link when you can manage", async () => {
    ledgerResponses = [withItems([codeItem("suggested")])];
    render(<LedgerTab canManage meetingId="m2" />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("/api/ledger/links/cl1/review")),
      ).toBe(true),
    );
  });

  it("offers Undo on a decided code link, and hides it once the PR is reverted", async () => {
    ledgerResponses = [withItems([codeItem("confirmed")])];
    const { unmount } = render(<LedgerTab canManage meetingId="m2" />);
    expect(await screen.findByRole("button", { name: "Undo" })).toBeTruthy();
    unmount();
    ledgerResponses = [withItems([codeItem("confirmed", true)])];
    render(<LedgerTab canManage meetingId="m2" />);
    expect(await screen.findByText(/acme\/app/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("shows Hidden for viewers when a quote is null", async () => {
    ledgerResponses = [
      withItems([{ ...codeItem("suggested"), quote: null, speaker: null, lineNumber: null, links: [] }]),
    ];
    render(<LedgerTab canManage={false} meetingId="m2" />);
    expect(await screen.findByText("Hidden for viewers")).toBeTruthy();
    expect(screen.queryByText(/line null/)).toBeNull();
  });

  it("says when evidence sits outside the project, with no quote", async () => {
    ledgerResponses = [
      withItems([
        {
          ...codeItem("suggested"),
          links: [
            {
              ...codeItem("suggested").links[0],
              id: "ml1",
              evidenceKind: "meeting",
              evidenceMeetingId: null,
              state: "confirmed",
              quote: null,
              pr: undefined,
              outsideProject: true,
            },
          ],
        },
      ]),
    ];
    render(<LedgerTab canManage={false} meetingId="m2" />);
    expect(await screen.findByText("Evidence outside this project")).toBeTruthy();
    expect(screen.queryByText("Hidden for viewers")).toBeNull();
  });
});
