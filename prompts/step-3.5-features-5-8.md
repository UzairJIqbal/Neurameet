# Step 3.5 — Features 5–8: Redesign Previous / Upcoming / Recording / Personal Room to Light List Cards

**Date:** 2026-08-13
**Direction (approved by user):** Redesign these four pages as **light meeting-list / detail cards** matching the locked `meeting-intelligence-list.png`/`.html` pattern — NOT a token-hygiene-only pass. The old dark "lamp + 3D-card + typewriter" aesthetic is at odds with the approved design and is currently broken (its `dark-2`/`dark-3`/`sky-1`/`blue-1` tokens were retired and removed from `tailwind.config.ts`, so cards/dates/accents render unstyled).

## Context (read first)
- `context/ui-tokens.md` (locked tokens), `context/ui-rules.md` (cards, empty states, do-nots), `context/designs/meeting-intelligence-list.html` (light-list reference), `context/designs/join-meeting.png` (card radius/border precedent).
- `src/components/Sidebar.tsx:100` — `Sidebar_Com` renders the sidebar + a `<div className="... bg-surface lg:ml-[260px]">` content shell. The four page components render **inside** this shell. They must NOT add their own `bg-surface`/`min-h-screen` wrapper.
- Icons in this app = **lucide-react** (Material Symbols from the design HTML is NOT loaded). Use lucide for icon chips (e.g. `Calendar`, `Users`, `Video`, `Clock`, `Play`, `Copy`).
- `lib/utils.ts` exports `onJoin(call: Call)` (used by Upcoming "Copy Link") and `getMeetingIdFromLink`. `ui/loader.tsx` exports `LoaderOne` (keep for loading states). `stateful-button.tsx` exports `Button` (used by Personal Room).

## Reference pattern (meeting-intelligence-list.html)
- Page content area: `bg-surface` (already on shell).
- Card: `bg-surface-container-lowest rounded-xl border border-surface-variant` (+ optional `shadow-sm` for elevation — config has no `shadow-level-*` tokens).
- Header row: `grid grid-cols-12 gap-4 px-6 py-4 border-b border-surface-variant bg-surface-container-low/50 text-label-caps uppercase text-on-surface-variant` (cols: Meeting Title / Date / Action).
- Body: `divide-y divide-surface-variant`; each row `grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-surface-container-low`.
- Title cell: icon chip `flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-primary` + `font-body-md font-medium text-on-surface`.
- Date cell: `text-body-md text-on-surface-variant`.
- Action: `inline-flex items-center gap-2 rounded-lg border border-surface-variant px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5`.
- Page heading: `text-display-lg text-on-surface` + small `text-on-surface-variant` count/subtitle.

## Files to modify
1. `src/components/PreviousPage.tsx`
2. `src/components/UpcomingPage.tsx`
3. `src/components/RecordingPage.tsx`
4. `src/components/PersonalRoomPage.tsx`
5. `src/components/SideTitles.tsx` — **leave file in place** but it becomes unused by the 4 pages (stop importing it). Do not delete (scope).
6. `context/ui-registry.md` + `context/progress-tracker.md` — update after build.

Do NOT touch `previous/page.tsx`, `upcoming/page.tsx`, `recording/page.tsx`, `personal-room/page.tsx` (wrappers stay), `Sidebar.tsx`, `tailwind.config.ts`, `LampContainer`/`typewriter-effect`/`3d-card` (leave unused).

## Per-page spec

### PreviousPage (list — `previousCalls` from `useGetCall`)
- Drop `LampContainer`, `CardContainer/CardBody/CardItem`, `TypewriterEffectSmooth`, `SideTitles`, `motion`. Keep `useGetCall`.
- Header: "Previous Meetings" + count `({previousCalls.length})`.
- Loading: `isLoading` → `<LoaderOne />`.
- Empty state: centered muted `text-on-surface-variant` — icon (`History`/`CalendarOff`) + "No previous meetings yet." + optional CTA "Start a meeting" → `/meeting/<user.id>`? Keep minimal: text + icon only (no CTA, consistent with "no next action").
- Rows (Title | Date | Action): title = `call.state.custom?.description?.substring(0,40)` or "Untitled meeting"; date = `call.state.startsAt?.toLocaleString()` or "Date unavailable"; action = "Open" link → `router.push(`/meeting/${call.id}`)`. Icon chip: `Video` (lucide) or `Calendar`.

### UpcomingPage (list — `upcomingCalls` from `useGetCall`)
- Same structure as Previous. Keep `useRouter`, `onJoin`, `LoaderOne`.
- Empty state: "No upcoming meetings." + CTA "Schedule a meeting" (links to `/` dashboard or `/personal-room`? use `/` for now) — keep simple.
- Action column (two actions, wrap on mobile): "Start" → `router.push(`/meeting/${call.id}`)`; "Copy Link" → `onJoin(call)`. Render as two `inline-flex` action buttons (primary-flavored: `bg-primary-container text-on-primary hover:bg-primary` for Start; outline for Copy Link).

### RecordingPage (list — `/api/recordings`)
- Keep the existing `useEffect` fetch (already server-side, correct). Drop `LampContainer`/`3d-card`/`typewriter`/`SideTitles`.
- Header: "Recordings" + count.
- Loading → `LoaderOne`. Empty → "No recordings yet." + icon `VideoOff`.
- Rows: title = `recording.filename?.substring(0,40)` or "Untitled recording"; date = `new Date(recording.start_time).toLocaleString()` or "Date unavailable"; action = "Play" → `handlePlay(recording)` (opens url in new tab). Icon chip `Play`/`Videocam`.

### PersonalRoomPage (detail — NOT a list)
- This is a single-room detail page, not a list. Render a light detail layout:
  - Heading "Personal Meeting Room" `text-display-lg text-on-surface`.
  - Three info rows as cards: `bg-surface-container-lowest rounded-xl border border-surface-variant p-4` — "Topic", "Meeting ID", "Invite Link" (each: `text-label-caps uppercase text-on-surface-variant` label + `text-body-lg text-on-surface break-all` value). Keep existing `Table` helper but retoken it (`bg-dark-3`→`bg-surface-container-lowest`, `border-outline-variant`, `text-sky-1`→`text-on-surface-variant`, `text-white`→`text-on-surface`).
  - Buttons (keep `Button` from `stateful-button`): "Start Meeting" → `bg-primary-container text-on-primary hover:bg-primary`; "Copy Invitation" → outline `border border-surface-variant text-on-surface hover:bg-surface-container-low`. Keep `createMeeting` + copy-to-clipboard + `toast(...)`.
- Drop nothing of the logic; only retoken + light-card the visuals. Keep `bg-surface` from shell (do not add wrapper).

## Token remediation (retired → locked)
| Retired / raw (current) | Locked replacement |
| --- | --- |
| `bg-dark-2` / `bg-dark-3` | `bg-inverse-surface` (only if a dark surface is truly needed) — for these light pages use `bg-surface-container-lowest` / `bg-surface-container-low` |
| `text-white` | `text-on-surface` (light) / `text-inverse-on-surface` (dark) |
| `text-sky-1` | `text-on-surface-variant` |
| `text-slate-100` / `text-neutral-300` | `text-on-surface` / `text-on-surface-variant` |
| `text-blue-1` | `text-primary-container` (accent) |
| `border-black` / `dark:border-white` | `border-surface-variant` |
| `bg-black` / `dark:bg-white` | `bg-primary-container` (CTA) / `bg-surface-container-lowest` (card) |
| `dark:bg-black` / `dark:text-white` | remove `dark:` variants (no dark mode in locked design) |
| `shadow-emerald-500/[0.1]` | drop raw color (use `hover:shadow-sm` or none) |
| `bg-blue-1` (Start Meeting btn) | `bg-primary-container text-on-primary hover:bg-primary` |
| `text-xl … text-white` / `text-2xl` headings | `text-display-lg text-on-surface` |

**Invariants:** no raw hex, no raw Tailwind color classes, no `dark:` variants, no retired tokens. `green-1` stays reserved for status/online dots (not used here). Sidebar remains the only `inverse-surface` dark region.

## Out of scope
- No new routes, no Supabase, no AI. No search/filter/pagination UI (design shows them but pages have no data layer for it — leave out to avoid overbuild).
- Do not delete `LampContainer`/`typewriter-effect`/`3d-card`/`SideTitles` (may be referenced elsewhere; just stop importing).
- `/ai-chat`, `/meeting-intelligence`, `/follow-ups`, `/settings` routes remain unbuilt (later steps).

## Checks (run after implementation)
- `npx tsc --noEmit` — clean.
- `npm run build` — exit 0.
- Manual smoke (user, signed-in browser): each page renders light cards, lists populate from Stream/Supabase recordings, actions work (Open/Start/Copy Link/Play/Start Meeting/Copy Invitation), empty + loading states show.

## Next
After Features 5–8: **Step 1 — Supabase** (new free-tier project from scratch).
