# Step — Dashboard live data (replace static/mock with real user-scoped data)

Last updated: 2026-08-16

## Context

The A0 audit + A4/A5 work left the Dashboard as the only authenticated product
screen still on hardcoded sample data: a `meetings` array (Sprint Planning /
Client Discussion / Weekly Standup) and a `followUps` array, plus a hardcoded
greeting name "Uzair" and fixed counts. Every other product screen (Meeting
Intelligence, Follow-ups, Recording, Previous/Upcoming via Stream) already reads
real, user-scoped data. This step wires the Dashboard to the same real data.

Scope (confirmed with /architect): **Dashboard only**. Landing-page marketing
mockups (`MeetingHistory.tsx`, `LandingHero.tsx`) are intentional public showcases
and are NOT touched. No new API routes, no server-component refactor — reuse the
existing `/api/meetings` and `/api/follow-ups` (both user-scoped via Clerk).

## Decisions (confirmed)

- Fetch client-side in `DashboardContent` (already `"use client"`) using
  `useEffect` + `fetch`, identical to `MeetingList` / `FollowUpList`.
- Greeting becomes dynamic: Clerk `useUser()` first name + time-of-day prefix;
  summary counts derived from fetched data (meetings "today" + open follow-ups).
- A5 upgrade: "Open Insights" → `/meeting-intelligence/[id]`; follow-up CTA →
  `/follow-ups/[id]` (real IDs now exist; replaces the list-route placeholders
  built in A5).
- Icons: one consistent icon per row, no fake per-meeting colors —
  `FileText` for meetings, `ListChecks` for follow-ups (matches the real lists).
- Show latest **3** meetings and **3** follow-ups (compact dashboard; "View All"
  links to the full lists). Empty states ("No meetings yet" + Upload CTA;
  "No follow-ups yet") and a shared `isLoading` state with `<LoaderOne />`.
- **UI consistency (refinement):** the Meeting Follow-ups panel uses the same
  row-table style as Meeting Intelligence (icon + title/source in col-span-6,
  a meta column col-span-3, "Open" action col-span-3) so the two columns read as
  a matched pair. Follow-ups meta column shows the due date.

## Scope (in)

- `src/components/DashboardContent.tsx`
  - Import `useUser` from `@clerk/nextjs`, `MeetingListItem` + `FollowUpItem` from
    `@/lib/meeting-types`, `LoaderOne` from `./ui/loader`.
  - Remove the hardcoded `meetings` and `followUps` const arrays + their sample
    comments. Replace with `useState<MeetingListItem[]>` / `useState<FollowUpItem[]>`
    and a shared `isLoading` flag.
  - `useEffect` (on mount): `Promise.all([fetch("/api/meetings"),
    fetch("/api/follow-ups")])`; parse `{ meetings }` / `{ followUps }`; on error
    `toast.error` + empty arrays; `finally` clear `isLoading`. (Both routes are
    user-scoped already.)
  - Header: compute first name via `useUser()` (`user?.firstName ?? "there"`);
    "Good morning/afternoon/evening" from `new Date().getHours()`. Counts:
    `meetingsToday` = meetings whose `startedAt ?? createdAt` date == today;
    `openFollowUps` = followUps with `status !== "completed"`. Render
    "You have N meeting(s) today and M follow-up(s)."
  - Meeting Intelligence panel: while `isLoading` show `<LoaderOne />`; if empty
    show "No meetings yet." + Upload Transcript button (`router.push("/dashboard")`
    won't help — use the existing upload modal `setShowUploadModal(true)`); else map
    `meetings.slice(0,5)` → title, date (`startedAt ?? createdAt` →
    `toLocaleDateString()`), `FileText` icon in `bg-surface-container text-primary`,
    "Open Insights" button → `router.push(`/meeting-intelligence/${m.id}`)`.
  - Follow-ups panel: same loading/empty pattern; map `followUps.slice(0,5)` →
    `actionTitle` (title), `meetingTitle` (source), `ListChecks` icon, CTA button
    (`View Task`/`Review` kept as labels, or a single "Open") →
    `router.push(`/follow-ups/${fu.id}`)`.
  - Keep quick actions, top search input (dead until A6), and AI/notification
    buttons exactly as they are.

## Scope (out)

- Landing-page mockups (out of scope per decision).
- Previous/Upcoming/Recording/MI/FollowUps lists (already real).
- New API routes, server-component refactor, Supabase calls from the component
  (AGENTS.md: no DB/AI in components — routes own reads).
- A6 global search (separate).
- A7 landing footer (separate).

## Acceptance criteria

1. Dashboard "Meeting Intelligence" list shows the signed-in user's real meetings
   (title + date), not the Sprint Planning sample rows.
2. Dashboard "Meeting Follow-ups" list shows real follow-ups (action title +
   source meeting), not the sample rows.
3. Greeting shows the signed-in user's first name and counts derived from real
   data.
4. "Open Insights" opens `/meeting-intelligence/[realId]`; follow-up CTA opens
   `/follow-ups/[realId]`.
5. Loading and empty states render gracefully (no crash when a user has none).
6. `npx tsc --noEmit` clean and `npx next build` exits 0.

## Verification

- `npx tsc --noEmit`
- `npx next build` (lint skipped in sandbox; re-run `npm run lint` in real env if
  it hangs).
- Manual: sign in → Dashboard shows real meetings/follow-ups; greeting uses your
  name; click "Open Insights" → detail page; click a follow-up CTA → detail page;
  with a fresh account (no data) the empty states appear.
