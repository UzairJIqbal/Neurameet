# Step S1, slice 3: Promise Ledger review (confirm, not a match, undo), reversal card, tab badge

Spec: `docs/specs/0001-promise-ledger/index.md` (Status In Progress, tier GA). This prompt covers Build plan slice 3 only and satisfies AC-9, AC-10, AC-11. The review route is already in the AGENTS.md API Contracts list. Slice 4 (meeting date on upload) comes next.

What already exists and is reused, not rebuilt:
- `GET /api/ledger` already returns `derivedStatus` (overdue from the client `today`, via `deriveLedgerStatus`) and `reversalCount`. AC-10 server side is done; this slice only proves it in the UI and tests.
- The SQL function `ledger_recompute_item_status(p_item_id)` (live, `search_path=public`, granted to service_role) holds the status rule: relation of the confirmed link with the latest `decided_at`, else `open`. The delete trigger already uses it.
- `LedgerTab.tsx` already renders the "Matches found in this meeting" section (`MatchCard`, `QuoteBlock`) read only, and the Check again button.

No schema change, no migration, no new env var, no new provider.

## 1. Recompute helper (`src/agent/ledger.ts`)

Add one app side helper so the rule lives in one place per layer (spec "Review"):

```ts
export async function recomputeLedgerItemStatus(
  supabase: SupabaseClient,
  itemId: string,
): Promise<void>
```

It calls `supabase.rpc("ledger_recompute_item_status", { p_item_id: itemId })` and throws on error. All three decisions call it after updating the link (confirm included: after confirm the latest confirmed link is this one, so the result equals "item status = link relation", exactly as AC-9 says).

## 2. Route: `POST /api/ledger/links/[id]/review` (new, `src/app/api/ledger/links/[id]/review/route.ts`)

- `runtime = "nodejs"`, `dynamic = "force-dynamic"`, params as `{ params: Promise<{ id: string }> }` (same as `api/follow-ups/[id]/route.ts`).
- 401 when signed out.
- 400 when the body is not JSON or `decision` is not one of `confirm`, `reject`, `reset`.
- 404 when `id` is not a UUID (checked before any query), the link does not exist, or the owner walk fails: link → `ledger_items.meeting_id` → `meetings` with `.eq("user_id", userId)`. Same 404 message for every case, so a caller can not probe other users' ids.
- Update the link:
  - confirm → `state = 'confirmed'`, `decided_at = now ISO`
  - reject → `state = 'rejected'`, `decided_at = now ISO`
  - reset → `state = 'suggested'`, `decided_at = null`
- Then `recomputeLedgerItemStatus(supabase, itemId)`.
- 200 `{ id, state }`. Any database error → 500, logged with the `[ledger]` prefix (link id only, never quote text).
- Not atomic across the two writes; a failed recompute returns 500 and the same request can simply be sent again (both steps are idempotent).

## 3. Browser helpers (`src/lib/ledger-client.ts`, new)

Move `localToday()` out of `LedgerTab.tsx` into this file and add:
- `fetchLedger(meetingId: string, signal?: AbortSignal): Promise<LedgerResponse>` (throws with the route's error message).
- `reviewLedgerLink(linkId: string, decision: LedgerReviewDecision): Promise<boolean>` (never throws, logs failures).

Add `export type LedgerReviewDecision = "confirm" | "reject" | "reset";` to `src/lib/meeting-types.ts`.

## 4. UI: `LedgerTab.tsx`

- Use `fetchLedger` for the load (keep `useLoadingTimeout` + `LoadError` exactly as today).
- New prop `onReversalCount?: (n: number) => void`, called after every successful load, so the tab badge stays in step after a review.
- **Review buttons on `MatchCard`:**
  - state `suggested` → **Confirm** and **Not a match**.
  - state `confirmed` or `rejected` → **Undo** (sends `reset`).
  - While a request runs, that card's buttons are disabled and the pressed one reads "Saving…". Success refetches the ledger (silent refetch, no full spinner flash; the existing list stays until new data arrives). Failure shows `toast.error("Could not save your review. Try again.")`.
  - Button styles reuse the existing tokens: Confirm as the filled primary button used elsewhere in meeting intelligence, Not a match and Undo as the outline button style the Check again button already uses.
- **Reversal card** at the top (above "Matches found in this meeting") when `reversalCount > 0`: `bg-error-container text-error` rounded card, a heading such as "1 earlier decision was reversed in this meeting" (plural aware), then per reversed link (relation `reversed`, state not `rejected`) the item statement plus both quotes (earlier quote with source meeting title, and the new quote with speaker and line), reusing `QuoteBlock`.
- Wording stays careful: a rejected match is labelled "Not a match", nothing claims a promise was broken.

## 5. Tab badge (`MeetingTabs.tsx`)

- New state `reversalCount` in `MeetingTabs`. For owners only, a small effect calls `fetchLedger` on mount and whenever `ledgerVersion` changes (abort on unmount, failures only logged; the badge simply does not show). No spinner, so no loading timeout is needed here.
- `LedgerTab` receives `onReversalCount={setReversalCount}` so reviews and Check again update the badge.
- The Ledger tab label shows a small count pill when `reversalCount > 0`: `bg-error-container text-error`, rounded full, `text-label-caps`, with an `aria-label` like "2 reversed".

## 6. Tests (vitest)

- `src/app/api/ledger/links/[id]/review/route.test.ts`: 401 signed out; 400 bad body and unknown decision; 404 non UUID, missing link, and another user's meeting; 200 for confirm, reject, reset with the right update payload and the recompute RPC called with the item id; 500 when the RPC fails. Same hoisted queue mock style as `api/ledger/match/route.test.ts`, plus an `rpc` mock and a capture of `update` payloads.
- `src/agent/ledger.test.ts`: `recomputeLedgerItemStatus` calls the RPC with `p_item_id` and throws on error; extra `deriveLedgerStatus` cases (due yesterday open → overdue, due today → open, kept with past due → kept).
- `src/components/meeting-intelligence/LedgerTab.test.tsx` (`// @vitest-environment jsdom`): suggested link shows Confirm and Not a match; confirmed link shows Undo; clicking Confirm posts `{ decision: "confirm" }` to the right URL and refetches; reversal card renders only when `reversalCount > 0`; `onReversalCount` receives the count.

## 7. Checks and bookkeeping

- `npx tsc --noEmit`, eslint on the touched files only (list them directly, not through a shell variable), `npx vitest run`, `npm run build` (expect `/api/ledger/links/[id]/review` in the route list).
- Tick the slice 3 milestone in `docs/scope/scope.md`; update `context/progress-tracker.md` and `context/ui-registry.md`; append a slice 3 section to `docs/scope/verify.md` (after asking where the verify steps go).

## Out of scope

Meeting date on upload (slice 4), prep hook (slice 5), eval script (slice 6). No change to match, extraction, or the schema.
