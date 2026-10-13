# Step P11 — Meeting Intelligence tabs: real-meeting data accuracy audit

## Context
Auditing the Meeting Intelligence tabs against a real F-series (call-generated) transcript surfaced four
data-accuracy defects. Two share one root cause:

- **(a) Attendance Report inactive** on a real F-series meeting.
- **(d) Recording tab always "No recordings"** even though a recording exists.

Root cause: the recap's "Upload Transcript" (`UploadTranscriptModal`) POSTs to `/api/transcript/upload`,
which **always inserts a brand-new `meetings` row with a synthetic `stream_call_id = upload_<uuid>`**.
The Recording tab matches recordings by `r.call_id === meeting.streamCallId`, but the upload meeting's
`streamCallId` is `upload_xxx` — it matches no real Stream call. The *real* call meeting (created by the
attendance lazy-insert, with the genuine `stream_call_id`) owns the recording + attendance, but its
transcript was never attached. So you always view the orphaned copy.

- **(b) Category always "Engineering"** — extraction quality: the process prompt lists categories with
  "Engineering" first, so an F-series transcript about building NeuraMeet gets tagged Engineering by
  first-option bias. Not a linkage bug.
- **(c) Action Items = 0** — extraction quality: model under-extracts commitments, or a genuinely
  sparse meeting.

## Approach (approved via /architect)

### Phase 2 — Linkage fix ((a)+(d))
1. `UploadTranscriptModal`: add optional `meetingId?` + `defaultTitle?` props. Include `meetingId` in
   the `/api/transcript/upload` body; prefill `title` when `defaultTitle` provided. Dashboard + card-hover
   callers leave it unset (keep create-new behavior).
2. `AfterMeetingRecap.tsx` (line ~518): pass `meetingId={recap.id}` + `defaultTitle={recap.title}`.
3. `/api/transcript/upload`: accept optional `meetingId`. If provided AND owned by the caller
   (`select user_id` check, else 403), delete the meeting's existing transcripts and insert the new
   transcript (source `"upload"`) onto it — do NOT insert a new meeting. Else keep current create-new.
4. `RecordingTab`: make the call_id match robust by comparing the id segment after the last `":"`
   on both sides (covers any `type:`-prefix format mismatch between `meetings.stream_call_id` and the
   Stream `call_id`). (d) resolves once the transcript sits on the real meeting.

### Phase 3 — Extraction quality ((b)+(c))
5. `/api/ai/process`:
   - Reorder the category list so "Engineering" is not first; add "Pick the SINGLE most representative
     category; do not default to any."
   - Normalize the model's `category` to a valid `MEETING_CATEGORIES` member (case-insensitive match;
     default `"General"`) before insert, so the badge/select never shows an invalid value.
   - Tighten the action-item prompt: extract commitments even when phrased informally ("we should",
     "let's", "I'll handle"); return `[]` only if the meeting has no commitments/tasks at all.

## Constraints
- Zero-cost rule unchanged. No new providers/tools.
- No Stream SDK event-handler changes → the Stream SDK verification rule does NOT apply.
- Server-only secrets/AI calls stay in API routes.
- Meetings with no attendance (pure uploads, no call) keep the Attendance Report disabled — intended.
- Dashboard/card-hover uploads (no `meetingId`) unchanged.

## Verification
- `npx tsc --noEmit` clean; `npm run build` exit 0; `npm run test:unit` (35 + recap 2/2).
- Live: real EN+UR call → recap → Upload Transcript (now targets the real meeting) → MI tabs:
  Attendance Report **active**, Recording shows the **actual** recording, Category reflects content
  (not always Engineering), Action Items populated when commitments exist.
- Confirm **no** duplicate `meetings` row is created for the recap upload.
- Update `progress-tracker.md` (P11 → ✅) and `build-plan.md`.
