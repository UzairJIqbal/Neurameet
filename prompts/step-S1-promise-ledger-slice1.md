# Step S1: Promise Ledger, slice 1 (schema, extraction, read route, basic Ledger tab)

Spec: `docs/specs/0001-promise-ledger/index.md` (Status Proposed, tier GA). This prompt covers Build plan slice 1 only and satisfies AC-1, AC-2, AC-3, AC-4, AC-12, AC-13, AC-17. Slices 2 to 7 (match, review and alert, meeting date, prep hook, eval, full test pass) each get their own prompt after this one lands.

## Before you start (recommended)

1. The spec's Follow-up asks for the new routes to be in the AGENTS.md API Contracts list before coding. They are not there yet. You can run `/sync` first, or approve me adding these lines under API Contracts as part of this step:
   ```
   POST /api/ai/process               → (extended) also extracts up to 15 ledger items into ledger_items
   POST /api/transcript/upload        → (extended) optional meetingDate (YYYY-MM-DD) sets started_at on new meetings only
   POST /api/ledger/match             → owner only: match this meeting's transcript against earlier open ledger items, store suggested links
   GET  /api/ledger                   → owner only: ?meetingId=&today=YYYY-MM-DD, this meeting's items + links, incoming links, reversal count
   POST /api/ledger/links/[id]/review → owner only: { decision: "confirm" | "reject" | "reset" }
   POST /api/prep                     → (extended) adds a deterministic ledgerItems list (top 5 open or overdue)
   ```
2. On build start: scope row 17 stays `in-progress`, spec Status moves `Proposed` to `In Progress`.

## 1. Schema (`supabase/schema.sql`, then run in the Supabase SQL editor)

Add `ledger_items` and `ledger_links` exactly as the spec's Data model tables say (columns, types, nulls, checks, defaults, FKs with `on delete cascade` / `on delete set null`). Match the file's style: inline `check (... in (...))`, separate `create index if not exists`.

* Index `ledger_items(meeting_id)`, `ledger_links(evidence_meeting_id)`, unique `(item_id, evidence_meeting_id)`.
* `alter table ... enable row level security;` with no policies on both tables (service role only). Note: existing tables do not enable RLS in `schema.sql`. Enabling it with zero policies is harmless for the service role client and respects the file's "never add Supabase auth RLS" note, so I follow the spec here.
* Function `ledger_recompute_item_status(p_item_id uuid)`: set `status` to the `relation` of the confirmed link with the latest `decided_at`, else `open`.
* `after delete` trigger on `ledger_links`: when `old.state = 'confirmed'`, call the recompute function for `old.item_id` (skip when the item itself is gone because of a cascade). Written idempotently (`create or replace function`, `drop trigger if exists` then `create trigger`).
* After running it, confirm in Supabase that both tables, the function, and the trigger exist (query `information_schema` / `pg_trigger`). Not done until it is live.

## 2. Extraction schema (`src/agent/types.ts`)

Add `ledgerItemSchema` (kind, statement, quote, quoteLanguage, speaker, assignee, dueDate, actionItemIndex) using `.nullable()`, never `.optional()`. Extend `extractionResultSchema` with `ledgerItems: z.array(ledgerItemSchema).max(15)`. Export `LedgerItemExtraction` type.

## 3. Ledger helper (`src/agent/ledger.ts`, new)

Constants: `LEDGER_MAX_ITEMS = 15`, `LEDGER_CANDIDATE_LIMIT = 15`, `LEDGER_CONFIDENCE_THRESHOLD = 0.7`, `LEDGER_PREP_LIMIT = 5` (the last three are used in later slices; declare them now so the module is the single home).

Small pure functions (unit tested):
* `normalizeForMatch(s)`: lowercase, collapse whitespace, trim.
* `stripSpeakerPrefix(quote)`: drop a leading `Name:` label.
* `findQuoteLine(rawText, quote)`: returns `{ lineNumber, speaker } | null`, 1 based, line found when the normalised line contains the normalised quote. Speaker comes from the line's `Speaker:` prefix. Works for Urdu script and Roman Urdu.
* `prepareLedgerRows({ meetingId, rawText, items, actionItemIds, keptQuotes })`: drops items with no line (logs `[ledger] dropped unverified quote` with meeting id and kind, never the quote), runs `dueDate` through `normalizeDueDate`, nulls assignee and due date for decisions, maps `actionItemIndex` to an id (out of range is null), skips any item whose normalised quote equals a kept quote, caps at 15.

Database function:
* `writeLedgerItems(supabase, { meetingId, rawText, items, actionItemIds })`: loads ids of this meeting's items that have a `confirmed` or `rejected` link (kept), deletes the other items of this meeting, then inserts the prepared rows. Every failure is caught and logged with `[ledger]`; it never throws.

## 4. `/api/ai/process` (extend, no second LLM call)

* Select `started_at` in the existing ownership query and format it as `YYYY-MM-DD` (fallback: the meeting's `created_at`, then today, logged).
* Prompt additions (inside the existing single prompt): the meeting date, a `ledgerItems` entry in the JSON shape, and rules: quote copied exactly in the original language and script, one transcript line at most; resolve relative dates ("Friday tak", "next week") from the meeting date; `actionItemIndex` is the zero based index into the returned `actionItems` or null; at most 15 items, most important first; `quoteLanguage` is `en`, `ur`, or `mixed`. Also tell the model to resolve action item relative dates from the meeting date (AC-4 consistency).
* After the action items insert (which already returns ids in order), call `writeLedgerItems` with the full `rawText` (line numbers are against `transcripts.raw_text`). Failure is logged, process still returns success.
* Known side effect: process deletes and reinserts action items on reprocess, so a kept ledger item's `action_item_id` becomes null (`on delete set null`). Acceptable for this slice; noted in the report.

## 5. Types (`src/lib/meeting-types.ts`)

`LedgerItem`, `LedgerLink`, `LedgerDerivedStatus`, `LedgerItemView` (item + `derivedStatus` + `links`), `LedgerIncomingLink` (link + `item` + `sourceMeeting`), `LedgerResponse` (`items`, `incoming`, `reversalCount`). camelCase like the existing interfaces.

## 6. `GET /api/ledger` (new, `src/app/api/ledger/route.ts`)

Mirror `src/app/api/attendance/report/route.ts`: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, Clerk `auth()` 401, `meetingId` and `today` required, `today` must match `YYYY-MM-DD` and be a real date (400), owner check `meetings.user_id` (404), 500 on database failure.
* Items of this meeting with their links (outgoing evidence links), each with `derivedStatus` from a pure `deriveLedgerStatus(status, dueDate, today)` in `src/agent/ledger.ts` (`overdue` when `open` and `due_date < today`; never stored).
* `incoming`: links whose `evidence_meeting_id` is this meeting, with the earlier item and its source meeting (id, title, startedAt). Empty until slice 2 writes links, but the shape ships now.
* `reversalCount`: incoming links with relation `reversed` and state not `rejected`.

## 7. Ledger tab (UI)

* `MeetingTabs.tsx`: add `"Ledger"` to `TABS`; hide it for non owners in `VISIBLE_TABS` the same way Recording is hidden. Badge comes in slice 3.
* `MeetingDetail.tsx`: render `<LedgerTab meetingId=... />` when active.
* New `src/components/meeting-intelligence/LedgerTab.tsx`, following the `EngagementTab` fetch pattern: fetch `GET /api/ledger?meetingId=&today=<local YYYY-MM-DD>`, `useLoadingTimeout` + `LoadError` with retry, react-hot-toast for errors, tokens only per `context/ui-tokens.md` (no hex, no raw Tailwind colors).
* Section "Said in this meeting": each item shows a kind badge (Decision / Promise), the statement, the quote with speaker and "line N", assignee and due date for promises, a status badge (open, overdue, kept, reversed; overdue uses the error tokens), and any outgoing links (later meeting quote) as a small list.
* Empty state via `TabEmptyState`: "No decisions or promises found in this meeting."
* Matches section, reversal card, review buttons, and Check again come in slices 2 and 3.

## 8. Tests (vitest, this slice)

* `src/agent/ledger.test.ts`: `findQuoteLine` (Urdu script, Roman Urdu, extra spaces, case, speaker prefix in quote, not found), `prepareLedgerRows` (drop unverified, decision clears assignee and due date, action item index mapping incl. out of range, kept quote skip, cap 15), `deriveLedgerStatus` (overdue yesterday, due today is open, kept stays kept).
* `src/app/api/ledger/route.test.ts`: 401 signed out, 400 bad `today`, 404 not owner, 200 shape with `derivedStatus` and `reversalCount`. Mocks follow `src/app/api/meetings/[id]/route.test.ts`.

## 9. Checks

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`. Then update `context/progress-tracker.md` and `context/ui-registry.md`, tick slice 1 in the spec Build plan and the first milestone box in `docs/scope/scope.md`.

## Manual test steps (after build)

1. Upload a mixed transcript containing `Ali: main Friday tak survey bhej dunga` and a decision line. Open the meeting, Ledger tab: one promise (mixed, Ali, due the Friday after the meeting date, correct line) and the decision (AC-1, AC-4).
2. Supabase: every `ledger_items.quote` appears in the transcript; server log shows `[ledger] dropped` lines for any rejected quote (AC-2).
3. The promise's `action_item_id` matches the "send survey" action item (AC-3).
4. Click Retry summary: item ids change but no duplicates (AC-13; the keep rule is fully exercisable once slice 3 can confirm links, and is covered by unit tests now).
5. Sign in as another user, open the meeting: no Ledger tab; `GET /api/ledger?meetingId=...&today=...` returns 404; signed out returns 401 (AC-12).
6. Throttle the network: the tab shows the timeout `LoadError` with retry (AC-17).
