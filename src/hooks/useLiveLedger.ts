"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Call, CustomVideoEvent } from "@stream-io/video-client";
import {
  EMPTY_LIVE_STATE,
  LIVE_STATE_RETRY_MS,
  parseLiveLedgerEvent,
  reduceLiveLedger,
  type AgreementVote,
  type CheckinItem,
  type LiveLedgerEvent,
  type LiveLedgerState,
  type LiveMark,
} from "@/lib/live-ledger-types";
import {
  LiveLedgerError,
  castVote,
  closeAgreement as postCloseAgreement,
  closeCard as postCloseCard,
  fetchLiveState,
  markCard as postMarkCard,
  openAgreement as postOpenAgreement,
  raiseCard as postRaiseCard,
} from "@/lib/live-ledger-client";

export interface LiveLedgerRoomState extends LiveLedgerState {
  /** Bumps each time a card is raised, so a local dismiss lasts one raise. */
  cardSeq: number;
}

type Action =
  | { type: "event"; event: LiveLedgerEvent }
  | { type: "sync"; state: LiveLedgerState }
  | {
      type: "voted";
      agreementId: string;
      vote: AgreementVote;
      agree: number;
      notYet: number;
    };

const INITIAL: LiveLedgerRoomState = { ...EMPTY_LIVE_STATE, cardSeq: 0 };

export function liveLedgerRoomReducer(
  state: LiveLedgerRoomState,
  action: Action,
): LiveLedgerRoomState {
  switch (action.type) {
    case "event": {
      const next = reduceLiveLedger(state, action.event);
      const raised = action.event.event === "ledger.card";
      return { ...next, cardSeq: raised ? state.cardSeq + 1 : state.cardSeq };
    }
    case "sync": {
      const changed =
        action.state.card?.card.itemId !== state.card?.card.itemId;
      // Keep a closed agreement's result on screen; the server only returns
      // open ones.
      const agreement =
        action.state.agreement ??
        (state.agreement?.result ? state.agreement : null);
      return {
        card: action.state.card,
        agreement,
        cardSeq: changed ? state.cardSeq + 1 : state.cardSeq,
      };
    }
    case "voted":
      return state.agreement?.agreementId === action.agreementId
        ? {
            ...state,
            agreement: {
              ...state.agreement,
              myVote: action.vote,
              agree: action.agree,
              notYet: action.notYet,
            },
          }
        : state;
  }
}

/**
 * Live Ledger room state for everyone in the call (spec 0002): one
 * `call.on("custom")` listener for `ledger.*` events plus a catch up read for
 * late joiners. Takes only the call, never participant hooks, so it cannot
 * re render the tile tree.
 */
export function useLiveLedger(
  call: Call | undefined,
  guestStreamToken: string | null,
) {
  const [state, dispatch] = useReducer(liveLedgerRoomReducer, INITIAL);
  const callId = call?.id ?? null;
  const tokenRef = useRef(guestStreamToken);
  tokenRef.current = guestStreamToken;

  const resync = useCallback(
    async (signal?: AbortSignal) => {
      if (!callId) return;
      const live = await fetchLiveState(callId, tokenRef.current, signal);
      dispatch({
        type: "sync",
        state: { card: live.card, agreement: live.agreement },
      });
    },
    [callId],
  );

  // Catch up once on mount. A 403 can mean our join attendance row has not
  // landed yet, so retry once after a short wait.
  useEffect(() => {
    if (!callId) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (canRetry: boolean) => {
      resync(controller.signal).catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (canRetry && err instanceof LiveLedgerError && err.status === 403) {
          retry = setTimeout(() => load(false), LIVE_STATE_RETRY_MS);
          return;
        }
        console.debug("[live-ledger] catch up skipped:", err);
      });
    };
    load(true);
    return () => {
      controller.abort();
      if (retry) clearTimeout(retry);
    };
  }, [callId, resync]);

  useEffect(() => {
    if (!call) return;
    const off = call.on("custom", (event: CustomVideoEvent) => {
      const parsed = parseLiveLedgerEvent(event.custom);
      if (parsed) dispatch({ type: "event", event: parsed });
    });
    return () => off();
  }, [call]);

  // Every action applies its own result at once (the event may arrive later
  // or not at all), and on failure reads the server state back so the panel
  // never shows something that is not true.
  const run = useCallback(
    async <T>(work: () => Promise<T>, apply: (result: T) => void) => {
      try {
        apply(await work());
      } catch (err) {
        void resync().catch(() => undefined);
        throw err;
      }
    },
    [resync],
  );

  const raise = useCallback(
    (item: CheckinItem) =>
      run(
        () => postRaiseCard(callId ?? "", item.id),
        (live) => {
          dispatch({ type: "event", event: live.card });
          if (live.mark) {
            dispatch({
              type: "event",
              event: {
                event: "ledger.card_mark",
                itemId: live.card.itemId,
                mark: live.mark,
              },
            });
          }
        },
      ),
    [callId, run],
  );

  const mark = useCallback(
    (itemId: string, value: LiveMark) =>
      run(
        () => postMarkCard(callId ?? "", itemId, value),
        () =>
          dispatch({
            type: "event",
            event: { event: "ledger.card_mark", itemId, mark: value },
          }),
      ),
    [callId, run],
  );

  const closeCard = useCallback(
    (itemId: string) =>
      run(
        () => postCloseCard(callId ?? "", itemId),
        () =>
          dispatch({
            type: "event",
            event: { event: "ledger.card_close", itemId },
          }),
      ),
    [callId, run],
  );

  const openAgreement = useCallback(
    (statement: string) =>
      run(
        () => postOpenAgreement(callId ?? "", statement),
        (opened) =>
          dispatch({
            type: "event",
            event: {
              event: "ledger.agreement_open",
              agreementId: opened.agreementId,
              statement: opened.statement,
            },
          }),
      ),
    [callId, run],
  );

  const closeAgreement = useCallback(
    (agreementId: string) =>
      run(
        () => postCloseAgreement(callId ?? "", agreementId),
        (closed) =>
          dispatch({
            type: "event",
            event: {
              event: "ledger.agreement_close",
              agreementId,
              agreed: closed.agreed,
              total: closed.total,
            },
          }),
      ),
    [callId, run],
  );

  const vote = useCallback(
    (agreementId: string, value: AgreementVote) =>
      run(
        () => castVote(callId ?? "", agreementId, value, tokenRef.current),
        (res) =>
          dispatch({
            type: "voted",
            agreementId,
            vote: res.myVote,
            agree: res.agree,
            notYet: res.notYet,
          }),
      ),
    [callId, run],
  );

  return {
    state,
    actions: { raise, mark, closeCard, openAgreement, closeAgreement, vote },
  };
}

export type LiveLedgerActions = ReturnType<typeof useLiveLedger>["actions"];
