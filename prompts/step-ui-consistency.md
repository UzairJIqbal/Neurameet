# Step UI-Consistency (Scope A) — unify the authenticated product UI to the locked token system

## Context

A full audit of the rendered code (not just the docs) shows the authenticated
product app is already internally consistent: Sidebar, Navbar, Dashboard,
Meeting Intelligence, Follow-ups, Recordings, Search, Prep, Settings, and the
auth forms all use the locked token system from `context/ui-tokens.md`
(`surface-container-lowest`, `inverse-surface`, `primary-container`,
`on-surface`, `surface-variant`, `outline-variant`). A scan of `src/app` +
`src/components` (excluding the `ui/` kit and `landing/`) found only dead
references to retired tokens.

Three real product-surface leaks remain, plus dead code and one stale doc:

1. **Loading spinner** — `src/components/ui/loader.tsx` (LoaderOne is the
   spinner on every loading state: Dashboard, Meeting List, Follow-ups, etc.)
   uses hardcoded hex `text-[#00e571]` / `text-[#8b00ff]` and `text-black`
   instead of tokens.
2. **Meeting create/join modal** — `src/components/MeetingModel.tsx` embeds
   `PlaceholdersAndVanishInput` (`src/components/ui/placeholders-and-vanish-input.tsx`)
   for the Join code field; that kit renders `bg-white` / `bg-black` /
   `text-gray-300` for its input + submit button instead of tokens. The modal
   shell itself is already on-token.
3. **Dead code** — `src/components/SideTitles.tsx` uses retired `text-blue-1`
   (undefined in Tailwind now) and is imported nowhere; its only consumer is
   `src/components/ui/typewriter-effect.tsx`, which is also unused.
4. **Stale doc** — `context/ui-rules.md` still documents `SUSE Mono` + old
   `dark-1..4` / `purple-1` / `sky-1..3` tokens, contradicting the locked
   `ui-tokens.md` and the real code. This is a future-drift risk, not a UI bug.

Landing page and the rest of the Aceternity `ui/` kit are intentionally a
separate dark marketing/decorative theme and are OUT of scope (the user chose
Scope A: product surfaces only).

## Decisions (locked)

- **Scope A only**: authenticated product surfaces. Landing + the Aceternity
  `ui/` kit (lamp, flip-words, wobble-card, container-text-flip, loader hex) are
  left as-is.
- **Retoken, don't rewrite**: fix the leaking classes in place. Do not
  restyle layouts or rename components.
- **`green-1` (#00C48C)** is the kept token for small indicators — use it for the
  loader's green, replacing `#00e571`. Use `primary-container` (#830EF9) for the
  loader's purple, replacing `#8b00ff`.
- **Delete dead code**: remove `SideTitles.tsx` + `typewriter-effect.tsx` only
  after confirming via grep that nothing else imports them.
- **No new component**: reuse existing tokens; do not introduce a shared
  loading-input component.

## How to build it

### 1. Retoken the loading spinner (`src/components/ui/loader.tsx`)
- Line ~130: `text-black dark:text-white` → `text-on-surface` (drop the `dark:`
  variant — the app has no dark-mode toggle and the loader renders on light
  surfaces).
- Line ~148: `text-[#00e571]/50 blur-[0.5px] dark:text-[#00e571]` →
  `text-green-1/50 blur-[0.5px]` (drop the `dark:` variant).
- Line ~165: `text-[#8b00ff]/50 dark:text-[#8b00ff]` → `text-primary-container/50`
  (drop the `dark:` variant).

### 2. Retoken the Join-code input kit (`src/components/ui/placeholders-and-vanish-input.tsx`)
This kit is used only by `MeetingModel.tsx` (confirmed by grep), so recoloring
it only affects the light New/Join/Schedule modal.
- Input container: `bg-white dark:bg-zinc-800` → `bg-surface-container-lowest`;
  `bg-gray-50` (focused) → `bg-surface-container-low`.
- Submit button: `disabled:bg-gray-100 bg-black dark:bg-zinc-900` →
  `bg-primary-container text-on-primary disabled:bg-primary-container/60`.
- Placeholder / helper text: `text-gray-300` → `placeholder:text-on-surface-variant`;
  `text-neutral-500` / `dark:text-zinc-500` → `text-on-surface-variant`.
- Drop all `dark:` variants in this file (the modal is always light).

### 3. Delete dead code
- `grep -rln "typewriter-effect" src/` and `grep -rln "SideTitles" src/` to
  confirm the only importer of `typewriter-effect` is `SideTitles`, and that
  `SideTitles` has no importers.
- If confirmed: delete `src/components/SideTitles.tsx` and
  `src/components/ui/typewriter-effect.tsx`.
- If anything else imports `typewriter-effect`, keep it and only neutralize
  `SideTitles.tsx` (delete it, since it is dead and uses the retired `text-blue-1`).

### 4. Correct the stale doc (`context/ui-rules.md`)
- Font section (currently "SUSE Mono via next/font/local"): replace with
  **Hanken Grotesk (UI) + JetBrains Mono (mono labels) via `next/font/google`**,
  matching `ui-tokens.md` and the actual `src/app/layout.tsx`. Remove the
  "never introduce a second font family" SUSE Mono claim.
- Cards / Sidebar Navigation / Buttons sections: replace retired token names
  with the locked equivalents — `bg-dark-1` → `bg-inverse-surface`,
  `bg-dark-3/dark-4` → `bg-surface-container-low(est)`, `text-white` →
  `text-on-primary` / `text-on-surface`, `text-sky-1` → `text-inverse-on-surface`
  (sidebar) / `text-on-surface-variant` (content), `bg-purple-1` →
  `bg-primary-container`, `bg-surface-muted`/`text-dark-2` → `text-on-surface`,
  `border-sky-2/dark-4` → `border-outline-variant` / `border-surface-variant`.
  Keep the structure/intent of those sections; only the token names change.

### 5. Record in the scope doc
- Add a coarse row to `docs/scope/scope.md` for this UI-consistency pass
  (intent + Done when + verification), so it is tracked like the other steps.

## Verification

- `npx tsc --noEmit` is clean.
- `npm run build` exits 0.
- Visual (describe, since Clerk auth blocks live viewing from here): LoaderOne
  spinner now renders in `green-1` + `primary-container` (no raw hex); the Join
  Meeting modal's code input + submit button use `surface-container-lowest` /
  `primary-container` (no `bg-white` / `bg-black` / gray); no component imports
  the deleted `SideTitles` / `typewriter-effect`.
- `grep -rnE "\[#[0-9a-fA-F]{3,8}\]|dark-[1-4]|purple-1|sky-[1-3]|blue-1" src/components/ui/loader.tsx src/components/ui/placeholders-and-vanish-input.tsx`
  returns no matches after the edit.
- Update `context/progress-tracker.md` with the completed consistency pass.
