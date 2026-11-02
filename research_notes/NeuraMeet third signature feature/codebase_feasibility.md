# Codebase and Zero-Cost Feasibility of a Third Signature Feature for NeuraMeet (as of 2026-11-02)

Scope: a feasibility inventory, judged against the repo as it stands on `main` (`ba2be2e`) plus the uncommitted Live Ledger work (spec `docs/specs/0002-live-ledger/`, tables `ledger_live_marks`, `ledger_agreements`, `ledger_agreement_votes`). It does not repeat the second-feature note (`research_notes/NeuraMeet second signature feature/codebase_feasibility.md`), which already covers Stream custom events, `isSpeaking`, Web Speech for Urdu, and the missing transcript timestamps. "Local check" means I read the file in the repo or in `node_modules`. I changed no project code.

## What data, hooks and limits exist that a third feature can build on

### Takeaway
Every candidate can reuse a small, consistent core:
- one plain-text transcript per meeting;
- one insights row per meeting;
- a single combined extraction LLM call;
- 768-dimension pgvector chunks with user-scoped cross-meeting search;
- the Ledger's line-numbered quote machinery;
- `attendance_events` for who attended.

Four structural gaps decide the cost of most candidates:
1. **No timestamps.** Transcripts are plain `Speaker: text` lines.
2. **No editing or versioning.** Insights have no edit history, and re-processing deletes and rewrites them.
3. **No identity link.** Nothing ties a speaker label to a Clerk user.
4. **English-only generated transcripts.** The cleanup step translates Urdu out of recorded transcripts before any AI sees them.

The binding zero-cost limits are Groq's 8K tokens per minute on the fallback model and an unverified, possibly very low, Gemini Flash free-tier quota per day.

### Cited Findings (repo facts, local check)

**Installed versions**
- `next` ^15.5.18
- `ai` ^7.0.58, `@ai-sdk/google` ^4.0.39, `@ai-sdk/groq` ^4.0.26
- `@stream-io/video-react-sdk` ^1.40.2, `@stream-io/node-sdk` ^0.7.3
- `@supabase/supabase-js` ^2.112.2, `@clerk/nextjs` ^6.35.2
- `pdf-lib` ^1.17.1. `pdf-parse` is installed, but nothing in `src/` imports it.
- Source: local check, `package.json`.

**Models**
- Primary: `google("gemini-flash-latest")`. Fallback: `groq("openai/gpt-oss-20b")`.
- `generateStructuredWithFallback` gives Gemini 30 s with `maxRetries: 0`, then makes one Groq call with `maxRetries: 1`.
- Schemas must use `.nullable()`, not `.optional()`, because Groq structured outputs are strict.
- Chat streaming probes Gemini with a 1-token call and caches the chosen model for 60 s.
- Source: local check, `src/agent/models.ts`.

**Embeddings**
- Model: `gemini-embedding-001`, 768 dimensions.
- Chunks are about 900 characters with a 150-character overlap, embedded in batches of at most 100, with 3 retries and backoff.
- Source: local check, `src/agent/embed.ts`, `supabase/schema.sql:83-87`.

**Core tables** (`supabase/schema.sql`)
- `meetings(id, stream_call_id, user_id, title, started_at, ended_at, status)`. There is one owner per meeting (`user_id`) and no participants table.
- `transcripts(meeting_id UNIQUE, source upload|recording, raw_text, language, processing_state)`. One transcript per meeting, plain text, no segments or timestamps.
- `meeting_insights(meeting_id UNIQUE, summary, key_points[], decisions[], category, detected_topics[], processed_at)`. There is no editor, version, approval or hash column.
- `action_items(meeting_id, title, assignee text, due_date)` and `follow_ups(action_item_id, status, priority, notes)`.
- `meeting_chunks(meeting_id, chunk_text, chunk_index, embedding vector(768))`.
- `attendance_events(meeting_id, user_id, stream_user_id, participant_name, participant_email, session_started_at, session_ended_at, mic_toggles, camera_toggles, talk_time_seconds, mic_enabled_at)`.
- Ledger: `ledger_items` (with `quote`, `quote_language`, `speaker`, `line_number`, `embedding`) and `ledger_links`.
- Live Ledger: `ledger_live_marks`, `ledger_agreements`, `ledger_agreement_votes`. Votes have primary key `(agreement_id, voter_id)`, where `voter_id` is a Clerk id or a verified Stream guest id.
- Ledger and Live Ledger tables have RLS on with no policies, so only the service role can read or write them.
- Source: local check, `supabase/schema.sql:19-185, 323-354, 506-554`.

**Extensions:** only `create extension if not exists vector` is declared. `pgcrypto` is not referenced. — local check, `supabase/schema.sql:13-14`

**RPCs**
- `match_meeting_chunks(query_embedding, match_meeting_id, …)` searches within one meeting.
- `match_meeting_chunks_user(query_embedding, p_user_id, match_count)` searches across meetings and filters `where m.user_id = p_user_id`. It covers only meetings the caller owns, not meetings they attended.
- `match_ledger_candidates(p_meeting_id, p_user_id, …)` and `match_ledger_prep_items(query_embedding, p_user_id, match_count)` serve the Ledger.
- Source: local check, `supabase/schema.sql:103-160, 410-500`.

**`POST /api/ai/process`**
- Only the meeting owner can call it.
- It makes **one** structured LLM call that returns insights, action items and up to 15 ledger items.
- Input is capped at `MAX_TRANSCRIPT_CHARS = 16000`. Anything after that is never seen.
- Relative dates are resolved against `meetings.started_at`.
- On every run it **deletes** the existing `meeting_insights`, `action_items` and `follow_ups` for the meeting and re-inserts them. Ledger rows are rewritten by `writeLedgerItems`.
- Source: local check, `src/app/api/ai/process/route.ts:63-215`.

**Read access**
- `GET /api/meetings/[id]` and `POST /api/ai/chat` let the owner **or** any recorded participant read a meeting. Participants are matched on `attendance_events.user_id` or `stream_user_id`, because guests have a null `user_id`.
- Delete and AI processing are owner-only.
- Source: local check, `src/app/api/meetings/[id]/route.ts:42-90, 170-200`, `src/app/api/ai/chat/route.ts:180-220`.

**Transcript upload**
- `POST /api/transcript/upload` takes JSON `{title, rawText, meetingId?, meetingDate?}` and stores `source: "upload"`.
- The UI accepts `.txt` only (`accept=".txt"`).
- There is no table, route or storage for other uploaded documents such as PDFs or specs.
- Source: local check, `src/app/api/transcript/upload/route.ts:14-136`, `src/components/UploadTranscriptModal.tsx:366`.

**Generated transcripts**
- Pipeline: Stream individual recordings, then Groq Whisper `whisper-large-v3-turbo` in 10-minute FLAC chunks, then a merge into `SpeakerName: text` lines.
- Segment start times exist in memory but are dropped from the output.
- Speaker labels are resolved from `attendance_events.participant_name` through `stream_user_id`, with `Speaker <id>` as the fallback. The Clerk id is known at that moment but is not persisted next to the label.
- A cleanup pass instructs: "Your final output MUST be entirely in English."
- The F4 wiring was removed, so a generated transcript reaches AI only when the user downloads the `.txt` and re-uploads it. Stored transcripts therefore arrive as `source: "upload"`.
- Source: local check, `src/agent/transcript-generation.ts:36-92, 202-281, 315-345`, `docs/scope/scope.md:266-270`.

**Ledger quote machinery**
- The transcript is shown to the judge as numbered `N: text` lines, limited to 16,000 characters (`LEDGER_JUDGE_MAX_CHARS`).
- The speaker is the text before the first colon (`SPEAKER_PREFIX`), and each item stores `line_number`.
- Limits: `LEDGER_MAX_ITEMS = 15`, `LEDGER_CANDIDATE_LIMIT = 15`, `LEDGER_CONFIDENCE_THRESHOLD = 0.7`, `LEDGER_PREP_LIMIT = 5`.
- Source: local check, `src/agent/ledger.ts:13-23, 278-331`.

**Engagement**
- `POST /api/engagement` runs one LLM call (`SpeakerContributionSchema`) over up to 16,000 transcript characters.
- It returns per-speaker `name`, `contributions[]`, `keyTopics[]`, `lowEngagement` and `lowEngagementReason`.
- It flags low engagement when `talk_time_seconds` (time with the mic enabled) is under 15% of time present.
- Source: local check, `src/agent/speaker-insights.ts:5-18`, `src/app/api/engagement/route.ts:13-18, 242-247`.

**Prep**
- `POST /api/prep` pulls related chunks from up to 6 meetings (3 snippets each, 300 characters each, summaries cut to 400 characters) and makes one LLM call. It also returns up to 5 deterministic ledger items.
- Source: local check, `src/agent/prep.ts:129-258`.

**Deployment config**
- No route sets `maxDuration` (grep of `src/` finds none).
- `next.config.ts` marks only ffmpeg as an external package.
- There is no `vercel.json`.
- Source: local check.

**Email:** Resend's free tier is already approved for transactional email (`sendMeetingReadyEmail`). — local check, `AGENTS.md`, `src/app/api/ai/process/route.ts:247`

**Deferred items in scope** (`docs/scope/scope.md:557-564`):
- Urdu English meeting intelligence
- Anonymous devil's advocate (with a CSCW 2026 note against it)
- While You Were Gone (blocked on timestamps)
- Viva / FYP Panel Mode

### Cited Findings (free-tier limits, web)

**Groq free plan**
- `openai/gpt-oss-20b`, the project's fallback model: **30 RPM, 1K RPD, 8K TPM, 200K TPD**.
- `whisper-large-v3-turbo`: 20 RPM, 2K RPD, **7.2K audio-seconds per hour, 28.8K audio-seconds per day**.
- Source: [Groq rate limits](https://console.groq.com/docs/rate-limits).

**Gemini**
- Google's rate-limit page no longer publishes free-tier numbers. It says limits "depend on a variety of factors (such as your usage tier) and can be viewed in Google AI Studio." — [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- A third-party aggregator lists these free-tier limits:

  | Model | RPM | TPM | RPD |
  |---|---|---|---|
  | Gemini 3.8 Flash | 5 | 250K | **20** |
  | Gemini 3.6 Flash | 5 | 250K | **20** |
  | Gemini 3.5 Flash-Lite | 10 | 250K | **500** |
  | Gemini 3.1 Flash-Lite | 10 | 250K | **500** |

  Source: [ScriptByAI, Gemini API free tier limits](https://www.scriptbyai.com/gemini-api-free-tier-limits/). This is an aggregator, not primary, and gives no update date.
- Another aggregator claims "Gemini 2.5 Flash … (~1,500 RPD approximate)". — [rapidevelopers](https://www.rapidevelopers.com/md/ai-api-limits-performance-matrix/gemini-1-5-flash). It **conflicts** with the source above.
- An April 2026 aggregator headline says "Free tier Flash-only · Pro paid-only". — [agentdeals.dev](https://agentdeals.dev/gemini-api-pricing-changes)

**Vercel Hobby with Fluid compute** ([Vercel Functions limits](https://vercel.com/docs/functions/limitations))
- Function duration is **300 s by default and 300 s maximum**. Beyond that the function returns `504 FUNCTION_INVOCATION_TIMEOUT`.
- Memory is 2 GB / 1 vCPU.
- Request and response bodies are capped at 4.5 MB.
- The time a function spends waiting for AI calls does not count toward active CPU time.

**Supabase Free** ([Supabase pricing](https://supabase.com/pricing))
- **500 MB database per project**, 1 GB file storage, 5 GB egress, 2M Realtime messages.
- Limit of 2 active projects.
- A project is suspended after one week without activity.

**Stream Video Build (free) plan** ([Stream video pricing](https://getstream.io/video/pricing/))
- 333,000 participant minutes for video calls and 833,000 for livestreaming.
- "No Credit Card" required, with "$100 in free credits" monthly. Recording is listed as included.
- Transcription and closed captions are an add-on at "$8.00 / Per 1000 call minutes".
- The repo records that composite recording does not actually produce files on this account. — local check, `docs/scope/scope.md:240`

### Inferences
- **Real LLM headroom:**
  - If `gemini-flash-latest` now resolves to a 20-RPD Flash model, Gemini covers only about 20 structured calls a day before everything falls to Groq.
  - On Groq, a 16,000-character prompt is roughly 4K–5K tokens plus output. Against an 8K TPM budget, that means about **one full-transcript call per minute**.
  - So a new feature that adds a second full-transcript call per meeting, chained right after `/api/ai/process`, can hit the TPM limit on the fallback path. Prefer folding new extraction into the existing single call: the Ledger set this precedent with "extend, don't duplicate". Otherwise space the calls out.
  - Switching new calls to a Flash-Lite model (aggregator figure: 500 RPD) is a zero-cost lever, but it needs a quality check.
- **Storage:** a 768-dimension float vector is about 3 KB plus the row. At about 1 chunk per 900 characters, a 1-hour transcript (about 50K characters) is about 60 chunks, or 0.2 MB. 500 MB therefore holds on the order of 1,000+ meetings. Storage does not limit any candidate below.
- **Duration:** one structured call plus the Groq fallback finishes well within 300 s. A feature that loops LLM calls over many meetings (for example, a handoff brief over 30 meetings) must use pre-computed per-meeting data or map-reduce across requests, not one long function.
- **Text-only, 16K-character inputs:** every candidate inherits the 16,000-character cap. On meetings longer than about 30–40 minutes, the tail of the meeting is never analyzed today. Candidates that need whole-meeting coverage (dissent, unanswered questions, contradictions) need a chunked pass, which multiplies calls.

### Gaps
- I could not confirm from a primary source which model `gemini-flash-latest` points to in November 2026, or its free-tier RPD. The two aggregators disagree (20 versus about 1,500). Check the project's AI Studio rate-limit page before committing any per-meeting call budget.
- I found no source for the `gemini-embedding-001` free-tier RPD or TPM.
- Not verified: whether `pgcrypto` is enabled on this Supabase project (`mcp__supabase__list_extensions` would settle it). Node's built-in `crypto` (SHA-256, Ed25519) needs no extension.

## Candidate-by-candidate cost on the actual code (per meeting; reuse; new schema/routes; data gaps; risk; size)

### Takeaway
- **Cheapest and best grounded:** Summary sign-off (#1), Tamper-evident minutes (#2) and Dissent preservation (#8). They need zero or one extra LLM call, reuse `meeting_insights`, the Ledger quote and line machinery, and Live Ledger voter identity, and they combine into one "verified minutes" story.
- **Medium, but blocked by a data gap:** the Unanswered question tracker (#3) and Contradiction detection (#6). Both reuse the Ledger's cross-meeting matcher almost one to one. Contradiction against *documents* has no data source.
- **Weak on this codebase:** Personalised recap (#7) needs a speaker-label-to-user map that does not exist. Meeting health / ROI (#4) and Handoff brief (#5) are mostly aggregation and duplicate Prep/Search.

### Cited Findings (all local check unless noted; repo facts as listed in the previous section)

**1. Summary sign-off (participants review, correct and approve AI minutes)**
- **Reuses:**
  - `meeting_insights` (summary, key_points, decisions)
  - `action_items`
  - the owner-or-attendee access check in `GET /api/meetings/[id]`
  - the Live Ledger voter identity pattern, where `voter_id` is a Clerk id or a verified guest Stream id (`resolveLiveCaller`, `verifyStreamUserToken`)
  - Resend email for "minutes ready for review"
- **New schema:**
  - `minutes_versions(id, meeting_id, version int, body jsonb, author_id, created_at, base_version)` for edit history, or edits stored as diffs.
  - `minutes_approvals(meeting_id, version, approver_id, decision approve|request_change, comment, decided_at)`, primary key `(meeting_id, version, approver_id)`.
  - A `status` (draft|in_review|approved) on `meeting_insights` or on a versions head.
- **New routes:**
  - `GET/POST /api/minutes/[meetingId]/versions`
  - `POST /api/minutes/[meetingId]/approve`
  - These must be added to the AGENTS.md API contract.
- **LLM calls:** 0 by default. An optional 1 call can "apply a participant's correction and re-check it against the transcript", which fits the Ledger's exact-quote style.
- **Data gaps and conflicts:**
  - **`/api/ai/process` deletes and re-inserts `meeting_insights`, `action_items` and `follow_ups` on every run.** A re-process would silently wipe approved, edited minutes. Sign-off must freeze the record, either by blocking re-process after approval or by making re-process create a new draft version. This is the single most important change.
  - **Who can edit:** today only the owner can mutate. Participants are known only through `attendance_events`. Uploaded-only meetings with no call have no participants, so the owner alone signs.
  - Guests have no Clerk account. Their approval would rest on a Stream guest token valid only around the call. The Live Ledger already handles this for votes.
- **Risk:** low technically (plain CRUD plus diff UI). The product risk is a "nobody approves" stall, so set a timeout or "approved by owner plus N of M".
- **Size:** M (schema, 2 routes, diff/edit UI, email, freeze the process route).

**2. Tamper-evident minutes (hash-chained, signed records using Postgres or Node crypto)**
- **Reuses:**
  - the frozen approved version from #1, or the `meeting_insights` row as-is
  - `transcripts.raw_text`, `ledger_items` quotes and line numbers
  - `pdf-lib` (already installed) to embed the hash and a verify URL in an exported PDF, like the attendance report
- **New schema:** `minutes_seals(meeting_id, version, content_sha256, prev_seal_sha256, owner_user_id, sealed_at, signature, key_id)`. A per-owner chain uses `prev` = the owner's last seal. Hash a canonical JSON of summary, decisions, action items, ledger items, transcript SHA-256 and approvals. Optionally add a `before update` trigger that rejects updates to sealed rows.
- **New routes:**
  - `POST /api/minutes/[meetingId]/seal`, owner-only.
  - `GET /api/minutes/verify?hash=`, which could be public and read-only.
- **Crypto:**
  - Node's built-in `crypto` covers it with `createHash('sha256')` and `generateKeyPairSync('ed25519')` / `sign`.
  - The private key would live in a server env var, like the other secrets.
  - `pgcrypto` is not declared in `schema.sql` (see Gaps).
- **LLM calls:** 0.
- **Data gaps:**
  - Server-side signing proves only that "NeuraMeet's key signed this". The operator (the student) could re-sign. Real tamper-evidence against the operator needs the hash anchored outside the system, such as the hash emailed to every participant through Resend at seal time, or printed in the PDF.
  - Canonicalisation must be deterministic (sorted keys, normalised whitespace).
- **Risk:** low code risk. The **claim** risk is the main one: wording must not overstate this as legally binding or blockchain-grade.
- **Size:** S–M. It is S on its own and pairs naturally with #1.

**3. Unanswered question tracker across meetings**
- **Reuses almost one to one with the Ledger:**
  - extraction inside the single `/api/ai/process` call: add `questions[]` with exact quote, speaker and line number, like `ledgerItems`
  - storage like `ledger_items`, with embeddings via `embedTexts`
  - cross-meeting matching like `match_ledger_candidates` plus the judge in `ledger-match.ts`, which matches a later transcript's lines against earlier open items with `LEDGER_CONFIDENCE_THRESHOLD = 0.7`
  - owner confirm/reject review like `POST /api/ledger/links/[id]/review`
- **Option:** model questions as a third `ledger_items.kind` (`'question'`) with relation `answered`. That reuses the tables, RPCs, review UI and status recompute, and needs only check-constraint changes (`kind`, `relation`, `status`).
- **New routes:** none if folded into the Ledger. Otherwise `GET /api/questions`, `POST /api/questions/match`.
- **LLM calls:** +0 for extraction (same call, but more output tokens against Groq's 8K TPM), +1 for matching (or 0 if the existing ledger match judges questions in the same call), plus 1 embedding batch.
- **Data gaps:**
  - Answers in the *same* meeting must be excluded at extraction ("ask only questions not answered later in this transcript"). This is unreliable past the 16K-character cap.
  - Generated transcripts are English-translated, so quotes from recorded meetings are not the original Urdu.
  - No timestamps; line numbers only.
- **Risk:** medium. Questions are noisy (rhetorical questions, "can you hear me?"), so precision needs a filter and eval set.
- **Size:** S–M if built as a Ledger `kind`, M as a separate table.

**4. Meeting health / recurring-meeting ROI score and "convert to async" suggestion**
- **Data available:**
  - `attendance_events`: headcount, presence duration, `talk_time_seconds` (mic-on, not speech), `mic_toggles`.
  - `meetings.started_at` / `ended_at`.
  - Counts of `action_items`, `decisions[]` and `ledger_items` per meeting.
  - `ledger_links` (kept or reversed later).
  - Engagement output `lowEngagement` per speaker.
- **"Recurring" detection:** `meetings` has no series or recurrence field. Scheduled meetings are single Stream calls, and calendar integrations are out of scope in AGENTS.md. Recurrence would have to be inferred by title or embedding similarity of summaries.
- **New schema:** a `meeting_health(meeting_id, score, components jsonb, computed_at)` table or a SQL view. Optionally `meeting_series(id, owner_id, title_pattern)`.
- **LLM calls:** 0 for a deterministic score (decisions per person-hour, share of speakers, follow-ups kept). Add 1 for the "convert to async" rationale.
- **Data gaps:**
  - Talk time is mic-enabled time, an over-estimate.
  - Uploaded-only meetings have no attendance, so there is no cost side to the ROI.
  - No salary or cost data, so "ROI" is only a proxy.
- **Risk:** low technically. The product risk is that a formula score feels arbitrary and needs justification. It is also not unique: Read.ai, Fellow and others ship meeting scores (a competitor check belongs to other researchers).
- **Size:** S (deterministic) to M (series inference plus suggestion).

**5. Knowledge handoff brief across many meetings (new or leaving member)**
- **Reuses:**
  - `match_meeting_chunks_user` for cross-meeting retrieval
  - the `prep.ts` pattern: retrieve related meetings, summarise, then one LLM call
  - `meeting_insights.summary` / `decisions[]`
  - open `ledger_items` and overdue follow-ups, which give "what this person owed" and "what is still open"
- **New:** `POST /api/handoff` (`{ personName | topic }`), optionally a `handoff_briefs` cache table, and a PDF export through `pdf-lib`.
- **LLM calls:** 1 if it feeds pre-computed summaries (about 400 characters × N meetings). A map-reduce over raw chunks would cost 1 per meeting plus 1.
- **Data gaps:**
  - `match_meeting_chunks_user` is **owner-scoped** (`m.user_id = p_user_id`). A brief for a person who attended but did not own the meetings sees nothing, and there is no team or org model (multi-tenant is out of scope).
  - "For person X" relies on `assignee` / `speaker` free text. `normalizeSpeakerName` exists, but there is no identity link.
- **Risk:** low to medium. It overlaps the existing Prep and global Search, so differentiation is weak.
- **Size:** S–M.

**6. Contradiction detection against earlier meetings or uploaded documents**
- **Against earlier meetings:**
  - The Ledger already does this for decisions and promises: `ledger_links.relation = 'reversed'` with an exact quote and an owner review.
  - Extending to general claims or facts would add `kind = 'claim'`, or run a judge over top-k `match_meeting_chunks_user` neighbours of each new decision.
  - **LLM calls:** about 1 judge call per meeting (similar to the ledger match), plus embeddings.
- **Against documents:** no document store exists. Uploads are `.txt` transcripts only, and `pdf-parse` is installed but unused.
  - This would need a `documents(id, owner_id, title, text)` table plus `document_chunks(embedding vector(768))`, a new upload route (4.5 MB body limit on Vercel), PDF text extraction, and a new RPC.
  - That makes it a second RAG corpus: M–L effort.
- **Data gaps:** the same 16K-character cap and English translation as above. Contradiction judging has a high false-positive rate, so owner review must be built in (the Ledger has it).
- **Risk:** medium (precision). It overlaps heavily with the Ledger's "reversed" feature, so as a *third* signature it may read as a Ledger variant.
- **Size:** S if it only adds "contradicted decisions" to the Ledger matcher; L with document ingestion.

**7. Per-participant personalised recap ("what this meeting means for you", Urdu or English)**
- **Reuses:**
  - `meeting_insights`, `action_items.assignee`, `ledger_items.assignee` / `speaker`
  - `attendance_events` (who attended, their email)
  - Resend for delivery
  - the participant read access already in `GET /api/meetings/[id]`
- **New:** `participant_recaps(meeting_id, participant_key, language, body, created_at)` plus `GET /api/meetings/[id]/recap?lang=`. Optionally a per-user language preference.
- **LLM calls:** 1 per participant per meeting, so a 5-person meeting needs 5 calls. On Groq's 8K TPM that is about 5 minutes if each call sends the transcript. Feeding insights plus that person's lines instead of the full transcript keeps each call to about 1–2K tokens. Generating on demand when a participant opens the tab spreads the load.
- **Data gaps (the blocker):**
  - **There is no stored speaker-label-to-user map.** Generated transcripts label lines with `attendance_events.participant_name` (looked up via `stream_user_id`), so a join by normalised name to `attendance_events` is feasible but fragile with duplicate names.
  - Uploaded transcripts carry arbitrary labels, so there is no mapping at all.
  - `assignee` is LLM free text ("Ali", "the design team").
  - Urdu output conflicts with the generated-transcript cleanup that forces English. The recap can be *written* in Urdu or Roman Urdu from English sources, but the original Urdu quotes are lost.
- **Fix:** persist `speaker_label → stream_user_id` at merge time in a new `transcript_speakers(meeting_id, label, user_id, stream_user_id)` table. The data is in hand in `transcript-generation.ts` at that moment.
- **Risk:** medium (identity mapping, Urdu quality unbenchmarked).
- **Size:** M (including the speaker map).

**8. Dissent preservation (summary section that keeps minority views with quotes)**
- **Reuses:**
  - the single `/api/ai/process` call: add `dissent[]` with `{ topic, position, quote, speaker, lineNumber, outcome }` beside `ledgerItems`
  - the Ledger's exact-quote validation and line location (`writeLedgerItems` checks that quotes exist in `raw_text`)
  - Live Ledger agreement votes: a `not_yet` vote on a closed agreement is recorded minority dissent with a voter identity, a ready-made, non-LLM signal
- **New schema:** `meeting_dissent(meeting_id, topic, position, quote, speaker, line_number, related_ledger_item_id, created_at)`, or a jsonb column on `meeting_insights`. Plus a Summary-tab section. No new route is needed if it is returned by `GET /api/meetings/[id]`.
- **LLM calls:** +0, since it folds into the existing extraction call. Cost is extra output tokens only.
- **Data gaps:**
  - The model sees only the first 16K characters.
  - Generated transcripts are English-translated, so the "exact quote" is a translation, not the speaker's original Urdu words.
  - Speaker attribution of a minority view is sensitive. Pair it with #1 so the quoted person can correct it.
- **Risk:** low technically. The product risk is LLM bias toward majority views and fabricated "dissent" in consensus meetings. Quote validation against `raw_text` mitigates fabrication, as in the Ledger.
- **Size:** S.

### Inferences
- **Cross-cutting enabler worth costing once:** persist segment timing and speaker identity at merge time (`transcript_segments(meeting_id, line_number, speaker_label, stream_user_id, start_seconds)`). It unblocks #7, improves #1, #3 and #8, and also unblocks the deferred "While You Were Gone". Generated transcripts have this data in memory today. Uploaded transcripts never will.
- **Cross-cutting conflict:** the English-only cleanup in `transcript-generation.ts:64` weakens every quote-based candidate (#1, #3, #6, #8) for recorded Urdu meetings. Keeping an untranslated copy alongside (`transcripts.original_text`) is cheap: +0 LLM calls and a few KB per meeting.
- **Cheapest coherent bundle:** #1 + #2 + #8 as "Verified Minutes": dissent is captured, participants approve, then the record is sealed and the hash emailed.
  - LLM cost: +0 to 1 calls per meeting.
  - Effort: about M + S + S. It reuses Live Ledger identity and votes and the Ledger quote validator.
  - The hard prerequisite is changing `/api/ai/process` so re-processing never overwrites approved minutes.
- **Ledger extensions:** #3 and #6-meetings are the next-cheapest because they are Ledger extensions (new `kind` values). That is also their weakness as a *distinct* third signature.
- **Size ranking (smallest first):**
  - #8 S
  - #2 S–M
  - #3 S–M
  - #4 S–M
  - #5 S–M
  - #1 M
  - #7 M
  - #6 L with documents (S as a Ledger add-on)
- **LLM budget ranking (lowest first):** #2 (0), #1 (0–1), #8 (+0), #4 (0–1), #3 (+0–1), #6 (1), #5 (1+), #7 (N per participant).
- **Zero-cost fit:** all eight fit within Gemini/Groq/pgvector/Resend/pdf-lib and Node crypto, with no new provider. Only #6-documents adds a new ingestion surface; it remains zero-cost but stresses the 4.5 MB body limit and the 500 MB database.

### Gaps
- Not verified: whether Live Ledger's `resolveLiveCaller` guest-token path works *after* the call ends. That matters for guest sign-off in #1. The spec frames it around the live call (`docs/specs/0002-live-ledger/index.md:39-41`).
- I found no measurement of how often transcripts exceed the 16,000-character cap in this app's real data. That decides whether #3, #6 and #8 need a chunked pass.
- Not checked: the legal or evidentiary standing of self-hosted hash-chained minutes. Treat #2 claims as "tamper-evident", not "legally verified".
- I did not measure the quality of question, dissent or contradiction extraction on English, Urdu and mixed transcripts. There is no eval set in the repo for these kinds.
