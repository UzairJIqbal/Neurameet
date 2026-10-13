# Step A1 — Make "AI auto-summary on upload" toggle functional

**Status:** Implemented. **Type:** Advanced Pipeline / Layer 1.
**Zero-cost:** localStorage only — no new provider, table, or paid service.

## Problem
The Settings "AI auto-summary on upload" toggle (`SettingsPage.tsx`) writes
`aiAutoSummary` to `localStorage["neurameet:prefs"]`, but nothing reads it — so
it gates nothing. Every upload runs the full pipeline (upload → process → embed)
regardless of the toggle.

## Decisions (from /architect pass)
- **D1 Pref source:** `localStorage["neurameet:prefs"]` (existing) — zero-cost, no new table.
- **D2 Gate point:** client-side in `UploadTranscriptModal.handleUpload` — skip the
  `/api/ai/process` + `/api/ai/embed` fetches when OFF; API routes unchanged.
- **D3 Shared key:** extract `PREFS_KEY` + `UserPrefKey` + `readUserPrefs()` into
  `src/lib/user-prefs.ts`, imported by both `SettingsPage` and the modal.
- **Default:** ON when missing/unreadable (preserves current behavior).

## Changes
1. **`src/lib/user-prefs.ts`** (new) — `PREFS_KEY`, `UserPrefKey`, `DEFAULT_PREFS`,
   `readUserPrefs()` (safe parse, browser-guarded), `writeUserPrefs()`.
2. **`src/components/SettingsPage.tsx`** — import `PREFS_KEY` + `UserPrefKey` from
   the helper; drop the local duplicate. Behavior unchanged.
3. **`src/components/UploadTranscriptModal.tsx`** — after a successful upload, read
   `aiAutoSummary`:
   - ON → current behavior (process + embed, "Transcript processed successfully!").
   - OFF → skip process + embed, toast "Transcript uploaded", still `onClose()` +
     `router.push("/meeting-intelligence/${meetingId}")`.

## Verification
- `npx tsc --noEmit` clean; `npm run build` exit 0.
- Toggle OFF → upload → meeting appears in Meeting Intelligence **without**
  `meeting_insights` / `meeting_chunks` rows for that `meetingId`.
- Toggle ON → full processing lands (summary, action items, category, chunks).
