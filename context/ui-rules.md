# UI Rules

Concise rules for building NeuraMeet UI. The supplied UI reference (Dashboard, Meeting Intelligence, Follow-ups, forms) is the source of truth for visual decisions on new AI-feature screens. Existing Meeting Room / Meeting Setup screens keep their current dark, full-bleed video-call styling — these rules apply to the Dashboard and Meeting Intelligence surfaces being added.

---

## Font

`SUSE Mono` via `next/font/local`, already configured in `src/app/layout.tsx`. Never introduce a second font family for new screens.

---

## Layout

- Sidebar: fixed left, `bg-dark-1`, full height, matches existing `Sidebar.tsx`
- Main content max-width: 1440px
- Main content padding: 24-32px
- Gap between dashboard sections: 24px
- Meeting Intelligence tabs: horizontal tab bar under the selected-meeting header, matches mockup (Overview / Summary / Action Items / Recording / Category / AI Chat)

---

## Sidebar Navigation

Items: Dashboard, Meeting Intelligence, AI Chat, Recordings, Follow-ups, Settings.

- Active item: `bg-dark-4` background, `text-white`
- Inactive item: `text-sky-1`
- No underline — active state is background + text color change only

---

## Cards (Meeting Intelligence / Dashboard insight cards)

```
background: bg-surface (white)
border: 1px solid theme(colors.sky.2)
border-radius: 16px (rounded-2xl)
padding: 24px (p-6)
```

Dashboard quick-action cards and meeting-list rows follow the same card treatment. Meeting Room / Meeting Setup keep their existing dark full-bleed treatment — do not apply this card style there.

---

## Typography Hierarchy

**Page/section heading** — 18-24px, weight 600-700, `text-white` on dark shell / `text-dark-2` on light cards
**Body text** — 14px, weight 400-500
**Muted/label text** — 12-14px, `text-sky-1`

---

## Badges

Pill shape (`rounded-full`), `px-2 py-0.5`, `text-xs font-medium`. Colors per ui-tokens.md status table — never invent a new status color.

---

## Buttons

**Primary (AI actions):**
```
background: bg-purple-1
color: white
border-radius: rounded-xl
padding: px-4 py-2
```

**Secondary:**
```
background: bg-dark-3
border: 1px solid theme(colors.dark.4)
color: white
border-radius: rounded-xl
padding: px-4 py-2
```

Reuse the existing `Button` (`stateful-button.tsx`) component — do not create a parallel button component.

---

## AI Chat Panel

- Message bubbles: user messages right-aligned `bg-purple-1 text-white`; AI messages left-aligned `bg-dark-3 text-white` (dark shell) or `bg-surface-muted text-dark-2` (light card context)
- Streaming responses render token-by-token via AI SDK `useChat` — always show a loading/typing indicator while streaming
- Input bar pinned to bottom of the chat panel, matches mockup

---

## Meeting List / Table

- Row: title, date, action ("Open Insights")
- No alternating row colors
- Row separator: `border-b border-sky-2` (light) or `border-dark-3` (dark)
- Hover state: subtle background shift, no layout shift

---

## Empty States

Every list/tab that can be empty (Action Items, Follow-ups, Recordings, AI Chat before first message) needs a minimal empty state: short muted text + optional icon + CTA if there's a next action (e.g. "No transcript yet — Upload Transcript").

---

## Do Nots

- Never use raw Tailwind color classes (`bg-purple-500`, `text-gray-600`) — use project tokens only
- Never mix the light insight-card style into the Meeting Room video surface, or vice versa
- Never add a second toast library — `react-hot-toast` only, remove `sonner` usage as encountered
- Never show a raw API/AI error to the user — always a human-readable message ("Couldn't generate summary — try again")
- Never block the UI without a loading state during AI processing — always show progress (processing transcript → generating summary → done)
- Never use `position: fixed` for new elements — normal flow layout only, except the existing fixed call-controls bar in Meeting Room
