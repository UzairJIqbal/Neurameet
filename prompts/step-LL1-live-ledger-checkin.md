# Step LL1: Live Ledger slice 1, schema plus the owner check-in panel

Spec: `docs/specs/0002-live-ledger/index.md` (Status Proposed, tier GA). This prompt covers Build plan item 1 and satisfies AC-1, AC-2, AC-3, AC-16, and the panel half of AC-17. Nothing is sent to other participants yet (that is LL2). No new env var, no new provider, no new dependency, no AI call.

## 0. Contract first

Add all five Live Ledger lines plus the two "(extended)" lines from the spec's *API contracts* block to the AGENTS.md API Contracts list before any code.

## 1. Schema (`supabase/schema.sql`)

Append a `-- Live Ledger` section after the ledger section with exactly the SQL in the spec's *Data model* block: `ledger_live_marks`, `ledger_agreements` (with the partial unique index), `ledger_agreement_votes`, and the three new `ledger_items` columns. Then `alter table ... enable row level security` on the three new tables, no policies, and `grant all ... to service_role` (copy the exact grant style used for `ledger_links`). Everything idempotent (`if not exists`). Apply it to the Supabase project once you approve the SQL (I will show it before running).

## 2. Keep agreement items through reprocessing (`src/agent/ledger.ts`)

In `writeLedgerItems`, the select of existing rows adds `.eq("source", "transcript")`, so delete never touches `live_agreement` rows. `prepareLedgerRows` sets nothing new (the column default is `transcript`). Extend `src/agent/ledger-write.test.ts` with a case proving the filter is applied.

## 3. Shared types (`src/lib/live-ledger-types.ts`, no `server-only`)

```ts
export interface CheckinItem {
  id: string;
  statement: string;
  quote: string;
  assignee: string | null;
  dueDate: string | null;
  derivedStatus: "open" | "overdue";
  sourceMeeting: { id: string; title: string; startedAt: string | null };
}
export interface CheckinResponse { items: CheckinItem[] }
export const CHECKIN_LIMIT = 20;
export const CARD_STATEMENT_MAX = 300;
export const CARD_QUOTE_MAX = 500;
```

Also the `LiveLedgerEvent` union from the spec (used from LL2 on, defined now so the preview renders the same shape it will send).

## 4. Pure ranking (`src/lib/live-ledger-rank.ts`)

`rankCheckinItems(rows, today): CheckinItem[]`: overdue first (oldest due date first), then items with a due date (soonest first), then no due date (newest `created_at` first); cut to `CHECKIN_LIMIT`. Uses `deriveLedgerStatus("open", dueDate, today)`. Test file `src/lib/live-ledger-rank.test.ts`: mixed order, ties, empty list, limit.

## 5. Route `GET /api/ledger/live/checkin` (`src/app/api/ledger/live/checkin/route.ts`)

- `runtime = "nodejs"`, `dynamic = "force-dynamic"`, same structure as `src/app/api/ledger/route.ts`.
- Query: `callId` (required, 400), `today` (`YYYY-MM-DD`, reuse the `isIsoDate` check; 400 if bad).
- `auth()` → 401. `meetings` by `stream_call_id = callId` and `user_id = userId` → 404 if none.
- Select open `ledger_items` (columns: id, meeting_id, statement, quote, assignee, due_date, created_at) whose meeting belongs to `userId` and is not this meeting. Two queries is fine: the owner's meeting ids (with title, started_at), then items `in` those ids with `status = 'open'`. Then `rankCheckinItems`.
- try/catch: log `[live-ledger] checkin failed` and return 500 `{ error }`.
- Test `route.test.ts` (mock Clerk and Supabase like `src/app/api/ledger/route.test.ts`): 401, 400 missing callId, 400 bad today, 404 not owner, 200 ranked list excludes this meeting's items and closed items.

## 6. Client fetcher (`src/lib/live-ledger-client.ts`)

`fetchCheckin(callId, today, signal)` returning `CheckinResponse`, throwing on non 2xx with the server's `error`. Same style as `src/lib/ledger-client.ts`.

## 7. UI

- `src/components/live-ledger/LiveLedgerPanel.tsx` (`"use client"`). Props: `callId: string`, `onClose: () => void`. Nothing else, no Stream hooks, no participant hooks.
  - Fetch on mount with `useLoadingTimeout` + `LoadError` (retry refetches).
  - Search box filtering statement, quote, assignee (client side).
  - Rows: statement, assignee, due date, a status pill ("Still open?" for overdue, "Open" otherwise; never "Overdue"), source meeting title.
  - Empty state: "No open promises from your earlier meetings."
  - Clicking a row shows `CardPreview` (inside the panel): the exact card layout LL2 will broadcast (quote in quotes, statement, assignee, due date, source title), text cut to the spec limits. A disabled "Show to everyone" button with the hint "Coming in the next step" is acceptable for this slice only.
  - Dark room tokens only: `bg-inverse-surface`, `text-inverse-on-surface`, `border-outline-variant`, `bg-primary-container text-on-primary` for the selected row. No hex, no raw Tailwind color classes.
- `src/components/MeetingRoom.tsx`, minimal change:
  - `showLedger` state; a "Ledger" `Button` (lucide `BookCheck` icon) in the owner only group next to Recordings, same classes as the Recordings button, `aria-expanded`. Opening it closes People and Recordings, and opening those closes it.
  - Render `<LiveLedgerPanel callId={call.id} onClose={...} />` where the Recordings side panel renders, as a sibling of the layout, only when `isOwner && showLedger`. No change to the tile tree, no new effect.
- Component test `src/components/live-ledger/LiveLedgerPanel.test.tsx` (`// @vitest-environment jsdom`): renders the ranked list from a mocked fetch, filter narrows rows, click shows the preview, overdue shows "Still open?".

## 8. Stream check

Before touching MeetingRoom, reread the `stream-react` skill `references/VIDEO.md` call state section and confirm this change adds no Stream hook or listener (it should not).

## 9. Checks and docs

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx vitest run`, all green.
- Update `context/progress-tracker.md` (LL0 done, LL1 done), `context/ui-registry.md` (LiveLedgerPanel, CardPreview), `context/build-plan.md` (fill LL1 to LL6 from the spec build plan, mark LL0 and LL1), scope row #18 (link the spec, add the slice checkboxes), spec status stays Proposed until the first slice merges, then In Progress.

## 10. Test steps I will hand you

1. Start a meeting as the owner who has at least one earlier meeting with open ledger items (an overdue one helps).
2. Click "Ledger" in the controls: the panel lists items, overdue first, shown as "Still open?".
3. Type in the search box: the list narrows.
4. Click an item: the preview card shows the quote, assignee, due date, source meeting.
5. Join the same call as a second user: no "Ledger" control appears.
6. Toggle camera a few times with the panel open: no flicker loop.
