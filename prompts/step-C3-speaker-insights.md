# Step C3 — Speaker Engagement Insights

> Architect pass done. UI entry = new "Engagement" tab on the meeting-intelligence/[id] detail page. Attribution = AI inference from transcript + known attendance names. No new DB table (Layer 3 reuses existing tables). Zero cost (Gemini primary + Groq fallback, reuse `generateStructuredWithFallback`).

## Goal

Per-speaker engagement for a single meeting, computed on demand (no persistence), surfaced as a new **Engagement** tab on the existing meeting-detail page. Combines:
- **Measured presence / talk-time** from `attendance_events` (deterministic aggregation).
- **AI-attributed contributions** from the transcript (`transcripts.raw_text`) via `generateStructuredWithFallback`.

Low-engagement speakers are flagged deterministically (talk-time ratio) and/or by the AI.

## Context / patterns to reuse
- `src/agent/prep.ts` + `src/app/api/prep/route.ts` — on-demand generation, `generateStructuredWithFallback`, `auth()` 401 / `try-catch` 500 pattern.
- `src/agent/models.ts` — `generateStructuredWithFallback({ schema, prompt })` (Gemini → Groq `openai/gpt-oss-20b`).
- `src/app/api/meetings/[id]/route.ts` — ownership-checked meeting fetch + parallel Supabase queries.
- `src/lib/attendance-pdf.ts` (`AttendanceRow`) + `src/lib/meeting-types.ts` — attendance/type shapes.
- `src/components/meeting-intelligence/MeetingTabs.tsx` + `OverviewTab.tsx` + `SearchPage.tsx` — tab + token-consistent UI conventions.
- `src/hooks/useAttendanceTracking.ts` — each participant writes their own `attendance_events` row; columns: `user_id`, `participant_name`, `participant_email`, `session_started_at`, `session_ended_at`, `talk_time_seconds`, `mic_toggles`, `camera_toggles`. One row per join session; reconnects close + reopen.

## Data facts
- `meeting_chunks` has **no speaker column**. The transcript is `transcripts.raw_text` (full text, never empty when a transcript exists).
- Attendance is per-local-participant; a meeting may have zero `attendance_events` rows (older / transcript-only meetings). A meeting may also have a transcript but no attendance. Both cases must degrade gracefully — not error.
- Client components must NOT import from `src/agent/*` (it is `server-only`). Shared response types go in `src/lib/meeting-types.ts`.

## Implementation

### 1. `src/lib/meeting-types.ts` — add types (client-safe)
```ts
export interface SpeakerInsight {
  name: string;
  email: string | null;
  present: boolean;                 // appears in attendance_events
  sessions: number;                 // number of attendance rows aggregated
  totalTalkTimeSeconds: number;     // summed talk_time_seconds
  totalDurationSeconds: number;     // summed (ended_at - started_at) for ended rows
  talkTimeRatio: number;            // totalTalkTimeSeconds / totalDurationSeconds (0 if no duration)
  micToggles: number;
  cameraToggles: number;
  contributions: string[];          // AI from transcript; [] if no transcript / not found
  keyTopics: string[];              // AI from transcript; [] if none
  lowEngagement: boolean;
  lowEngagementReason: string | null;
}

export interface SpeakerEngagementResponse {
  meetingId: string;
  hasTranscript: boolean;
  hasAttendance: boolean;
  overallSummary: string;           // AI overall takeaway; fallback note when no transcript
  speakers: SpeakerInsight[];
}
```

### 2. `src/agent/speaker-insights.ts` (new, `import "server-only"`)
- Export `SpeakerContributionSchema` (Zod) and `SpeakerContribution` type:
  ```ts
  export const SpeakerContributionSchema = z.object({
    overallSummary: z.string(),
    speakers: z.array(z.object({
      name: z.string(),
      contributions: z.array(z.string()),
      keyTopics: z.array(z.string()),
      lowEngagement: z.boolean(),
      lowEngagementReason: z.string().nullable(),
    })),
  });
  ```
- Export `generateSpeakerContributions(params)` where `params = { transcriptText: string; knownNames: { name: string; talkTimeSeconds: number; durationSeconds: number }[]; meetingTitle?: string; category?: string | null }`.
  - Build a prompt that: lists the known participant names + their measured talk-time/duration (so the model can cross-check "present 20 min, said little"); includes the transcript text (capped ~16k chars); instructs the model to attribute `contributions` and `keyTopics` to the known names where possible, surface any additional speakers found in the transcript (by the name as written), and set `lowEngagement` + `lowEngagementReason` for speakers who were present/mentioned but contributed little (thin or absent contributions, or a large presence with negligible talk-time).
  - Include a HARD REQUIREMENT like prep.ts: contributions/keyTopics must be drawn only from the transcript; do not invent; return `[]` when a known name has no attributable content.
  - Call `generateStructuredWithFallback({ schema: SpeakerContributionSchema, prompt })`.
  - Throws on failure (route surfaces a 500, consistent with C1/C2 "fail visible" approach).

### 3. `src/app/api/engagement/route.ts` (new, `runtime = "nodejs"`)
- `POST` handler. `auth()` → 401 if no `userId`.
- Body: `{ meetingId: string }`. 400 if missing/empty.
- Steps (all in a `try/catch` → 500 with `err.message`):
  1. Ownership-checked meeting fetch: `supabase.from("meetings").select("id, title, user_id").eq("id", meetingId).eq("user_id", userId).single()`. 404 if not found. **`category` is NOT a column on `meetings`** (it lives on `meeting_insights`); fetch it with a separate `supabase.from("meeting_insights").select("category").eq("meeting_id", meetingId).maybeSingle()` and pass `category ?? null` into the AI call. Selecting `meetings.category` throws Postgres `42703` and makes the whole lookup fail.
  2. `attendance_events`: `select("user_id, participant_name, participant_email, session_started_at, session_ended_at, talk_time_seconds, mic_toggles, camera_toggles").eq("meeting_id", meetingId)`.
  3. Transcript: `supabase.from("transcripts").select("raw_text").eq("meeting_id", meetingId).maybeSingle()` → `hasTranscript`, `rawText`.
  4. Aggregate attendance into speakers keyed by `user_id || participant_email || participant_name`:
     - `sessions` = row count; `totalTalkTimeSeconds` = Σ talk_time_seconds; `totalDurationSeconds` = Σ (ended_at ? (ended-started seconds) : 0); `micToggles`/`cameraToggles` = Σ; `email` = first non-null participant_email; `name` = participant_name || email || "Unknown".
     - `present = true` for all aggregated attendance speakers.
  5. Deterministic low-engagement: for each aggregated attendance speaker with `totalDurationSeconds > 60`, flag if `talkTimeRatio < 0.15` (ratio = talkTime/duration). Keep this flag + a reason string ("Talked for Xs of Ys presence (~Z%)").
  6. If `hasTranscript` and `rawText`:
     - Call `generateSpeakerContributions({ transcriptText: rawText.slice(0, 16000), knownNames: aggregated.map(s => ({ name, talkTimeSeconds, durationSeconds })), meetingTitle, category })`.
     - Merge: for each AI speaker, match to an attendance speaker by case-insensitive name; if matched, fill `contributions`/`keyTopics` and OR the low-engagement flag (prefer AI reason when AI flagged, else keep deterministic reason). If no attendance match, append as a transcript-only speaker (`present: false`, `sessions/talkTime/duration/toggles = 0`, `talkTimeRatio = 0`).
     - `overallSummary` = AI overallSummary.
  7. If no transcript: `overallSummary = "No transcript was uploaded for this meeting, so contributions are based on attendance only."` Speakers = aggregated attendance speakers with `contributions/keyTopics = []` and the deterministic low-engagement flag/reason.
  8. Return `SpeakerEngagementResponse` JSON.
- `hasAttendance = aggregated.length > 0`. If neither transcript nor attendance → still return 200 with empty `speakers` + an explanatory `overallSummary` (not an error).

### 4. `src/components/meeting-intelligence/EngagementTab.tsx` (new client component)
- Props: `{ meetingId: string }`.
- On mount: `fetch("/api/engagement", POST, { meetingId })`; store `SpeakerEngagementResponse | null`, `isLoading`, `error`.
- States (mirror `SearchPage`/`PrepPage` conventions):
  - `isLoading` → `<LoaderOne />`.
  - `error` → error card (no RPC-specific hint; generic "Engagement could not be generated." + `error`).
  - No transcript AND no attendance → empty card: "No engagement data yet. Upload a transcript and/or join the meeting to capture attendance."
  - Else → header + overall-summary card, then a responsive grid of per-speaker cards:
    - Name + (present ? "(attended)" : "transcript only") + low-engagement badge (`bg-error-container text-on-error-container`) when flagged, with the reason as a sub-line.
    - Presence line (only when `present`): `X sessions · spoke Ys of Zs (~R%) · mic N · cam M` using token text classes.
    - Contributions list (`•` bullets) — hide section if empty.
    - Key-topics chips (`bg-primary-container/15 text-primary-container` rounded-full).
- All styling via ui-tokens (no raw hex / no raw Tailwind color classes) — match `OverviewTab`/`SearchPage`.

### 5. `src/components/meeting-intelligence/MeetingTabs.tsx`
- Add `"Engagement"` to the `TABS` const (after "AI Chat").
- Import `EngagementTab` and render `{active === "Engagement" && <EngagementTab meetingId={meetingId} />}`.
- No change to props (already receives `meetingId`). No sidebar change (tab, not page).

## Constraints (from AGENTS.md)
- No new DB table. No new provider/vector store. Gemini primary + Groq fallback only.
- Deterministic numbers (talk-time, duration, toggles) computed server-side — never returned by the LLM.
- Every AI call wrapped in try/catch with Gemini → Groq fallback.
- Client tab imports only from `src/lib/meeting-types.ts` (not `src/agent/*`).
- No over-engineering; keep functions small; `strict` TS, no `any`.

## Verification
- `npx tsc --noEmit` clean.
- `npm run build` exit 0.
- Live (user-driven, like C1/C2): open a meeting that has both a transcript and attendance → Engagement tab shows per-speaker cards with measured talk-time and AI contributions; at least one low-engagement speaker flagged with a reason. Then a transcript-only meeting (no attendance) and an attendance-only meeting (no transcript) each render gracefully (not errors). Document any case that can't be driven from the sandbox.
- Update `progress-tracker.md` and `ui-registry.md` after the feature lands. Keep changes on `fix/graceful-degradation-g1-g2` (uncommitted, per batching rule) unless told to commit.
