# Step D3.3 — Surface CallRecordings in the Meeting Room

**Phase:** Meeting Experience Polish (D3+ new Stream functionality)
**Branch:** `fix/graceful-degradation-g1-g2` (uncommitted; do not push without approval)
**Zero-cost rule:** Stream free tier only. Core SDK component, no new package/plan.

---

## 1. Why this step (from D0 audit)

D0 committed a D3+ backlog of clearly-free Stream features:
- D3.1 Reactions ✅
- D3.2 In-call participant Search ✅ (satisfied by SDK `CallParticipantsList` from D2b, no code)
- **D3.3 `RingingCall` lobby/ringing UX** — RE-SCOPED OUT (see §2)
- D3.4 `CallRecordingList` surfacing
- D3.5 Screen-share prominence + `Tooltip`/`StreamTheme` polish

`RingingCall` was found to be a **non-fit** for NeuraMeet: it only renders meaningfully during `CallingState.RINGING`, which requires a "ring out to specific members" flow (`call.call({ members })`). NeuraMeet joins by link/ID via `call.join()` only, so RINGING never occurs — wiring `RingingCall` would be dead UI (the exact thing the A0 audit exists to kill). D3.3 is therefore **re-pointed to `CallRecordingList` surfacing**, promoting D3.4's content. `RingingCall` is moved to the D0 verify-first / out-of-scope notes.

## 2. Decision locked (from `/architect` session 2026-08-20)

- **Feature = `CallRecordingList` in the Meeting Room.** Not `RingingCall`.
- **Meeting detail page is UNCHANGED.** `src/components/meeting-intelligence/RecordingTab.tsx` already surfaces recordings (custom, ui-token-styled, fetches `/api/recordings`). Replacing it with the Stream component would be over-build + visual-regression risk. The net-new deliverable is the **Meeting Room panel only**.
- **Brand the rows, not the wrapper.** Stream's `CallRecordingList` ships light-themed default rows (`str-video__*` classes) that clash with the dark `inverse-surface` Meeting Room. Pass **custom `CallRecordingListItem` / `CallRecordingListHeader` / `EmptyCallRecordingList` / `LoadingCallRecordingList`** rendered with ui-token classes, keeping the component's built-in refresh/empty/loading orchestration. (Resident alternative to `StreamTheme` dark.)
- **Placement = same toggle/panel pattern as the existing participants panel** (a "Recordings" icon+label control-bar button toggling a right-side panel).

## 3. SDK facts (verified against installed type defs)

- `@stream-io/video-react-sdk` **1.40.2**, `@stream-io/video-client` **1.57.0**.
- `CallRecordingList` (free, core) — props: `callRecordings: CallRecording[]`, `loading?: boolean`, `onRefresh?: () => void`, plus optional custom `CallRecordingListHeader` / `CallRecordingListItem` / `EmptyCallRecordingList` / `LoadingCallRecordingList` component overrides. Confirmed in `node_modules/@stream-io/video-react-sdk/dist/src/components/CallRecordingList/CallRecordingList.d.ts`.
- `CallRecording` type lives in `@stream-io/video-client` (`gen/coordinator/index.d.ts`): `{ end_time, filename, recording_type, session_id, start_time, url }`. Import as `import type { CallRecording } from "@stream-io/video-client";`.
- Recordings fetched via `call.queryRecordings(): Promise<ListRecordingsResponse>` → `{ recordings: CallRecording[] }` (confirmed on `Call.d.ts:728`; `ListRecordingsResponse.recordings` confirmed).
- Default sub-components render `str-video__call-recording-list__*` light-themed rows → custom overrides required for the dark UI.

## 4. Files touched

- `src/components/MeetingRoom.tsx` — the only file changed.

## 5. Implementation

### 5.1 Imports
Add to existing imports:
- `@stream-io/video-react-sdk`: add `CallRecordingList`.
- Add `import type { CallRecording } from "@stream-io/video-client";`
- `react`: add `useCallback` (alongside `useState`, `useEffect`).
- `lucide-react`: add `ListVideo`, `RefreshCw` (alongside existing icons).

### 5.2 State (inside `MeetingRoom`, alongside `showParticipants`)
- `const [showRecordings, setShowRecordings] = useState(false);`
- `const [recordings, setRecordings] = useState<CallRecording[]>([]);`
- `const [recordingsLoading, setRecordingsLoading] = useState(false);`
- `loadRecordings` (memoized with `useCallback`, deps `[call]`):
  ```ts
  const loadRecordings = useCallback(async () => {
    if (!call) return;
    try {
      setRecordingsLoading(true);
      const { recordings: recs } = await call.queryRecordings();
      setRecordings(recs ?? []);
    } catch (err) {
      console.error("Failed to load recordings:", err);
      setRecordings([]);
    } finally {
      setRecordingsLoading(false);
    }
  }, [call]);
  ```
- `useEffect(() => { if (showRecordings) void loadRecordings(); }, [showRecordings, loadRecordings]);`

### 5.3 Custom branded sub-components (module scope, like `CallLayout` / `formatElapsed`)
- `RecordingsPanelItem({ recording }: { recording: CallRecording })` → `<li>` with filename (`recording.filename || "Recording"`) + start/end times (formatted via a small `formatRecTime(iso)` helper using `new Date(iso).toLocaleString()`, guarded against invalid dates) + an "Open" anchor (`recording.url`, `target="_blank" rel="noreferrer"`) styled with `bg-primary-container text-on-primary hover:bg-primary` token classes.
- `RecordingsPanelHeader({ callRecordings, onRefresh })` → title "Recordings" + count + a tokened refresh `button` (`aria-label="Refresh recordings"`, `RefreshCw` icon) when `onRefresh` provided.
- `RecordingsPanelEmpty` → tokened centered "No recordings available for this meeting yet."
- `RecordingsPanelLoading` → tokened centered "Loading recordings…".

All use ui-token classes only (never raw hex / raw Tailwind color classes).

### 5.4 Control bar (next to the People button)
Add a **Recordings** button (icon `ListVideo` + label "Recordings", same styling as People/Reactions, with `showRecordings` active state `bg-inverse-on-surface/10`). `onClick`:
```ts
onClick={() => { setShowRecordings((p) => !p); setShowParticipants(false); }}
```
And update the existing **People** button `onClick` to also close recordings:
```ts
onClick={() => { setShowParticipants((p) => !p); setShowRecordings(false); }}
```
This keeps a single right-side panel slot (recordings and participants never overlap).

### 5.5 Recordings panel (alongside the participants panel block)
Mirror the participants panel wrapper:
```tsx
<div className={cn(
  "fixed inset-y-16 right-2 z-40 hidden w-[calc(100vw-1rem)] max-w-[350px] rounded-lg border border-outline-variant bg-surface-container-lowest sm:static sm:ml-2 sm:h-[calc(100vh-10rem)]",
  { "show-block": showRecordings },
)}>
  <CallRecordingList
    callRecordings={recordings}
    loading={recordingsLoading}
    onRefresh={() => void loadRecordings()}
    CallRecordingListItem={RecordingsPanelItem}
    CallRecordingListHeader={RecordingsPanelHeader}
    EmptyCallRecordingList={RecordingsPanelEmpty}
    LoadingCallRecordingList={RecordingsPanelLoading}
  />
</div>
```

### 5.6 Preserve all robust logic (DO NOT change)
- `CallLayout` stays defined OUTSIDE the component (stable identity — avoids the "Maximum update depth exceeded" loop).
- `OnLeave` still calls `reportLocalLeave()` then `router.push("/")`.
- Attendance tracking, layout switching, reactions, stats button, `EndCallButton` — untouched.
- Stream global CSS already imported in `src/app/layout.tsx` (no change).

## 6. Out of scope
- Changing the meeting-detail `RecordingTab.tsx` (already works, on-brand).
- Building a `RingingCall` ring-out flow (product-level, not requested).
- Any new backend tables, AI features, payments, deploy.

## 7. Verify
- `npx tsc --noEmit` → clean (EXIT 0).
- `npm run build` → exit 0.
- Manual (sandbox can't run Clerk+Stream creds; document steps): join a call that has a recording (or start/stop one), open the **Recordings** panel → confirm list shows filename + times, refresh works, empty state when none; leave → attendance still logged.
- After success: update `context/progress-tracker.md` and `context/ui-registry.md` — mark D3.3 closed as "CallRecordingList surfacing (Meeting Room)"; note in `prompts/step-D0-audit.md` that `RingingCall` is moved to verify-first/out-of-scope.

## 8. Records to update
- `context/progress-tracker.md`: D3.3 ✅ (re-pointed from RingingCall → CallRecordingList).
- `context/ui-registry.md`: add the new "Recordings" control-bar button + panel entry.
- `prompts/step-D0-audit.md`: move `RingingCall` from committed D3+ list to verify-first/out-of-scope note.
