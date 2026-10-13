# P9 — Floating Chat Bubble (presentation-layer only)

Last updated: 2026-08-26
Branch: `fix/graceful-degradation-g1-g2`

## Goal

Add a persistent, collapsed-then-expandable **AI chat bubble** fixed bottom-right,
visible on every authenticated page that renders through `Sidebar_Com` (Dashboard,
Meeting Intelligence, Follow-ups, Settings, Search, Prep, Previous, Recording,
Personal Room, Join Meeting, and the `/ai-chat` page). Reuses the existing `ChatPanel`
(`meetingId` optional) + `POST /api/ai/chat`. No new AI/DB feature, no new API route.

## Decisions (confirmed with /architect)

1. **Mount point = `Sidebar_Com`** (`src/components/Sidebar.tsx`).
   - It is the shared shell for every standard authenticated page (all 14 pages use it).
   - The live meeting room `/meeting/[id]` does NOT use `Sidebar_Com`, so the bubble
     naturally does NOT appear over a live video call (desired).
   - `(root)/layout.tsx` was rejected: it would also cover the live call and still miss
     `after-meeting/[id]` (top-level, not under `(root)`).
2. **Coexistence (keep both existing surfaces):**
   - REMOVE the "Ask AI" quick-action card from `DashboardContent.tsx`.
   - KEEP the MI "AI Chat" tab (`AiChatTab` → `ChatPanel meetingId`).
   - KEEP the `/ai-chat` page (`GeneralChat`); **hide the floating bubble on that exact
     route** so a general chat isn't stacked on a general chat.
   - **Auto-scope the bubble** to the current meeting when the path matches a meeting
     detail route; otherwise it is the general assistant.
   - The Dashboard TopAppBar "Ask NeuraMeet AI" header button is OUT OF SCOPE — left
     as-is (it routes to `/ai-chat`; bubble is hidden there, so no double-chat).

## Changes

### 1. `src/components/meeting-intelligence/ChatPanel.tsx` (small, reusable)

- Add `import { cn } from "@/lib/utils";`
- Add an optional `className?: string` prop to the `ChatPanel` signature.
- Change the root `className` from the hardcoded
  `flex h-[60vh] flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`
  to merge the prop:
  `cn("flex h-[60vh] flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]", className)`.
- Default height stays `h-[60vh]` when `className` is omitted (so the AI Chat tab and
  `/ai-chat` page are unchanged). The bubble passes `className="h-full min-h-0"` so the
  panel flex-fills its container instead of a fixed 60vh.

### 2. NEW `src/components/FloatingChat.tsx` (client component)

Behavior:
- `"use client"`.
- `const pathname = usePathname();`
  - `if (pathname === "/ai-chat") return null;` — bubble hidden on its own full-page twin.
- Derive `meetingId`:
  `const m = pathname.match(/^\/(?:meeting-intelligence|meeting)\/([^/]+)/);`
  `const meetingId = m ? m[1] : undefined;`
- `const [open, setOpen] = useState(false);`
- Collapsed (FAB): `fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full` with
  `bg-primary-container text-on-primary shadow-lg transition hover:scale-105`, a
  `MessageCircle` (lucide) icon, `aria-label="Open AI chat"`, `aria-expanded={open}`.
- Expanded panel (when `open`): `fixed bottom-6 right-6 z-50 flex w-[380px]
  max-w-[calc(100vw-3rem)] max-h-[70vh] flex-col overflow-hidden rounded-2xl border
  border-outline-variant bg-surface-container-lowest shadow-2xl`:
  - Header: `flex items-center justify-between border-b border-outline-variant px-4 py-3`
    with a title (`meetingId ? "Ask about this meeting" : "Ask NeuraMeet AI"`,
    `text-body-md font-semibold text-on-surface`) and a close `X` button
    (`text-on-surface-variant hover:text-on-surface`, `aria-label="Close AI chat"`,
    `onClick={() => setOpen(false)}`).
  - Body: `<ChatPanel meetingId={meetingId} className="h-full min-h-0" />`.
- Escape-to-close: a `useEffect` keydown listener that calls `setOpen(false)` when
  `open && e.key === "Escape"` (cleanup on unmount).
- All colors via existing tokens — NO hardcoded hex / raw Tailwind color classes.
- `Sidebar_Com` persists across route changes within the layout, so `open` state and the
  `ChatPanel` sessionStorage history survive navigation (no remount).

### 3. `src/components/Sidebar.tsx` (mount once)

- `import FloatingChat from "./FloatingChat";`
- Render `<FloatingChat />` as a sibling inside the `Sidebar_Com` returned fragment
  (e.g. right after the content `<div>`). It is `position: fixed`, so it does not disturb
  the sidebar/content flex layout.

### 4. `src/components/DashboardContent.tsx` (remove Ask AI card)

- Delete the 4th `quickActions` entry (title "Ask AI", `iconWrap:
  "bg-primary-container/10 text-primary-container"`, `onClick: () => router.push("/ai-chat")`).
- Result: 4 cards (New Meeting, Join Meeting, Upload Transcript, Schedule Meeting). The
  `lg:grid-cols-3` grid now renders 3 + 1 (left-aligned). This is acceptable and minimal;
  do NOT change the grid columns (P7 locked `lg:grid-cols-3`). If the dangling single card
  looks off later, that is a separate tweak — out of scope here.
- Keep `router` usage (still used by other cards / Open Insights / Open buttons) — no
  unused-var lint fallout.

## Out of scope (explicitly not changed)

- MI "AI Chat" tab, `/ai-chat` page content, `POST /api/ai/chat`, `ChatPanel` AI logic.
- Dashboard TopAppBar "Ask NeuraMeet AI" header button.
- Live meeting room `/meeting/[id]` (no bubble by design).
- Any new persistence beyond `ChatPanel`'s existing sessionStorage.

## Checks (run before reporting done)

- `npm run build` (must stay green; the only pre-existing tsc error is the unrelated
  `AfterMeetingRecap.test.tsx` fixture — not this task's concern).
- Manual: bubble appears bottom-right on Dashboard, MI list, Follow-ups; expands/collapses;
  on a `/meeting-intelligence/[id]` page the header reads "Ask about this meeting" and
  answers are meeting-scoped; on `/ai-chat` the bubble is absent; navigating between pages
  keeps the bubble mounted and its open state.

## Trackers (update after implementation)

- `context/progress-tracker.md`: P9 → done.
- `context/build-plan.md`: P9 → done.
- `context/ui-registry.md`: add `FloatingChat` (mounted in `Sidebar_Com`; bubble hidden on
  `/ai-chat`; auto-scopes on meeting detail routes).
