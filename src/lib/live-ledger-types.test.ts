import { describe, it, expect } from "vitest";
import {
  EMPTY_LIVE_STATE,
  CARD_QUOTE_MAX,
  detectQuoteLanguage,
  isIsoDate,
  markLabel,
  parseLiveLedgerEvent,
  reduceLiveLedger,
  toCardEvent,
  type LiveLedgerCardEvent,
  type LiveLedgerState,
} from "./live-ledger-types";

const card: LiveLedgerCardEvent = {
  event: "ledger.card",
  itemId: "i1",
  statement: "Ali sends the survey",
  quote: "main Friday tak survey bhej dunga",
  assignee: "Ali",
  dueDate: "2026-10-20",
  derivedStatus: "overdue",
  sourceTitle: "Kickoff",
};

describe("parseLiveLedgerEvent", () => {
  it("accepts every valid ledger event", () => {
    expect(parseLiveLedgerEvent(card)).toEqual(card);
    expect(
      parseLiveLedgerEvent({
        event: "ledger.card_mark",
        itemId: "i1",
        mark: "kept",
      }),
    ).toEqual({
      event: "ledger.card_mark",
      itemId: "i1",
      mark: "kept",
    });
    expect(
      parseLiveLedgerEvent({ event: "ledger.card_close", itemId: "i1" }),
    ).not.toBeNull();
    expect(
      parseLiveLedgerEvent({
        event: "ledger.agreement_open",
        agreementId: "a1",
        statement: "We ship",
      }),
    ).not.toBeNull();
    expect(
      parseLiveLedgerEvent({
        event: "ledger.agreement_tally",
        agreementId: "a1",
        agree: 2,
        notYet: 0,
      }),
    ).not.toBeNull();
    expect(
      parseLiveLedgerEvent({
        event: "ledger.agreement_close",
        agreementId: "a1",
        agreed: 2,
        total: 3,
      }),
    ).not.toBeNull();
  });

  it("drops extra fields so only the known shape gets through", () => {
    expect(parseLiveLedgerEvent({ ...card, html: "<b>x</b>" })).toEqual(card);
  });

  it("rejects unknown, malformed, or foreign events", () => {
    expect(parseLiveLedgerEvent(null)).toBeNull();
    expect(parseLiveLedgerEvent("ledger.card")).toBeNull();
    expect(parseLiveLedgerEvent({ event: "reaction.new" })).toBeNull();
    expect(parseLiveLedgerEvent({ ...card, derivedStatus: "kept" })).toBeNull();
    expect(parseLiveLedgerEvent({ ...card, itemId: 5 })).toBeNull();
    expect(
      parseLiveLedgerEvent({
        event: "ledger.card_mark",
        itemId: "i1",
        mark: "done",
      }),
    ).toBeNull();
    expect(
      parseLiveLedgerEvent({
        event: "ledger.agreement_tally",
        agreementId: "a1",
        agree: -1,
        notYet: 0,
      }),
    ).toBeNull();
    expect(
      parseLiveLedgerEvent({
        event: "ledger.agreement_close",
        agreementId: "a1",
        agreed: 1.5,
        total: 2,
      }),
    ).toBeNull();
  });
});

describe("reduceLiveLedger", () => {
  const withCard = reduceLiveLedger(EMPTY_LIVE_STATE, card);

  it("raises, marks, and closes a card", () => {
    expect(withCard.card).toEqual({ card, mark: null });
    const marked = reduceLiveLedger(withCard, {
      event: "ledger.card_mark",
      itemId: "i1",
      mark: "kept",
    });
    expect(marked.card?.mark).toBe("kept");
    // Re raising the same card keeps its mark; a different card starts fresh.
    expect(reduceLiveLedger(marked, card).card?.mark).toBe("kept");
    expect(
      reduceLiveLedger(marked, { ...card, itemId: "i2" }).card?.mark,
    ).toBeNull();
    expect(
      reduceLiveLedger(marked, { event: "ledger.card_close", itemId: "i1" })
        .card,
    ).toBeNull();
  });

  it("ignores marks and closes for a card that is not up", () => {
    expect(
      reduceLiveLedger(withCard, {
        event: "ledger.card_mark",
        itemId: "x",
        mark: "kept",
      }),
    ).toBe(withCard);
    expect(
      reduceLiveLedger(withCard, { event: "ledger.card_close", itemId: "x" }),
    ).toBe(withCard);
  });

  it("runs an agreement from open to tally to close", () => {
    let s: LiveLedgerState = reduceLiveLedger(EMPTY_LIVE_STATE, {
      event: "ledger.agreement_open",
      agreementId: "a1",
      statement: "We ship",
    });
    expect(s.agreement).toMatchObject({
      agree: 0,
      notYet: 0,
      myVote: null,
      result: null,
    });
    s = reduceLiveLedger(s, {
      event: "ledger.agreement_tally",
      agreementId: "a1",
      agree: 2,
      notYet: 1,
    });
    expect(s.agreement).toMatchObject({ agree: 2, notYet: 1 });
    s = reduceLiveLedger(s, {
      event: "ledger.agreement_close",
      agreementId: "a1",
      agreed: 2,
      total: 4,
    });
    expect(s.agreement?.result).toEqual({ agreed: 2, total: 4 });
    // A late tally never changes a closed result.
    const late = reduceLiveLedger(s, {
      event: "ledger.agreement_tally",
      agreementId: "a1",
      agree: 3,
      notYet: 0,
    });
    expect(late).toBe(s);
    // A duplicate open does not reset the votes.
    const open = reduceLiveLedger(EMPTY_LIVE_STATE, {
      event: "ledger.agreement_open",
      agreementId: "a1",
      statement: "x",
    });
    const tallied = reduceLiveLedger(open, {
      event: "ledger.agreement_tally",
      agreementId: "a1",
      agree: 1,
      notYet: 0,
    });
    expect(
      reduceLiveLedger(tallied, {
        event: "ledger.agreement_open",
        agreementId: "a1",
        statement: "x",
      }),
    ).toBe(tallied);
  });
});

describe("helpers", () => {
  it("detects the quote language", () => {
    expect(detectQuoteLanguage("We launch Friday")).toBe("en");
    expect(detectQuoteLanguage("ہم جمعہ کو لانچ کریں گے")).toBe("ur");
    expect(detectQuoteLanguage("ہم Friday کو launch کریں گے")).toBe("mixed");
  });

  it("labels marks without the word overdue", () => {
    expect(markLabel("kept")).toBe("Marked kept");
    expect(markLabel("reversed")).toBe("Marked reversed");
    expect(markLabel("open")).toBe("Still open");
  });

  it("validates real calendar dates only", () => {
    expect(isIsoDate("2026-11-02")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-11-2")).toBe(false);
    expect(isIsoDate("Nov 2")).toBe(false);
  });

  it("clips the quote so the card stays under the event size cap", () => {
    const event = toCardEvent({
      id: "i1",
      statement: "s",
      quote: "q".repeat(CARD_QUOTE_MAX + 100),
      assignee: null,
      dueDate: null,
      derivedStatus: "open",
      sourceMeeting: { id: "old", title: "Kickoff", startedAt: null },
    });
    expect(event.quote.length).toBeLessThanOrEqual(CARD_QUOTE_MAX);
  });
});
