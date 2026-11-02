// Shared Live Ledger shapes (spec docs/specs/0002-live-ledger). No secrets here:
// the browser and the server routes both import this file.

export const CHECKIN_LIMIT = 20;
export const CARD_STATEMENT_MAX = 300;
export const CARD_QUOTE_MAX = 500;
export const AGREEMENT_STATEMENT_MAX = 280;
export const RAISE_MIN_GAP_MS = 1500;
export const EVENT_MAX_BYTES = 4500;
export const LIVE_STATE_RETRY_MS = 3000;

export type LiveMark = "kept" | "open" | "reversed";
export type AgreementVote = "agree" | "not_yet";

export interface CheckinItem {
  id: string;
  statement: string;
  quote: string;
  assignee: string | null;
  dueDate: string | null;
  derivedStatus: "open" | "overdue";
  sourceMeeting: { id: string; title: string; startedAt: string | null };
}

export interface CheckinResponse {
  items: CheckinItem[];
}

/** Custom event payloads, sent server side only. */
export type LiveLedgerEvent =
  | {
      event: "ledger.card";
      itemId: string;
      statement: string;
      quote: string;
      assignee: string | null;
      dueDate: string | null;
      derivedStatus: "open" | "overdue";
      sourceTitle: string;
    }
  | { event: "ledger.card_mark"; itemId: string; mark: LiveMark }
  | { event: "ledger.card_close"; itemId: string }
  | { event: "ledger.agreement_open"; agreementId: string; statement: string }
  | {
      event: "ledger.agreement_tally";
      agreementId: string;
      agree: number;
      notYet: number;
    }
  | {
      event: "ledger.agreement_close";
      agreementId: string;
      agreed: number;
      total: number;
    };

export type LiveLedgerCardEvent = Extract<
  LiveLedgerEvent,
  { event: "ledger.card" }
>;

/** Cut text to a limit, ending with an ellipsis when it was cut. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** The exact card a raise will broadcast, built the same way for the preview. */
export function toCardEvent(item: CheckinItem): LiveLedgerCardEvent {
  return {
    event: "ledger.card",
    itemId: item.id,
    statement: clip(item.statement, CARD_STATEMENT_MAX),
    quote: clip(item.quote, CARD_QUOTE_MAX),
    assignee: item.assignee,
    dueDate: item.dueDate,
    derivedStatus: item.derivedStatus,
    sourceTitle: item.sourceMeeting.title,
  };
}

/** The card on screen right now, with its live mark once the owner marks it. */
export interface LiveCardState {
  card: LiveLedgerCardEvent;
  mark: LiveMark | null;
}

export interface LiveAgreementState {
  agreementId: string;
  statement: string;
  agree: number;
  notYet: number;
  myVote: AgreementVote | null;
  /** Set once the owner closes it: "agreed by N of M". */
  result: { agreed: number; total: number } | null;
}

/** GET /api/ledger/live: what a late joiner needs to catch up (AC-12). */
export interface LiveStateResponse {
  isOwner: boolean;
  card: LiveCardState | null;
  agreement: LiveAgreementState | null;
}

export interface VoteResponse {
  agree: number;
  notYet: number;
  myVote: AgreementVote;
}

export interface AgreementCloseResponse {
  agreed: number;
  total: number;
  itemId: string | null;
}

const MARKS: ReadonlySet<string> = new Set(["kept", "open", "reversed"]);

export const isLiveMark = (value: unknown): value is LiveMark =>
  typeof value === "string" && MARKS.has(value);

export const isAgreementVote = (value: unknown): value is AgreementVote =>
  value === "agree" || value === "not_yet";

const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown): v is string | null =>
  v === null || typeof v === "string";
const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Read a Stream custom event payload. Anything that is not a well formed
 * `ledger.*` event returns null, so other custom events (guest requests,
 * recording consent) pass by untouched.
 */
export function parseLiveLedgerEvent(custom: unknown): LiveLedgerEvent | null {
  if (!custom || typeof custom !== "object") return null;
  const c = custom as Record<string, unknown>;
  switch (c.event) {
    case "ledger.card":
      return isString(c.itemId) &&
        isString(c.statement) &&
        isString(c.quote) &&
        isNullableString(c.assignee) &&
        isNullableString(c.dueDate) &&
        (c.derivedStatus === "open" || c.derivedStatus === "overdue") &&
        isString(c.sourceTitle)
        ? {
            event: "ledger.card",
            itemId: c.itemId,
            statement: c.statement,
            quote: c.quote,
            assignee: c.assignee,
            dueDate: c.dueDate,
            derivedStatus: c.derivedStatus,
            sourceTitle: c.sourceTitle,
          }
        : null;
    case "ledger.card_mark":
      return isString(c.itemId) && isLiveMark(c.mark)
        ? { event: "ledger.card_mark", itemId: c.itemId, mark: c.mark }
        : null;
    case "ledger.card_close":
      return isString(c.itemId)
        ? { event: "ledger.card_close", itemId: c.itemId }
        : null;
    case "ledger.agreement_open":
      return isString(c.agreementId) && isString(c.statement)
        ? {
            event: "ledger.agreement_open",
            agreementId: c.agreementId,
            statement: c.statement,
          }
        : null;
    case "ledger.agreement_tally":
      return isString(c.agreementId) && isCount(c.agree) && isCount(c.notYet)
        ? {
            event: "ledger.agreement_tally",
            agreementId: c.agreementId,
            agree: c.agree,
            notYet: c.notYet,
          }
        : null;
    case "ledger.agreement_close":
      return isString(c.agreementId) && isCount(c.agreed) && isCount(c.total)
        ? {
            event: "ledger.agreement_close",
            agreementId: c.agreementId,
            agreed: c.agreed,
            total: c.total,
          }
        : null;
    default:
      return null;
  }
}

export interface LiveLedgerState {
  card: LiveCardState | null;
  agreement: LiveAgreementState | null;
}

export const EMPTY_LIVE_STATE: LiveLedgerState = {
  card: null,
  agreement: null,
};

/** Apply one event to the room's live state. Pure, so a repeat is harmless. */
export function reduceLiveLedger(
  state: LiveLedgerState,
  event: LiveLedgerEvent,
): LiveLedgerState {
  switch (event.event) {
    case "ledger.card":
      return {
        ...state,
        card: {
          card: event,
          mark:
            state.card?.card.itemId === event.itemId ? state.card.mark : null,
        },
      };
    case "ledger.card_mark":
      return state.card?.card.itemId === event.itemId
        ? { ...state, card: { ...state.card, mark: event.mark } }
        : state;
    case "ledger.card_close":
      return state.card?.card.itemId === event.itemId
        ? { ...state, card: null }
        : state;
    case "ledger.agreement_open":
      return state.agreement?.agreementId === event.agreementId
        ? state
        : {
            ...state,
            agreement: {
              agreementId: event.agreementId,
              statement: event.statement,
              agree: 0,
              notYet: 0,
              myVote: null,
              result: null,
            },
          };
    case "ledger.agreement_tally":
      return state.agreement?.agreementId === event.agreementId &&
        !state.agreement.result
        ? {
            ...state,
            agreement: {
              ...state.agreement,
              agree: event.agree,
              notYet: event.notYet,
            },
          }
        : state;
    case "ledger.agreement_close":
      return state.agreement?.agreementId === event.agreementId
        ? {
            ...state,
            agreement: {
              ...state.agreement,
              result: { agreed: event.agreed, total: event.total },
            },
          }
        : state;
  }
}

/** Arabic script plus Latin letters is mixed, Arabic only is Urdu (spec data model). */
export function detectQuoteLanguage(text: string): "en" | "ur" | "mixed" {
  const arabic = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(
    text,
  );
  const latin = /[A-Za-z]/u.test(text);
  if (arabic && latin) return "mixed";
  return arabic ? "ur" : "en";
}

/** "Still open?" wording for an overdue card, never "Overdue" (AC-5). */
export const markLabel = (mark: LiveMark): string =>
  mark === "kept"
    ? "Marked kept"
    : mark === "reversed"
      ? "Marked reversed"
      : "Still open";

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
