# Step 3.5 — Feature 1 of 8: Meeting Room Audit + Redesign

## Scope

First feature in the Step 3.5 existing-feature audit + redesign sequence (build-plan.md, order matters — one feature at a time). Audit Meeting Room for function + design, fix what's broken, redesign to match the locked token system (`context/ui-tokens.md`).

**Trigger for this feature:** `meeting/[id]` page + `MeetingRoom.tsx` + `MeetingSetup.tsx`.

**No design mockup exists** for Meeting Room (`context/designs/` has no `meeting-room.png`). Per `ui-rules.md`, Meeting Room keeps its dark, full-bleed video-call styling — this is a token-hygiene pass, NOT a layout/visual rebuild. The grid/speaker layouts, controls, participant list, and end-call behavior must remain functionally identical.

## Current State (verified by reading the code)

- `MeetingRoom.tsx` is functionally correct: grid/speaker layouts, `CallControls` (onLeave → `/`), layout dropdown, `CallStatsButton`, participants toggle, `EndCallButton` (hidden in personal room). Returns `LoaderOne` until `JOINED`.
- `meeting/[id]/page.tsx` is functionally correct: loads call via `useGetCallbyId`, `StreamCall`/`StreamTheme`, setup→room gate, "Meeting not available" error state.
- **Real bug:** the app-shell redesign (already done) removed the retired tokens from `tailwind.config.ts`, but these components still reference them:
  - `bg-dark-1/95` (MeetingRoom control bar) — `dark-1` no longer defined → class is purged → **control bar renders with no background** (transparent over video).
  - `bg-dark-1`, `border-dark-1` (layout dropdown) — same, purged.
  - `text-sky-1` (error-state subtitle) — `sky-1` no longer defined → falls back to inherited `text-white`.
- **Hardcoded hex (violates no-hex rule, `ui-tokens.md` invariants):** `bg-[#19232d]` (dropdown trigger + participants button), `bg-[#4c535b]` (hover), `bg-[#19232d]` is the call-control bar alt shade.

## Changes

Map every retired/hex class to the locked token system. Dark shell = `inverse-surface` (#2D303D, single value — never re-split into dark shades). Muted text on dark = `inverse-on-surface/70`.

### `src/components/MeetingRoom.tsx`

| From | To | Why |
| --- | --- | --- |
| control bar `bg-dark-1/95` | `bg-inverse-surface/95` | dark shell surface; keep slight transparency over video |
| control bar `backdrop-blur` | keep (video-call UI — acceptable; not a landing page) | — |
| dropdown trigger `bg-[#19232d] ... hover:bg-[#4c535b]` | `bg-inverse-surface hover:bg-inverse-on-surface/10` | token surface + subtle lighten-on-hover (matches landing hover pattern) |
| dropdown content `border-dark-1 bg-dark-1` | `border-inverse-surface bg-inverse-surface` | token surface |
| participants `Button` `bg-[#19232d] ... hover:bg-[#4c535b]` | `bg-inverse-surface hover:bg-inverse-on-surface/10` | token surface + hover |
| `text-white` stays on section/controls | unchanged | primary text on dark shell is `inverse-on-surface`; `text-white` is acceptable on the dark video surface (existing pattern) — leave as-is unless it reads wrong |

Note: `text-white` is already used pervasively on the dark call surface and is acceptable per `ui-rules.md` ("text-white on dark shell"). Do NOT replace `text-white` with `text-inverse-on-surface` here — keep the change minimal and focused on the dead/hex classes only.

### `src/app/(root)/meeting/[id]/page.tsx`

| From | To | Why |
| --- | --- | --- |
| error-state subtitle `text-sky-1` | `text-inverse-on-surface/70` | muted text token on dark shell (was relying on a retired token) |

### `src/components/MeetingSetup.tsx`

- Audit only. MeetingSetup uses `text-white`, `bg-[#19232d]` is NOT present here; the mic dropdown uses Radix defaults. If any `dark-1`/`sky-1`/hex classes are found during implementation, map them the same way. If clean, leave untouched (note in summary).

## Out of Scope (this feature)

- Layout/sizing/spacing changes to the call surface or control bar.
- Meeting Setup redesign beyond token-hygiene audit (that is feature 2).
- New Meeting / Join Meeting / Previous / Upcoming / Recording / Personal Room (features 3–8).
- Any Stream SDK logic, AI, or Supabase changes.
- Removing `react-hot-toast` — already the only toast lib used here.

## Verification

1. `npx tsc --noEmit` — typecheck passes.
2. `npm run build` — production build passes (catches dead/undefined Tailwind utility references only at runtime, so also do a visual check).
3. `npm run dev` + manual: join a meeting → control bar is visibly dark (`inverse-surface`, #2D303D), not transparent; layout dropdown and participants toggle buttons render dark with correct hover; directly hit a bad `/meeting/bad-id` URL → "Meeting not available" subtitle renders muted (not pure white).
4. Grep to confirm no remaining `dark-1`, `sky-1`, `purple-1`, or `bg-[#` / `text-[#` in `MeetingRoom.tsx` and `meeting/[id]/page.tsx`.

## Risks / Notes

- The control bar `bg-inverse-surface/95` over live video: confirm it still reads as a distinct bar. If transparency makes video bleed through awkwardly, drop the `/95` to solid `bg-inverse-surface` (single dark value, per token rule).
- Do not reintroduce `dark-1`/`dark-2`; the sidebar/control bar share one `inverse-surface` value by design.
- If `useGetCallbyId` or Stream SDK behavior changed in this Next.js version (AGENTS.md warning about breaking changes), verify the join flow still works before declaring done — read `node_modules/next/dist/docs/` only if a Next API used here errors.
