# Step A0 — Functional UI Audit (canonical spec)

**Status:** DONE — verified by reading every handler (not assumed). No code changed in A0.
**Purpose:** enumerate every dead/non-functional control; this list is the source of truth that drives A1–A7.

## Method
Full fresh walk of the entire app (the four Explore subagents hit an upstream
rate limit, so the walk was done directly with `grep` + file reads). Every
interactive control was classified as functional / dead-routes-nowhere /
dead-noop / state-gates-nothing / no-handler by inspecting its actual handler.

## Canonical dead-control list

| Step | Control | File:line | Classification | Fix direction |
|------|---------|-----------|----------------|---------------|
| **A1** | Settings "AI auto-summary on upload" toggle | `SettingsPage.tsx:62–95` | state-gates-nothing | Read `aiAutoSummary` in the Upload flow; skip `/api/ai/process` + `/api/ai/embed` when OFF |
| **A2** | Settings "Email notifications" toggle | `SettingsPage.tsx:62–95` | state-gates-nothing | `/architect` first — pick zero-cost email path; email on processing-complete when ON |
| **A3** | Settings "Desktop reminders" toggle | `SettingsPage.tsx:62–95` | state-gates-nothing | `/architect` first — browser Notification API against Upcoming meetings |
| **A4** | Dashboard "Meeting Intelligence → View All" | `DashboardContent.tsx:203` | dead-routes-nowhere | Repoint `<a href="#">` → `<Link href="/meeting-intelligence">` |
| **A4** | Dashboard "Meeting Follow-ups → View All" | `DashboardContent.tsx:256` | dead-routes-nowhere | Repoint `<a href="#">` → `<Link href="/follow-ups">` |
| **A5** | Dashboard "Open Insights" (meeting rows) | `DashboardContent.tsx:237` | no-handler | `router.push("/meeting-intelligence")` (or `[id]` once Dashboard is live) |
| **A5** | Dashboard "View Task"/"Review" (follow-up rows) | `DashboardContent.tsx:283` | no-handler | `router.push("/follow-ups")` (folded into A5) |
| **A6** | Dashboard global "Search anything…" input | `DashboardContent.tsx:158–162` | no-handler | `/architect` short pass — decide navigation/filter on submit |
| **A7** | Landing footer 15× `href="#"` links | `LandingFooter.tsx:16–38, 64–85, 114–125` | dead-routes-nowhere | Per-link: real route or remove; no new backend |

**Excluded:** Dashboard Bell button (`DashboardContent.tsx:173–178`) — decorative
status indicator, not a control.

## Verified functional (not dead)
Sidebar nav, Navbar, MeetingRoom controls (CallControls/CallStatsButton/layout/
participants), MeetingList/RecordingPage/Previous/Upcoming/PersonalRoom buttons,
CategoryTab change-category (wired to `updateMeetingCategory`), FollowUpDetails
status buttons (wired to `updateFollowUpStatus`), MeetingModel modal buttons,
FollowUpList rows (real `<Link>`), JoinMeetingPage, UploadTranscriptModal.

## Per-step verification (carried into each A-step)
- A1: toggle OFF → upload → no `meeting_insights`/`meeting_chunks` for that meeting; ON → full processing.
- A2: toggle ON → email fires on processing-complete; OFF → no email.
- A3: toggle ON → browser notification at scheduled meeting start; OFF → none.
- A4: click each View All → correct route loads.
- A5: click Open Insights / View Task / Review → navigation lands.
- A6: type + submit → intended navigation/filter.
- A7: no `href="#"` remains in the footer.
- Gate (all steps): `npx tsc --noEmit` clean + `npm run build` exit 0. `npm run check:providers` before any demo.

## Hard rule
Every third party tool in every A-step must be zero cost — Supabase + Gemini +
Groq + pgvector only. No new paid provider, vector store, PDF service, or host.
