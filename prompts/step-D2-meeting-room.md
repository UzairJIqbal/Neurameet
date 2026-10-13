# Step D2 — Meeting Room redesign

**Phase:** Meeting Experience Polish (after D0 audit, after D1)
**Source of truth:** `prompts/step-D0-audit.md` §5 (D2). Progress tracker: D0 ✅, D1 ✅, D2 ⬜.
**Zero-cost rule:** Stream free tier only. No paid plan, no paid design tool.
**Design source:** No design image exists for the live Meeting Room (confirmed in D0). Implement from Zoom/Google Meet patterns + locked `context/ui-tokens.md`. The Design Fidelity Rule does NOT apply (no image to match).
**Stream SDK verified against:** `node_modules/@stream-io/video-react-sdk/dist/**/*.d.ts` (video-react-sdk 1.40.2 / video-client 1.57.0). Live Stream MCP not connected this session, so type-def verification is the fallback per AGENTS.md permanent rule.

---

## 1. Scope (what D2 is)

D2 is the **aesthetic + controls pass** for the in-call screen. It does NOT add new Stream signaling features.

### In scope (D2)
- **D2a — Top bar + restyled control bar**
  - New **top bar** (fixed, above the video stage): meeting title, elapsed timer, participant count.
  - **Restyle the bottom control bar** so every control reads as icon + label, consistent with `ui-tokens`. Keep `CallControls` (its actions stay on Stream's `CallControls` — do NOT reimplement signaling). Add labels to the two custom controls (participants toggle, layout dropdown) so the whole bar is icon+label.
  - **Move `CallStatsButton`** out of the primary bar into a settings/kebab menu.
  - Keep `EndCallButton` (owner-only "End call for everyone", hidden for personal rooms) and its `OnLeave` → `reportLocalLeave()` + `router.push("/")`.
- **D2b — Panel & stage polish**
  - Participant panel (`CallParticipantsList` container): tokened border/background, cleaner spacing.
  - Cleaner gallery/stage spacing for `PaginatedGridLayout` / `SpeakerLayout` (keep the grid / speaker-left / speaker-right switching).
  - Remove raw `text-white` from the custom controls (token violation) → `text-inverse-on-surface`.

### Deferred to their own steps (explicit D0 split — do NOT build here)
- **Reactions** (`Reaction` + `ReactionsButton`) → **D3.1**.
- **In-call participant `Search`** → **D3.2**.
- Rationale: the D0 audit lists reactions and Search under BOTH D2b and D3.1/D3.2. The D0 decision locks them as net-new Stream features, one per step. Shipping a stub in D2 would be dead UI (this project's whole point is fixing dead UI), so they wait for their dedicated `/architect`+`/develop` pass.

---

## 2. File to modify

- `src/components/MeetingRoom.tsx` — the only file. (No new file; no new route; no backend; no schema change.)

---

## 3. Must preserve (verified existing behavior — do not break)

- `CallLayout` defined **OUTSIDE** the component (stable identity; prevents the "Maximum update depth exceeded" camera-toggle loop). Keep it exactly as is.
- Attendance reporting: `useAttendanceTracking().reportLocalLeave()` on leave (`OnLeave`). Untouched.
- `EndCallButton` leave-for-everyone flow (owner only). Untouched.
- `useSearchParams()` usage (already inside a Suspense boundary; build passes). Keep.
- `layout` state + the existing layout `DropdownMenu` (drives `CallLayout`). Keep.
- `showParticipants` state + `CallParticipantsList` panel. Keep (restyle container only).
- `CallControls onLeave={OnLeave}` (the primary leave button → attendance + router). Keep.

---

## 4. Implementation detail

### 4.1 Top bar
Add a `fixed top-0 inset-x-0 z-40` bar, `bg-inverse-surface/95 backdrop-blur` with a bottom hairline `border-b border-outline-variant/20`. Three zones:
- **Left:** meeting title — from `useCallCustomData().description` (the call's custom data; NeuraMeet writes `custom.description` on create: "Instant Meeting" / "Scheduled Meeting" / "<topic>'s Meeting Room"). Type the custom data as `{ description?: string }` (the SDK returns `Record<string, any>`; cast locally, no raw `any` in our code). Fallback label `"Meeting"` when empty.
- **Center:** elapsed timer — local `useState<number>` (seconds) + `useEffect` `setInterval(1000)` started when `callingState === CallingState.JOINED`; cleared on unmount. Format `mm:ss`, or `h:mm:ss` past an hour. Use `JetBrains Mono` (`label-mono` token style: `font-mono text-label-mono`) for the timer digits.
- **Right:** participant count — `useParticipantCount()` (SDK hook) rendered as an icon (`Users`) + count, e.g. "3".

Hooks: pull from `useCallStateHooks()`: `useCallCustomData`, `useParticipantCount`, `useCallCallingState`, `useParticipants` (already used). These are read-only — no Stream lifecycle/device/event change, so the AGENTS.md Stream-verification trigger is not engaged; names/props already confirmed in the type defs.

### 4.2 Control bar (bottom)
Wrap the existing controls in a centered **pill**: `mx-auto flex w-fit items-center gap-2 rounded-2xl border border-outline-variant/20 bg-inverse-surface/95 px-3 py-2 backdrop-blur`. Keep the controls in this order:
1. `CallControls onLeave={OnLeave}` (mute, camera, share, built-in participants/layout/leave — already icon+label).
2. Custom **Participants** toggle: existing `<Button onClick={() => setShowParticipants(prev => !prev)}>` — add a visible label next to `<Users>` ("People"), retoken `text-white` → `text-inverse-on-surface`, hover `hover:bg-inverse-on-surface/10`.
3. Custom **Layout** dropdown trigger: existing `DropdownMenu` with `<LayoutList>` — add a visible label ("Layout"), retoken `text-white` → `text-inverse-on-surface`.
4. **Settings/kebab**: new `DropdownMenu` with a `Settings` (lucide) trigger; inside its `DropdownMenuContent` place `<CallStatsButton />` (moved out of the primary bar per D2a). Keep `CallStatsButton` import.
5. `EndCallButton` (unchanged; hidden for personal rooms).

Remove the now-redundant standalone `<CallStatsButton />` from the primary bar (it moves into the kebab).

### 4.3 Participant panel + stage
- `CallParticipantsList` container: replace the ad-hoc `fixed inset-y-20 right-2 ... bg` treatment with a tokened panel — `bg-surface-container-lowest border border-outline-variant rounded-lg` on the static (sm+) view, keep the mobile slide-in (`show-block`) behavior. Keep `onClose={() => setShowParticipants(false)}`.
- Stage: give `CallLayout` wrapper a little breathing room — `p-2 sm:p-4` and ensure the video area clears the new top bar (`mt-16` instead of `mt-2`). Keep `max-w-[1000px]` centering.

### 4.4 Tokens (from `context/ui-tokens.md`)
Use only: `inverse-surface`, `inverse-on-surface`, `surface-container-lowest`, `outline-variant`, `on-error-container`/`error` (leave button already uses `bg-error text-on-primary`), `primary-container` (active/accents if needed). No raw hex, no raw Tailwind color classes, no `text-white`. Fonts: Hanken Grotesk (UI) + JetBrains Mono (timer digits, `font-mono`).

---

## 5. Verify (D2)
- `npx tsc --noEmit` clean.
- `npm run build` exit 0.
- Manual (real Clerk + Stream session, needs camera/mic + browser the sandbox lacks): join a call → top bar shows title + counting timer + participant count; control bar shows icon+label controls; kebab opens Call Stats; participants panel toggles and is tokened; layouts switch (grid / speaker-left / speaker-right); leave logs attendance and routes home; owner sees "End call for everyone".
- If the dev server cannot be exercised here (no credentials/browser), run the build + typecheck and state that the live walkthrough is blocked, same as D1.

---

## 6. Out of scope
- Reactions (D3.1), in-call Search (D3.2), RingingCall (D3.3), CallRecordingList (D3.4), screen-share/layout/Tooltip/StreamTheme polish (D3.5) — each its own step, zero-cost verified first.
- Any backend/schema/AI change.
- Deploy (Step 11).
