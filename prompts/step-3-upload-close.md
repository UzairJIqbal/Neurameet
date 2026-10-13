# Step 3 Closure — Upload Transcript → AI Processing

**Status:** Plan approved. Backend + wiring were written in the WIP checkpoint but do not run end-to-end. This step fixes the runtime bug, repairs the modal UI, fixes the success destination, and verifies live.

**Skills:** `/architect` (done), then implement.
**Context to read first:** `context/architecture.md`, `context/build-plan.md`, `context/ui-tokens.md`, `src/agent/models.ts`, `src/agent/types.ts`, `src/lib/supabase-server.ts`.

---

## Problem

Step 3 code exists and compiles (`npx tsc --noEmit` green), but three issues block a working flow:

1. **Runtime bug — upload 500s.** `src/app/api/transcript/upload/route.ts` inserts a `meetings` row WITHOUT `stream_call_id`. The schema defines `stream_call_id text unique not null` (`supabase/schema.sql:21`). Every upload fails the DB insert → 500 "Failed to create meeting" before AI runs.
2. **Broken UI — modal inputs invisible.** `src/components/UploadTranscriptModal.tsx` body uses retired tokens (`bg-dark-3`, `text-sky-1`, `bg-purple-1`, `bg-dark-2`, `border-dark-4`) that no longer exist in `tailwind.config.ts`. Inputs render with no background/border and white text on the now-light shell → effectively invisible. Feature 3 only retokened the shared shell (`ModalBody`/`ModalContent`/`ModalFooter`), not the modal's own body.
3. **404 destination.** On success the modal routes to `/meeting-intelligence/[id]`, which does not exist until Step 4 → 404.

## Approach

Fix the three issues, then verify live. No new architecture; reuse the existing routes, `withFallback`, and `extractionResultSchema`.

### 1. Fix upload route NOT NULL violation
File: `src/app/api/transcript/upload/route.ts`

In the `meetings` insert, add a synthetic unique `stream_call_id` (uploads have no Stream call):
```ts
stream_call_id: `upload_${crypto.randomUUID()}`,
```
Insert alongside `user_id`, `title`, `status: "ended"`, `started_at`, `ended_at`. Keep all existing validation, error handling, and the `{ meetingId }` response. Leave `transcripts` insert unchanged.

### 2. Retoken the UploadTranscriptModal body
File: `src/components/UploadTranscriptModal.tsx`

Do NOT touch `ModalBody`/`ModalContent`/`ModalFooter` (already fixed in Feature 3). Only retoken the modal's own body. Use the same locked-token mapping Feature 3 applied to `MeetingModel.tsx` (see `context/progress-tracker.md` Feature 3 entry):

- Title input + Paste textarea:
  `bg-surface-container-lowest border-outline-variant text-on-surface placeholder:text-on-surface-variant`
  (replace `bg-dark-3`, `text-white`, `placeholder-sky-1`)
- Drop zone:
  `border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary-container`
  (replace `border-dark-4`, `bg-dark-3`, `text-sky-1`, `hover:border-sky-1`)
- Cancel button:
  `bg-surface-container-lowest text-on-surface border-outline-variant hover:bg-surface-container-low`
  (replace `border-dark-4`, `bg-dark-3`, `text-white`)
- Upload & Process button:
  `bg-primary-container text-on-primary hover:bg-primary`
  (replace `bg-purple-1`, `text-white`)
- Heading `<h4>`: `text-on-surface` (replace `text-white dark:text-white`)
- Processing spinner: `border-outline-variant border-t-primary-container` (replace `border-dark-4 border-t-purple-1`)
- Processing text: `text-on-surface-variant` (replace `text-sky-1`)
- Labels: `text-on-surface-variant` (replace `text-sky-1`)

No hardcoded hex, no raw Tailwind color classes. Keep all behavior (file read, drag-drop, validation, two-step fetch) identical.

### 3. Fix success destination
File: `src/components/UploadTranscriptModal.tsx` → `handleUpload`

Replace:
```ts
router.push(`/meeting-intelligence/${meetingId}`);
```
with:
```ts
router.push("/dashboard");
```
Keep the existing `toast.success("Transcript processed successfully!")` and `onClose()`.

### 4. Verify end-to-end
- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0.
- `npm run dev`, sign in (Clerk), open Upload Transcript, enter a title + paste/attach a `.txt` transcript.
- Confirm: upload returns `meetingId`; process succeeds; `meeting_insights` + `action_items` rows land in Supabase for that meeting (live Gemini, falls back to Groq on failure); modal redirects to `/dashboard`.
- Confirm modal inputs/buttons are now visible and correctly styled.

### 5. Update trackers
- `context/progress-tracker.md`: move Step 3 from Pending to Done (note the NOT NULL fix, modal retoken, redirect change).
- `memory.md`: record Step 3 closure; next up becomes Step 4.

## Out of scope (do NOT build)
- `/meeting-intelligence/[id]` page (Step 4)
- `POST /api/ai/embed` + `meeting_chunks` (Step 5)
- Follow-ups auto-generation (Step 7)
- Extracting extraction logic into `agent/process.ts` (optional structural cleanup, flagged only)

## Invariants to honor
- API routes contain no UI logic; components contain no DB/AI SDK logic.
- All Supabase writes use `supabaseServer()`; queries scoped by `user_id`.
- Every AI SDK call wrapped in try/catch with Gemini→Groq fallback (`withFallback`).
- `transcripts.raw_text` never saved empty (route already guards).
- No hardcoded hex / raw Tailwind color classes in the modal.
