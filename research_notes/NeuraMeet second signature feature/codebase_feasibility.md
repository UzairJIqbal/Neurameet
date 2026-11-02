# Codebase and Zero-Cost Feasibility of a Second Signature Feature for NeuraMeet (as of 2026-11-02)

Scope: this note checks each candidate second feature against the NeuraMeet repo as it stands after the Promise Ledger merge (commit `ba2be2e`, PR #12) and against the installed SDK typings. Free-tier limits already researched in `research_notes/NeuraMeet unique FYP feature/zero_cost_feasibility.md` are not repeated. That note gives Groq Whisper 7,200 audio-seconds per hour and 20 RPM, Groq LLM 200K tokens per day, unverified Gemini RPD, Supabase 2M Realtime messages, and Vercel's 4.5 MB body limit. "Local check" means I read the file in the repo or in `node_modules`. Nothing in the project was modified.

## What the installed Stream SDK actually exposes (custom events, speaking state, captions), and Web Speech for Urdu

### Takeaway
The installed SDK has three building blocks for live features, and none of them needs a paid tier:
- Custom events (`call.sendCustomEvent` on the client, `sendCallEvent` on the server), capped at 5 KB per event. The app already uses them in production for guest admission.
- Per-participant `isSpeaking`, `isDominantSpeaker` and `audioLevel`.
- A `createSoundDetector` helper.

Stream's own closed captions are still paid and do not support Urdu. In Chrome, on-device Web Speech, which follows the Live Caption language list, covers Hindi but not Urdu. Cloud-mode `ur-PK` is plausible but not documented for Chrome.

### Cited Findings
- Installed versions: `@stream-io/video-react-sdk` 1.40.2 and `@stream-io/video-client` 1.57.0. — local check, `node_modules/@stream-io/*/package.json`
- `Call.d.ts` declares `sendCustomEvent: (payload: { [key: string]: any }) => Promise<SendCallEventResponse>`, documented as "Sends a custom event to all call participants". — local check, `node_modules/@stream-io/video-client/dist/src/Call.d.ts:817`
- Stream docs say that "the payload for these events is limited to 5KB in size". Receivers listen with `call.on("custom", …)` and read `event.custom`. The page states no rate limit. — [Stream React custom events](https://getstream.io/video/docs/react/advanced/events/)
- The received `CustomVideoEvent` carries a `user: UserResponse` field alongside `custom`, `call_cid`, `created_at` and `type`. Every receiver therefore sees who sent a client-sent event. — local check, `gen/coordinator/index.d.ts` (interface `CustomVideoEvent`, around line 3870–3900)
- NeuraMeet already sends a custom event from the server. `src/app/api/guest/request-join/route.ts` calls `new StreamClient(apiKey, secret).video.sendCallEvent({ type: "default", id, user_id, custom: { event: "guest.request_join", … } })`. `src/components/MeetingRoom.tsx:784` listens with `call.on("custom", …)`, and the code comments note that "custom", not "all", is the correct wildcard. — local check
- `send-event` is a role grant in Stream's call-type permission model, alongside `send-audio` and `create-call-reaction`. — local check, `.claude/skills/stream-react/references/VIDEO.md:38-44`
- `StreamVideoParticipant extends Participant`, and the SFU `Participant` model has `isSpeaking: boolean`, `isDominantSpeaker: boolean` and `audioLevel: number`. The client wires `watchAudioLevelChanged` and `watchDominantSpeakerChanged`. — local check, `types.d.ts:22`, `gen/video/sfu/models/models.d.ts:111-119`, `events/speaker.d.ts`
- Stream documents `audioLevel` as running from 0 (silence) to 1 (loud). `isSpeaking` and `isDominantSpeaker` are available through `useCallStateHooks()` / `useParticipants()`. — [Stream call and participant state](https://getstream.io/video/docs/react/v2/guides/call-and-participant-state/)
- Other speech helpers in the installed client:
  - `createSoundDetector(audioStream, onSoundDetectedStateChanged, options)`
  - `microphone.state.speakingWhileMuted$`
  - a `dominantSpeaker` sort comparator — local check, `helpers/sound-detector.d.ts:43`, `devices/MicrophoneManagerState.d.ts`, `sorting/participants.d.ts:10`
- `startClosedCaptions`, `stopClosedCaptions` and `updateClosedCaptionSettings` exist in the typings, and so do the `call.closed_captions_*` events. The codebase does not use them. — local check, `Call.d.ts:558-568`; `grep` of `src/` finds no `startClosedCaptions`
- Stream captions and transcription are a paid add-on at $8 per 1,000 call minutes, and Urdu is not among the supported languages. — prior note, citing [Stream pricing](https://getstream.io/video/pricing/) and [Stream transcription docs](https://getstream.io/video/docs/react/transcribing/calls/)
- Chrome desktop Live Caption supports: English, Danish, Dutch, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Norwegian, Polish, Portuguese, Spanish, Simplified Chinese, Traditional Chinese, Swedish, Thai and Turkish. **Urdu is not listed.** — [Google Chrome Help: Live Caption](https://support.google.com/chrome/answer/10538231?hl=en)
- Web Speech `SpeechRecognition.available()` takes a `processLocally` flag. When it is true, "available" means the on-device language pack has been downloaded. Chrome's on-device packs (SODA) are the same packs Live Caption uses. — [MDN available()](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/available_static), [chrome-ai-dev-preview thread](https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/Rlyc2uAsFCY)
- `SpeechRecognition.start(audioTrack)` accepts an optional `MediaStreamTrack`. Without one it uses the default microphone. MDN marks the feature "Limited availability … not Baseline". — [MDN start()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start)
- Google's Cloud Speech-to-Text supports `ur-PK`. — [Google Cloud Speech V1 LanguageCodes.Urdu](https://docs.cloud.google.com/dotnet/docs/reference/Google.Cloud.Speech.V1/latest/Google.Cloud.Speech.V1.LanguageCodes.Urdu)

### Inferences
- Speaking state comes from the SFU, so Stream computes it server-side. Reading it costs no API calls, no LLM calls and no Supabase writes.
- Anonymity: if a participant's browser calls `sendCustomEvent`, every receiver gets the sender's `user` in the payload, so it is not anonymous to anyone who opens devtools. A real anonymous feature must post to a NeuraMeet API route, which then sends the event with `sendCallEvent` under a dedicated bot `user_id` such as `neurameet-ai`. The existing guest route already follows this server-send pattern.
- Live Urdu transcription in the browser:
  - On-device mode is very likely unavailable for Urdu, since the packs track the Live Caption list. Hindi (`hi-IN`) is the nearest on-device pack. Spoken Urdu and Hindi are close, but the output comes back in Devanagari.
  - Cloud-mode Chrome Web Speech with `lang="ur-PK"` probably works because Google Cloud STT supports it. Chrome does not document its cloud language list, so this needs a runtime test.
  - Either way, one recognizer is locked to one language, so mixed Urdu-English will be degraded.
- `start(audioTrack)` would let Web Speech read Stream's own local mic track instead of opening a second mic capture. This is the safer path for a project that has already hit camera-loop and device bugs. Support is "limited", though, so feature-detect it and fall back.
- Because a custom event is capped at 5 KB, broadcast only IDs and short text (one card under 1 KB). Never broadcast transcript windows.

### Gaps
- I found no published rate limit for `sendCustomEvent` or `sendCallEvent`. Throttle on the client to at most about 1 event per second per sender.
- I found no official Chrome list of cloud Web Speech languages and could not confirm `ur-PK` in cloud mode. A 5-minute runtime test with `SpeechRecognition.available({langs:["ur-PK"], processLocally:false})` would settle it.
- Not verified: the Chrome version that supports `start(audioTrack)`; the MDN compatibility table did not render.

## Candidate-by-candidate assessment on the actual code (cost per 1-hour, 5-person meeting; effort; risk; reuse)

### Takeaway
The cheapest and best-reused candidates are both near-zero-API features:
- **Ledger cards in the room**, owner-pulled or triggered by keywords, built on the existing `match_ledger_prep_items` RPC and the custom-event channel.
- **Inclusion nudge**, computed purely client-side from `isSpeaking`.

The **anonymous devil's advocate** is cheap, about 10 LLM calls per meeting. It is sound if done server-side.

**"What you missed"** is blocked by a real data gap: stored transcripts have no timestamps.

**Roman Urdu outputs** are almost free in API terms but run into the transcript pipeline's forced English translation.

### Cited Findings (repo facts, local check)
- **Ledger data model:**
  - `ledger_items(id, meeting_id, kind decision|promise, statement, quote, quote_language en|ur|mixed, speaker, assignee, due_date, line_number, status open|kept|reversed, embedding vector(768))`
  - `ledger_links(item_id, evidence_meeting_id, relation kept|reversed, quote, line_number, confidence, state suggested|confirmed|rejected)` — `supabase/schema.sql:323-354`
- **Retrieval already built:**
  - RPC `match_ledger_prep_items(query_embedding, p_user_id, match_count)` returns the owner's open ledger items closest to an embedding.
  - `findPrepLedgerItems` in `src/agent/prep.ts` already embeds text and calls it. `POST /api/prep` returns `ledgerItems` (top 5 open or overdue).
  - `embedTexts` is exported from `src/agent/embed.ts`. — `context/progress-tracker.md` (S1 slice 4 and slice 2)
- **Structured LLM wrapper:** `generateStructuredWithFallback` (Gemini, then Groq) aborts Gemini after 30 s and falls back. — `context/progress-tracker.md` "Gemini time limit"; `src/agent/models.ts`
- **Attendance:**
  - `attendance_events` stores `session_started_at` and `session_ended_at` per join session, and a reconnect opens a new row.
  - It also stores `talk_time_seconds`, `mic_enabled_at` and `mic_toggles`.
  - `talk_time_seconds` accumulates time with the **mic enabled**, not actual speech.
  - Events are posted from `src/hooks/useAttendanceTracking.ts`. — `supabase/schema.sql:167-185`, `src/app/api/attendance/event/route.ts:312-346`
- **Engagement route:** `POST /api/engagement` flags "low engagement" when talk time is under 15% of presence for anyone present over 60 s (`LOW_ENGAGEMENT_RATIO = 0.15`). It then runs an LLM over up to 16,000 transcript chars (`generateSpeakerContributions`). — `src/app/api/engagement/route.ts:13-18`
- **Transcript format:** the generated transcript is merged as plain `SpeakerName: text` lines. Segment `start` seconds are absolute epoch values during the merge but are dropped from the output (`mergeSegmentsToTranscript`). — `src/agent/transcript-generation.ts:202-281`
- **Translation step:** the generated-transcript cleanup prompt translates every non-English line, Arabic-script Urdu included, into English. In its words: "Your final output MUST be entirely in English." — `src/agent/transcript-generation.ts:64`
- **Line parsing:** the Ledger judge prompt treats the text before the first colon as the speaker label and copies quotes exactly from one numbered line. — `src/agent/ledger.ts:309-324`
- **No live transcription:** `src/` contains no Web Speech usage (`SpeechRecognition` / `processLocally` not found), and no use of `isSpeaking`, `audioLevel` or `isDominantSpeaker`. — local `grep`
- **Room complexity:** `MeetingRoom.tsx` is 1,100 lines. Its comments record that `useParticipants()` churn after a camera toggle caused remounts. — local check, `src/components/MeetingRoom.tsx:53`
- **Scope status:** "Urdu English meeting intelligence" and "Anonymous AI devil's advocate" are listed under scope **Deferred** with "needs a decision". The devil's advocate note says it "touches live Stream code, so only after the Promise Ledger is done". — `docs/scope/scope.md:545-550`

### Per-candidate assessment (inferences grounded in the facts above and the prior note's limits)

**1. Live in-call Ledger cards**
- Two variants:
  - **(a) Owner-pulled / start-of-call (recommended core).** On join, the owner's room calls existing `GET /api/ledger`-style data, or a thin new route over `match_ledger_prep_items` seeded with the meeting title and description. A side panel shows open and overdue promises. The owner taps "Raise", which broadcasts `{event:"ledger.card", itemId, statement, assignee, dueDate}` (under 1 KB) through `sendCustomEvent`. After the call, the existing `/api/ledger/match` closes the loop.
    - Cost: 1 embedding call per meeting plus 0 LLM calls, 0 Supabase Realtime and 0 Whisper.
    - Effort: about 3 steps (route, panel, card event and render).
  - **(b) Speech-triggered.** Each participant's browser runs Web Speech on its own mic (labelled by speaker for free). Every 60 s it sends the last window of text, not audio, to a route that embeds it and queries `match_ledger_prep_items`. A card is broadcast only if similarity clears a threshold.
    - Cost if only the owner's client runs the query loop over text that participants relay: about 60 embedding calls per hour plus 0 to 60 Flash-Lite judge calls (only if you add a judge).
    - Whisper fallback instead of Web Speech: about 3,600 audio-seconds of speech per hour, within the 7,200 ASH limit, so about one live meeting at a time.
    - Effort: about 5 to 6 steps.
- **Risk:** (a) is low, because it reuses the proven custom-event listener and touches no device code. (b) is medium-high: a second mic consumer or `start(audioTrack)` next to Stream's microphone manager, untested Urdu recognition, and stale or irrelevant cards.
- **Reuse: highest of all candidates.** It uses the same tables, the same RPC, `embedTexts`, and the existing review and match flow. It also tells a coherent story: the Ledger stops being post-hoc and shows up at the moment of accountability.

**2. Anonymous AI Devil's Advocate**
- **Flow:** a private input in the room posts to a new route, for example `POST /api/room/concern`, with the Clerk-authenticated meeting participant. One `generateStructuredWithFallback` call rephrases the concern neutrally and can return `{ allowed: false }` for abuse. The server then runs `sendCallEvent` with a bot `user_id`, so the `CustomVideoEvent.user` field reveals no one.
- **Cost:** about 300 to 600 tokens per concern. At roughly 10 concerns per meeting that is about 10 calls and about 6K tokens, trivial even against Groq's 200K TPD. It needs 0 Whisper and 0 Realtime.
- **Effort:** about 3 to 4 steps: route plus moderation prompt, bot user upsert, in-room input and card UI, and an optional `room_concerns` table so the concern can feed the Ledger after the call. That table would need adding to the API contract and schema.
- **Risk:** low to medium. It is the same custom-event path that already works for guests. Two caveats:
  - Anonymity is only as strong as the server-send design. A client-sent version leaks identity, as shown above.
  - The rephrase must not strip meaning. Plan a small evaluation.
- **Reuse:** moderate. It reuses the LLM wrapper and the event channel. It ties to the Ledger only if raised concerns are stored and later matched as "decisions challenged".

**3. "What you missed" recap**
- **Data available:** `attendance_events` gives exact absence windows between one session's `session_ended_at` and the next session's `session_started_at`.
- **Data missing:** transcripts are stored as plain `Speaker: text` lines with no timestamps, so absence windows cannot be mapped to lines. The generated transcript has absolute segment starts in memory but drops them.
- **Fixes:**
  - Persist the segments as JSON beside the transcript (a new column or table).
  - Or prefix lines with times. A prefix like `[12:03]` would break the "speaker is before the first colon" convention the Ledger relies on, so use a separate column.
  - Uploaded transcripts will never have timings. An approximate fallback that maps lines proportionally to meeting duration is unreliable.
- **Live variant (recap on rejoin):** this needs live transcription (shared with 1b).
- **Post-call variant:** this largely duplicates the existing Summary tab.
- **Cost:** 1 LLM call per dropout, trivial.
- **Effort:** about 3 steps post-call plus a schema change. Live, it needs 1b first.
- **Risk:** the data gap, not cost.
- **Reuse:** attendance is used well, the Ledger only weakly. It could list "promises made while you were away", which is a nice Ledger tie-in if timestamps exist.

**4. Roman Urdu / Urdu-script outputs and chat**
- **Approach:** add an output-language preference (`en | ur | roman-ur`). Thread it into the prompts of `/api/ai/process`, `/api/ai/chat` and `/api/prep` as an instruction. No new calls are needed when it is applied at generation time. On-demand translation of an existing summary costs 1 call per view.
- **Cost:** about 0 extra.
- **Effort:** about 2 to 3 steps, plus an evaluation, because there is no standard Roman Urdu spelling.
- **Conflict:** the generated-transcript path translates Urdu to English before anything else sees it (`transcript-generation.ts:64`). Urdu-aware output on generated transcripts therefore needs that cleanup made optional. Otherwise the Ledger's `quote_language: ur|mixed` only ever fires on uploaded transcripts.
- **Risk:** low technically. Quality is unbenchmarked; the prior note found no Gemini code-switching benchmark.
- **Reuse:** good with the Ledger, which already tags `quote_language`. It strengthens the Pakistani-context angle, but it is weak as a standalone "wow" feature.

**5. Live inclusion nudge (silent participants)**
- **Approach:** the owner's client samples `participants[].isSpeaking` from `useParticipants()` at 1 Hz in a ref, with no re-render per sample. It accumulates actual speaking seconds and privately nudges the host, for example "Sana hasn't spoken in 15 min". An optional single LLM call can suggest an inviting question using the meeting title.
- **Cost:** 0 API calls, or 1 to 3 LLM calls if suggestions are added. 0 Realtime, since the nudge is local to the host and needs no broadcast.
- **Side benefit:** posting final per-person speaking seconds to the existing `/api/attendance/event` (or a field) would fix the engagement route's proxy. Today it uses mic-on time, which over-credits people who leave the mic open.
- **Effort:** about 2 to 3 steps.
- **Risk:** low to medium. It is read-only on SFU state and touches no devices. The known `useParticipants()` churn means subscriptions must avoid remounting tiles; use a separate small component or the `call.state.participants$` observable. Multiple tabs or reconnects need the open-session logic that already exists.
- **Reuse:** attendance and the engagement route (C3). It is weak with the Ledger and is not unique in the market.

**6. Other cheap candidates the existing data enables**
- **"Promise check-in" agenda at meeting start:** the deterministic `ledgerItems` from `/api/prep` (top 5 open or overdue) shown in the room plus a "raise" card. This is candidate 1a by another name: zero LLM calls, and the strongest demo per unit of effort.
- **Per-person reliability ledger:**
  - SQL over `ledger_items.assignee` and `status`, plus confirmed `ledger_links`, gives kept, overdue and reversed counts per person across meetings.
  - Cost: 0 API calls, about 2 steps (a view or RPC and a page).
  - Caveat: assignee names are free text, so name normalisation is needed (`src/lib/speaker-name.ts` already has `normalizeSpeakerName`).
- **True speaking-time capture:** see candidate 5. This is a data-quality upgrade to existing C3 engagement, not a headline.

### Inferences: ranking for about 1 to 2 weeks of student work (most feasible and coherent first)
1. **In-room Ledger cards, variant (a)** (pre-call agenda plus host-raised cards via custom event). About 3 steps, about 1 embedding per meeting, low Stream risk, maximum Ledger reuse, and a demo that extends the signature feature into the live call.
2. **Anonymous AI Devil's Advocate, server-sent.** About 3 to 4 steps, about 10 LLM calls per meeting, low to medium risk. It is the most novel "live AI" moment and is already a documented runner-up. It can store concerns as Ledger "decisions challenged" for coherence.
3. **Inclusion nudge.** About 2 to 3 steps, zero API cost, low to medium risk (`useParticipants` churn). It quietly fixes the talk-time metric.
4. **Roman Urdu outputs.** About 2 to 3 steps, about zero cost. It is a quality and localisation upgrade rather than a headline, and needs the English-only cleanup revisited.
5. **Speech-triggered live Ledger cards (1b).** About 5 to 6 steps, medium-high risk: second mic consumer, Urdu recognition unverified, and the project's history of camera-loop and sfuClient bugs. Treat it as a stretch on top of 1a.
6. **"What you missed".** Blocked by the missing transcript timestamps; it needs a schema change first, and the live version depends on 5.

Combined budget for 1a, 2 and 5 together in one 1-hour, 5-person meeting:
- About 1 embedding call, about 10 to 13 LLM calls (under 10K tokens), 0 Whisper seconds and 0 Supabase Realtime messages (Stream custom events carry everything). Event count is about 10 to 20 custom events.
- The binding constraint is the unverified Gemini RPD, which the existing Groq fallback covers.

Stream risk flag: every live candidate must follow the permanent AGENTS.md rule and check the `stream-react` skill (`references/VIDEO.md`) before coding.
- The lowest-risk pattern is the one already proven: a listener for `call.on("custom")` plus a server-sent `sendCallEvent`.
- Anything that opens a second microphone capture (Web Speech without `start(track)`) or subscribes to participant arrays inside the tile tree carries the highest regression risk.

### Gaps
- Not measured: actual browser CPU and mic contention with Web Speech running beside Stream's microphone manager on this app.
- No source found for whether Stream custom events count against any free-tier quota or credit (pricing lists participant minutes, not events).
- Assignee and speaker name normalisation quality across meetings is untested, which matters for the per-person reliability ledger.
- Live Urdu recognition quality (Web Speech `ur-PK` cloud, or `hi-IN` as a proxy) is untested. Do a runtime spike before committing to 1b or a live "what you missed".
