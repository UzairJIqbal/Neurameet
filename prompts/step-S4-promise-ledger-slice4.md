# Step S1, slice 4: Promise Ledger meeting date on upload, plus the prep hook

Spec: `docs/specs/0001-promise-ledger/index.md` (Status In Progress, tier GA). This prompt covers Build plan items 4 and 5 (the scope milestone "Meeting date on upload, plus the prep hook") and satisfies AC-5 and AC-15. Both route changes are already in the AGENTS.md API Contracts list (`POST /api/transcript/upload` extended with `meetingDate`, `POST /api/prep` extended with `ledgerItems`). Slice 5 (evaluation script and demo seed, AC-16) comes next.

What already exists and is reused, not rebuilt:
- `ledger_items.embedding vector(768)` is filled at match time by `ledger-match.ts` with `gemini-embedding-001` (768 dims), the same model and size as the prep query embedding (`QUESTION_EMBEDDING` with `outputDimensionality: 768`). So the prep embedding can rank ledger items directly.
- `deriveLedgerStatus(status, dueDate, today)` and `LEDGER_PREP_LIMIT = 5` in `src/agent/ledger.ts`.
- `/meeting-intelligence/[id]` is the meeting page each prep item links to.

No new env var, no new provider. One new SQL function (below), applied to the live Supabase project and confirmed before the slice is ticked.

## 1. Upload meeting date (AC-5)

### Route (`src/app/api/transcript/upload/route.ts`)

- Accept optional `meetingDate` in the body.
- Validate only when present and when there is no `meetingId`: must be a string matching `^\d{4}-\d{2}-\d{2}$` and a real calendar date (round trip through `Date.UTC`, so `2026-02-30` fails). Bad format → 400 `{ error: "Meeting date must be a valid date (YYYY-MM-DD)" }`.
- Not in the future → 400 `{ error: "Meeting date cannot be in the future" }`. The check compares against the server's UTC date plus one day, so a user ahead of UTC (Pakistan is UTC+5) picking their own local today is never rejected. The modal also sets `max` to the local today, so the browser blocks real future dates first.
- On the new meeting branch only: `started_at` and `ended_at` = `${meetingDate}T12:00:00.000Z` (noon UTC, per spec). Without a date, keep `new Date().toISOString()` as today.
- When `meetingId` is given, `meetingDate` is ignored completely (not validated, never written).
- Put the parse and check in a small exported pure helper `parseMeetingDate(value: unknown, now: Date)` returning `{ ok: true; startedAt: string | null } | { ok: false; error: string }`, in `src/lib/meeting-date.ts`, so it is unit tested without the route.

### Modal (`src/components/UploadTranscriptModal.tsx`)

- New optional field under the title: label "Meeting date (optional)", `<input type="date">`, `max={localToday()}` (reuse `localToday` from `src/lib/ledger-client.ts`), same input classes as the title field, plus a one line hint: "Leave empty for today. Used to work out due dates like Friday tak."
- Hidden when the upload attaches to an existing meeting (`effectiveMeetingId` set), because the server ignores it there.
- Sent as `meetingDate` only when non empty and there is no `effectiveMeetingId`.

## 2. Prep hook (AC-15)

### SQL function (`supabase/schema.sql`, applied live)

```sql
create or replace function match_ledger_prep_items(
  query_embedding vector(768),
  p_user_id text,
  match_count int default 5
)
returns table (
  id uuid, meeting_id uuid, meeting_title text, meeting_started_at timestamptz,
  kind text, statement text, quote text, assignee text, due_date date, similarity float
)
language sql stable set search_path = public
as $$
  select li.id, li.meeting_id, m.title, m.started_at, li.kind, li.statement,
         li.quote, li.assignee, li.due_date,
         1 - (li.embedding <=> query_embedding) as similarity
  from ledger_items li
  join meetings m on m.id = li.meeting_id
  where m.user_id = p_user_id and li.status = 'open' and li.embedding is not null
  order by li.embedding <=> query_embedding
  limit match_count;
$$;
GRANT EXECUTE ON FUNCTION match_ledger_prep_items(vector, text, int) TO service_role;
```

Owner scope comes from `meetings.user_id`, same as `match_ledger_candidates`. Only `open` items qualify; overdue is a subset of open, derived in code.

### Types (`src/lib/meeting-types.ts`)

```ts
export interface PrepLedgerItem {
  id: string;
  kind: LedgerKind;
  statement: string;
  quote: string;
  assignee: string | null;
  dueDate: string | null;
  derivedStatus: "open" | "overdue";
  sourceMeeting: { id: string; title: string; startedAt: string };
}
```

### Agent (`src/agent/prep.ts`)

- New `findPrepLedgerItems(userId, embedding, today)` that calls the RPC with `LEDGER_PREP_LIMIT`, maps rows to `PrepLedgerItem`, and sets `derivedStatus` through `deriveLedgerStatus` with the server's UTC date (spec: prep has no client date, the small difference is accepted). It never throws: an RPC error is logged with the `[ledger]` prefix (user id only, no text) and returns `[]`, so a ledger problem never breaks prep.
- `generatePrepSuggestions` keeps its LLM output unchanged and now returns `{ suggestions, ledgerItems }` (type `PrepResult`). The ledger lookup reuses the embedding it already computed and runs in parallel with the chunk RPC. The empty query branch returns `ledgerItems: []`. The list is deterministic and never passed to the LLM.

### Route (`src/app/api/prep/route.ts`)

Responds `{ suggestions, ledgerItems }`. Errors unchanged.

### UI (`src/components/PrepPage.tsx`)

- Read `ledgerItems` (default `[]`).
- New section "Open promises and decisions", rendered after the four LLM sections, same card style. Each row: kind badge (Decision or Promise), the statement, the quote in a muted italic line, assignee and due date for promises, an "Overdue" badge (`bg-error-container text-error`) when overdue, and a link "From <meeting title>, <date>" to `/meeting-intelligence/<id>`. Design tokens only, no new colours.
- `hasAny` counts ledger items too, so a prep with only ledger items still shows content instead of the empty state.

## 3. Tests

- `src/lib/meeting-date.test.ts`: absent → `startedAt: null`; valid past date → noon UTC ISO; bad format; impossible date (`2026-02-30`); future date rejected; the user's local today accepted when the server UTC date is one day behind.
- `src/app/api/transcript/upload/route.test.ts` (new): new upload with `meetingDate` inserts `started_at` noon UTC; bad date → 400 and no insert; with `meetingId` the date is ignored (no 400 even when malformed, no meeting insert).
- `src/agent/prep.test.ts` (new or extended): ledger rows map to `PrepLedgerItem` with overdue derived; RPC error → `[]` and prep still returns suggestions.
- `src/components/PrepPage.test.tsx`: the section renders with the overdue badge and the meeting link; ledger items alone avoid the empty state.
- Run `npx tsc --noEmit`, eslint on touched files, `npx vitest run`, `npm run build`.

## 4. Bookkeeping

- Tick the scope milestone "Meeting date on upload, plus the prep hook" in `docs/scope/scope.md` once both parts land and the SQL function is confirmed live.
- Update `context/progress-tracker.md` and `context/ui-registry.md` (upload modal date field, PrepPage ledger section).
- Offer verify steps for AC-5 and AC-15 (plus the Value sourcing rows "meeting date for the prompt" and "prep ledgerItems") to append to `docs/scope/verify.md`.

## Out of scope

The evaluation script and demo seed (slice 5). No change to extraction, match, review, or the Ledger tab. No similarity threshold on the prep list (the spec says top 5).
