# Step 8 — Recordings library polish + Settings page

**Goal:** (A) Make the Recordings library page link each recording back to its meeting's
insight page, and (B) build the missing `/settings` page so the sidebar's Settings link
stops 404ing. This closes the last known broken nav link (`constants/index.tsx` already
points Settings → `/settings`, which has no page yet).

**Read before coding:** `context/ui-tokens.md`, `context/ui-rules.md`, `context/ui-registry.md`
(registry patterns for `RecordingPage`/list-card treatment), `src/components/RecordingPage.tsx`,
`src/components/meeting-intelligence/RecordingTab.tsx` (the `recording.call_id === meeting.streamCallId`
match pattern), `src/app/api/meetings/route.ts`, `src/lib/meeting-types.ts`, `src/components/Sidebar.tsx`.

---

## Part A — Recordings library polish (link recording → meeting insights)

### A.1 Expose `streamCallId` on the meetings list API
- `src/lib/meeting-types.ts`: add `streamCallId: string;` to `MeetingListItem`.
- `src/app/api/meetings/route.ts`: add `stream_call_id` to the `.select(...)` column list and
  map it to `streamCallId` in the row→`MeetingListItem` transform. (Additive — `MeetingList`
  ignores the new field; no behavior change there.)

### A.2 Rework `src/components/RecordingPage.tsx`
Keep the existing list-card treatment (`overflow-hidden rounded-xl border border-surface-variant
bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, 12-col header, `divide-y`
rows, `hover:bg-surface-container-low`, `LoaderOne` loading, VideoOff empty state). Changes:

- Fetch **both** `/api/recordings` and `/api/meetings` in the same `useEffect` (`Promise.all`).
  Each fetch wrapped in try/catch; on failure set that list to `[]` and toast (keep current
  "Failed to load recordings" toast; add nothing for meetings failure — just degrade).
- Build a lookup `Map<string, { id: string; title: string }>` keyed by `streamCallId`.
- For each recording, match on `recording.call_id === map.get(call_id)?.id`.
  - If a match exists → the row gets **two** actions:
    - `Play` (secondary/outline: `border border-surface-variant text-primary hover:border-primary
      hover:bg-primary/5`) → opens the recording URL in a new tab (existing `handlePlay` logic).
    - `View insights` (primary: `bg-primary-container text-on-primary hover:bg-primary`) →
      `router.push('/meeting-intelligence/' + meetingId)`.
  - If no match (e.g. upload-sourced meeting with `upload_*` id, or no linked meeting) →
    show only `Play`.
- Column header currently: `Recording | Date | Action`. Keep it; the Action column holds both
  buttons. Buttons sit side-by-side with `gap-2` (wrap on small screens — they already wrap via
  `col-span-12 mt-2 md:mt-0`).
- Recording title cell: keep the `Play` icon chip + filename (substring-safe like today). No change.
- Use `next/navigation`'s `useRouter` (component is already `"use client"`).

**Note the link is meaningful only for Stream-created meetings**; upload-sourced rows correctly
show Play only. Do not invent a meeting for unmatched recordings.

---

## Part B — Settings page (basic preferences)

### B.1 Page + Sidebar wiring
- Create `src/app/(root)/(home)/settings/page.tsx`:
  ```tsx
  import Sidebar_Com from "@/components/Sidebar";
  export default function SettingsPageRoute() {
    return <Sidebar_Com type="settings" />;
  }
  ```
- `src/components/Sidebar.tsx`: add `"settings"` to `SidebarPagesTypes`; add a `settings` import
  + `{ type === "settings" && <SettingsPage /> }` case in `Sidebar_Com`. (Follows the exact
  pattern already used for `followUps` / `meetingIntelligence`.)
- Create `src/components/SettingsPage.tsx` (`"use client"`).

### B.2 `SettingsPage.tsx` (faithful, small, no new backend)
Render inside `Sidebar_Com`'s `bg-surface` shell (no own `bg-surface`/`min-h-screen`):
- `section flex w-full flex-col gap-6 px-6 py-8`.
- Heading `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + muted
  `text-body-md text-on-surface-variant` "Manage your account and preferences".
- **Account card** (`bg-surface-container-lowest rounded-xl border border-surface-variant
  p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]`):
  - Use Clerk `useUser()` for `user.fullName`, `user.primaryEmailAddress?.emailAddress`,
    `user.imageUrl`.
  - Avatar (`h-12 w-12 rounded-full object-cover` from `user.imageUrl`), name `text-on-surface`
    `font-body-md font-medium`, email `text-body-md text-on-surface-variant`. Read-only.
- **Preferences card** (same card treatment): a `divide-y divide-surface-variant` list of 3
  rows, each `flex items-center justify-between gap-4 px-6 py-4`:
  - Label `text-body-md text-on-surface` + optional `text-body-md text-on-surface-variant` sub-label.
  - A small inline **toggle** (two-state button, `role="switch"`, `aria-checked`):
    on = `bg-primary-container` knob `bg-on-primary`; off = `bg-surface-container` knob
    `bg-on-surface-variant`. Built locally inside `SettingsPage` (no new exported component).
  - 3 toggles: "Email notifications", "AI auto-summary on upload", "Desktop reminders".
  - Persist to `localStorage` (key `neurameet:prefs`) with `useState` + a mount effect to hydrate.
    No backend writes — this is UI-only and explicitly out of scope per AGENTS.md.

**Do NOT** add: a dark mode / theme switch (theme is locked), password change (auth is Clerk),
billing (out of scope), or any server action. Keep it to Account + 3 localStorage toggles.

---

## Tokens / rules (must hold)
- Only locked tokens from `context/ui-tokens.md`. No hex, no raw Tailwind color classes.
- Light surfaces only (`surface`, `surface-container-lowest`, `surface-container-low`,
  `surface-variant` borders). No dark shell here.
- Reuse the `RecordingPage`/list-card pattern exactly for the recordings table.
- `react-hot-toast` only for toasts. No `sonner`.
- Every AI/agent call already server-side — Part A/B add no new server calls beyond reusing the
  existing `/api/meetings` + `/api/recordings` GET routes (both already `auth()`-scoped).
- Small functions, explicit types, `strict` TS, no `any`. try/catch around fetches, log + never crash.

## Files
- **Modify:** `src/lib/meeting-types.ts`, `src/app/api/meetings/route.ts`,
  `src/components/RecordingPage.tsx`, `src/components/Sidebar.tsx`.
- **Create:** `src/app/(root)/(home)/settings/page.tsx`, `src/components/SettingsPage.tsx`.

## Out of scope (do not build)
- General `/ai-chat` page (deferred in Step 6).
- Settings persistence backend / Supabase table.
- Editing Clerk profile fields.

## Verification
1. `npx tsc --noEmit` — clean (strict, no `any`).
2. `npm run build` — exit 0.
3. Manual (dev server on :3000, Clerk login):
   - `/settings` loads: Account card shows your Clerk name/email/avatar; 3 toggles flip and
     persist across refresh; no 404; sidebar Settings item highlights when active.
   - `/recording`: rows show `Play`; for a Stream-created meeting that has a Supabase `meetings`
     row, the row also shows `View insights` → lands on `/meeting-intelligence/[id]`. Upload-sourced
     rows show `Play` only. Loading + empty states intact.
4. Update `progress-tracker.md` (close Step 8) and `ui-registry.md` (add `SettingsPage` row) after build passes.
