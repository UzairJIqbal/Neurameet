# Step T1: Tasdeeq slice 1, schema plus the minutes draft with evidence

Spec: `docs/specs/0003-tasdeeq-verified-minutes/index.md` (Status Proposed, tier GA). This prompt covers Build plan item 1 and satisfies AC-1, AC-2, AC-3, AC-4, AC-19, and the "not open" half of AC-20. No review can be opened yet (that is T2). No new env var, no new provider, no new dependency, no extra AI call: the one existing extraction call returns more fields.

## 0. Contract first

Add every line from the spec's *API contracts* block (8 new `/api/minutes*` routes plus the 4 "(extended)" lines) to the AGENTS.md API Contracts list before any code. Nothing else in AGENTS.md changes in this slice (the signing key goes into the never expose list in T4, when it is first read).

## 1. Schema (`supabase/schema.sql`)

Append a `-- Tasdeeq (spec 0003)` section after the Live Ledger section with exactly the SQL in the spec's *Data model* block: the `meeting_insights.minutes_draft` column and the 7 tables `minutes_reviews`, `minutes_lines`, `minutes_attesters`, `minutes_speaker_claims`, `minutes_attestations`, `minutes_dissent_suggestions`, `minutes_seals` (plus `minutes_seals_owner_idx`). Then `enable row level security` on each new table, no policies, and `grant all ... to service_role` in the same style as the ledger tables. Everything idempotent. All tables land now so T2 to T5 add no migrations. I show you the SQL, then apply it to the Supabase project with your OK, then confirm the tables and column are live with a `information_schema` query.

## 2. Quote helpers (`src/agent/ledger.ts`)

- Export the existing `speakerLabel` (the spec reads it for speaker claims). No behavior change.
- Add `findQuoteLines(rawText, quote): QuoteLocation[]`: same normalisation and `MIN_QUOTE_CHARS` minimum as `findQuoteLine`, returns every matching line in order. `findQuoteLine` stays exactly as it is.
- Tests in `src/agent/ledger.test.ts`: several matches in order, a speaker prefixed quote, a too short quote returns `[]`, no match returns `[]`.

## 3. Model output shape (`src/agent/types.ts`)

All new fields `.nullable()`, never `.optional()`, no `.max()` (caps are enforced on the server, same reason as the ledger cap).
- `minutesPointSchema = { text: string, speakers: string[] | null, quotes: string[] | null }`.
- `minutesSchema = { summaryPoints, keyPoints, decisions }`, each `minutesPointSchema[]`.
- `dissentSuggestionSchema = { speakerLabel, topic, position, quote, relatedDecisionIndex: number (int) | null }`.
- `extractionResultSchema` becomes `{ insights: meetingInsightsSchema.omit({ keyPoints, decisions }), minutes, actionItems: actionItemSchema.extend({ quotes })[], ledgerItems, dissentSuggestions: dissentSuggestionSchema[] | null }`. `meetingInsightsSchema`, `actionItemSchema`, and the DB shaped `MeetingInsights` in `src/lib/meeting-types.ts` stay unchanged, so every UI reader (Overview, Summary, Action Items, Category tabs, `GET /api/meetings/[id]`) keeps working. Only the process route imports `extractionResultSchema` (checked with grep).

## 4. Shared minutes types (`src/lib/minutes-types.ts`, no `server-only`)

- `MinutesSection`, `MinutesEvidence = { quote, lineNumber, speaker }`, `MinutesDraftLine`, `MinutesDraftSuggestion`, `MinutesDraft` exactly as the spec's *Draft shape*.
- The spec's *Constants* (`MINUTES_MAX_QUOTES`, `MINUTES_MAX_SUMMARY_POINTS`, `MINUTES_MAX_KEY_POINTS`, `MINUTES_MAX_DECISIONS`, `DISSENT_SUGGESTIONS_MAX`, `MINUTES_NOTE_MAX`, `MINUTES_DEADLINE_DAYS`, `MINUTES_TZ`, `SPEAKER_LABEL_MAX`).
- `coverageText({ lastLine, totalLines })` returns "These minutes cover transcript lines 1 to X of Y" (one source for the tab now, the bundle and PDF later).
- `MinutesResponse` for this slice: `{ state: "draft"; draft; transcriptSource: "upload" | "recording" }` (owner), `{ state: "no_draft" }` (owner, a meeting processed before Tasdeeq or not processed), `{ state: "not_open" }` (participant). T2 adds the review states to this union.

## 5. Pure draft builder (`src/agent/minutes.ts`, no I/O)

- `labelKey(label)`: `normalizeForMatch` (lowercase, trimmed, inner spaces collapsed).
- `computeCoverage(rawText, maxChars)`: `totalLines = rawText.split(/\r?\n/u).length`. When `rawText.length <= maxChars`, `lastLine = totalLines`. Otherwise split `rawText.slice(0, maxChars)` the same way; `lastLine` is that count when the next character is `\n` or `\r` (the cut ends a line), else the count minus 1 (the cut landed inside a line, as the spec says).
- `buildMinutesDraft({ result, rawText, actionItemIds, maxChars })`:
  - Lines in order: summary points (cut to 6), key points (8), decisions (8), then one action item line per `result.actionItems` entry (text = title, `actionItemId = actionItemIds[i]`, `assignee`).
  - Per line, the first `MINUTES_MAX_QUOTES` quotes: `findQuoteLines`, drop matches past `coverage.lastLine`, pick the first match whose speaker's `labelKey` is in the line's `speakers` hint keys, else the first match. A quote with no kept match is dropped. A quote that lands on a line already in this line's evidence is skipped (no duplicate evidence). `supported = evidence.length > 0`. `speakerLabels` = distinct non null evidence speakers (first seen spelling).
  - Dissent suggestions (first 5): keep one only if some `findQuoteLines` match within `lastLine` has a speaker whose `labelKey` equals the suggestion's; store that line number. `relatedDecisionIndex` is kept only when it points into the cut decisions list, else null. Return the dropped count so the route logs `[tasdeeq] dropped N dissent suggestions`.
- Tests `src/agent/minutes.test.ts`: the spec scenarios that belong here: a quote not in the transcript gives an unsupported line; a repeated phrase said by two speakers picks the speaker the model named; a quote found only past `lastLine` is dropped; a suggestion quoting another speaker is dropped and counted; caps (7 summary points become 6); `relatedDecisionIndex` out of range becomes null; coverage for a short text, a cut inside a line, and a cut exactly at a line end.

## 6. Process route (`src/app/api/ai/process/route.ts`)

- Prompt: keep today's transcript format. Replace `keyPoints` and `decisions` in the `insights` example with a `minutes` object, add `quotes` to the action item example, add `dissentSuggestions`. New rules: every quote is copied word for word from ONE transcript line, without the speaker name; return no quote rather than invent one; `speakers` names who said the point; at most 6 summary points, 8 key points, 8 decisions, 2 quotes per line, 5 dissent suggestions (only where a person clearly objected or disagreed, with their own words as the quote); `relatedDecisionIndex` is the zero based index into `minutes.decisions` or null. The summary paragraph rule stays.
- Before the inserts: `const actionItemIds = result.actionItems.map(() => crypto.randomUUID())` (Node `crypto`), and the action items insert sends `id: actionItemIds[i]`. `writeLedgerItems` still receives the ids only when the insert succeeded, as today.
- Build the draft with `buildMinutesDraft` inside its own try/catch: a failure logs `[tasdeeq] minutes draft failed` and stores `minutes_draft = null`, never failing processing.
- `meeting_insights` insert: `key_points` and `decisions` come from the cut `minutes.keyPoints[].text` and `minutes.decisions[].text`, plus `minutes_draft`. Everything else unchanged. If both providers fail, the route fails exactly as today.
- Note for T2: if the action items insert fails, the draft still names ids that never landed. T2's open step copies `action_item_id` only for ids that exist in `action_items`, else null.
- Update `src/app/api/ai/process/route.test.ts`: the fixture moves to the new shape; assert `key_points`/`decisions` filled from `minutes`, `minutes_draft` stored with located evidence and coverage, the action items insert carries the generated ids, the ledger still gets them, and a thrown draft builder still returns 200 with `minutes_draft: null`.

## 7. Route `GET /api/minutes` (`src/app/api/minutes/route.ts`)

- `runtime = "nodejs"`, `dynamic = "force-dynamic"`, same structure as `src/app/api/ledger/route.ts`.
- `auth()` → 401. `meetingId` missing → 400. Meeting not found → 404.
- Owner (`meetings.user_id`): read `meeting_insights.minutes_draft` and `transcripts.source`. A draft with `version === 1` → `{ state: "draft", draft, transcriptSource }`, else `{ state: "no_draft" }`.
- Not owner: an `attendance_events` row with `user_id = userId` for the meeting → `{ state: "not_open" }`. Anyone else → 404 (same body as not found, so a stranger learns nothing).
- try/catch: log `[tasdeeq] minutes read failed`, 500 `{ error }`.
- Test `src/app/api/minutes/route.test.ts` (mocks like `src/app/api/ledger/route.test.ts`): 401, 400, 404 stranger, 404 missing meeting, owner draft, owner no draft (null and old shape), participant `not_open`.

## 8. Client fetcher (`src/lib/minutes-client.ts`)

`fetchMinutes(meetingId, signal)` returning `MinutesResponse`, throwing with the server's `error` on non 2xx, same style as `src/lib/ledger-client.ts`.

## 9. UI

- `src/components/meeting-intelligence/MinutesTab.tsx` (`"use client"`), prop `meetingId`. Fetch with `useLoadingTimeout` + `LoadError` (retry refetches), same pattern as `LedgerTab`.
  - `draft`: the coverage banner on top, always ("These minutes cover transcript lines 1 to X of Y"). When `transcriptSource === "recording"`, a note "Quotes are English translations of the recording" (AC-19). Lines grouped under Summary, Key points, Decisions, Action items (a section with no lines is hidden). Each line: its text, then each evidence quote in quotes with "Line N · Speaker" (speaker left out when null), an "Unsupported" badge when `supported` is false, the assignee on action lines. At the bottom, "Open review" with a 3 or 7 working day picker, disabled with the hint "Coming in the next step" (acceptable for this slice only, same as LL1).
  - `no_draft`: "These minutes were made before Verified Minutes. Reprocess the meeting from the Summary tab to create them."
  - `not_open`: "Minutes not open for review yet".
  - Light app tokens only, taken from `LedgerTab` (same card, badge, and muted text classes; the Unsupported badge uses the same error container pair as the Ledger reversal badge). No hex, no raw Tailwind colors.
- `MeetingTabs.tsx`: add `"Minutes"` after `"Ledger"` in `TABS`, not in `OWNER_ONLY_TABS`; render `<MinutesTab meetingId={meetingId} />`.
- Tests: `MinutesTab.test.tsx` (`// @vitest-environment jsdom`): draft grouped by section with line numbers and speaker, Unsupported badge, coverage banner, recording note only for recording, `not_open` text, `no_draft` text, load error with retry. Update `MeetingTabs.test.tsx` so a non owner sees Minutes but not Ledger or Recording.

## 10. Checks and docs

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx vitest run`, all green.
- Recommended, your call because it spends free tier quota: `npm run check:providers`, then process one real 16000 character transcript and confirm Gemini (and the Groq fallback) still return the larger object (spec follow-up).
- Update `context/progress-tracker.md` (T1 done), `context/ui-registry.md` (MinutesTab), `context/build-plan.md` (add T1 to T5 from the scope milestones, mark T1), the spec's Build plan item 1, the scope row #19 T1 box. Spec status `Proposed` → `In Progress` at build start.

## 11. Test steps I will hand you

1. Upload a transcript with `Name: text` lines for at least two speakers, including one line where someone objects, and let it process.
2. Open the meeting, Minutes tab: the coverage banner reads "lines 1 to N of N", lines are grouped by section, each with quotes and "Line N · Name". (AC-1, AC-2, AC-20)
3. Summary, Overview, and Action Items tabs look exactly as before (key points and decisions still filled). (AC-1)
4. Upload a transcript longer than 16000 characters: the banner reads "lines 1 to X of Y" with X below Y, and no quote cites a line past X. (AC-2)
5. In Supabase, `meeting_insights.minutes_draft` holds `dissentSuggestions` only for speakers who really said the quote; the server log shows `[tasdeeq] dropped` when the model offered others. (AC-3)
6. A meeting from a recording shows "Quotes are English translations of the recording". (AC-19)
7. Sign in as a second user who attended: the tab shows "Minutes not open for review yet". A user who never attended gets 404 from `/api/minutes?meetingId=...`. (AC-4)
8. A meeting processed before this step shows the reprocess hint; reprocessing it creates the draft.
