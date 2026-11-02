import { describe, it, expect } from "vitest";
import {
  liveLedgerRoomReducer,
  type LiveLedgerRoomState,
} from "./useLiveLedger";
import type { LiveLedgerCardEvent } from "@/lib/live-ledger-types";

const card = (itemId: string): LiveLedgerCardEvent => ({
  event: "ledger.card",
  itemId,
  statement: "Ali sends the survey",
  quote: "survey bhej dunga",
  assignee: null,
  dueDate: null,
  derivedStatus: "open",
  sourceTitle: "Kickoff",
});

const EMPTY: LiveLedgerRoomState = { card: null, agreement: null, cardSeq: 0 };

describe("liveLedgerRoomReducer", () => {
  it("bumps cardSeq on every raise so a local hide lasts one raise", () => {
    const one = liveLedgerRoomReducer(EMPTY, {
      type: "event",
      event: card("i1"),
    });
    const again = liveLedgerRoomReducer(one, {
      type: "event",
      event: card("i1"),
    });
    expect([one.cardSeq, again.cardSeq]).toEqual([1, 2]);
    const marked = liveLedgerRoomReducer(again, {
      type: "event",
      event: { event: "ledger.card_mark", itemId: "i1", mark: "kept" },
    });
    expect(marked.cardSeq).toBe(2);
  });

  it("bumps cardSeq on sync only when the card changed", () => {
    const up = liveLedgerRoomReducer(EMPTY, {
      type: "event",
      event: card("i1"),
    });
    const same = liveLedgerRoomReducer(up, {
      type: "sync",
      state: { card: { card: card("i1"), mark: "open" }, agreement: null },
    });
    expect(same.cardSeq).toBe(1);
    expect(same.card?.mark).toBe("open");
    const other = liveLedgerRoomReducer(same, {
      type: "sync",
      state: { card: { card: card("i2"), mark: null }, agreement: null },
    });
    expect(other.cardSeq).toBe(2);
  });

  it("keeps a closed agreement result through a sync, drops an open one", () => {
    const agreement = {
      agreementId: "a1",
      statement: "We ship",
      agree: 2,
      notYet: 0,
      myVote: "agree" as const,
      result: { agreed: 2, total: 3 },
    };
    const closed = { ...EMPTY, agreement };
    const synced = liveLedgerRoomReducer(closed, {
      type: "sync",
      state: { card: null, agreement: null },
    });
    expect(synced.agreement).toEqual(agreement);
    const open = { ...EMPTY, agreement: { ...agreement, result: null } };
    expect(
      liveLedgerRoomReducer(open, {
        type: "sync",
        state: { card: null, agreement: null },
      }).agreement,
    ).toBeNull();
  });

  it("applies my own vote result to the open agreement only", () => {
    const open: LiveLedgerRoomState = {
      ...EMPTY,
      agreement: {
        agreementId: "a1",
        statement: "x",
        agree: 0,
        notYet: 0,
        myVote: null,
        result: null,
      },
    };
    const voted = liveLedgerRoomReducer(open, {
      type: "voted",
      agreementId: "a1",
      vote: "not_yet",
      agree: 1,
      notYet: 1,
    });
    expect(voted.agreement).toMatchObject({
      myVote: "not_yet",
      agree: 1,
      notYet: 1,
    });
    expect(
      liveLedgerRoomReducer(open, {
        type: "voted",
        agreementId: "zz",
        vote: "agree",
        agree: 1,
        notYet: 0,
      }),
    ).toBe(open);
  });
});
