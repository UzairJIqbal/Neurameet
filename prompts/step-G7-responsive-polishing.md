# G7 — Responsive Polishing for the Guest Join Flow

`/architect` pass. Audit + fix responsiveness across every guest-facing screen at mobile/tablet/desktop breakpoints. Follows the same pattern as Step P13 (Responsive Polishing): canonical problem list (P13.0 equivalent), then fix in priority order.

## Scope

Every guest-facing screen in the `/meeting/:id/guest` flow:
1. **NameModal** — the name/email modal shown immediately on load
2. **DeviceSetup (lobby phase)** — camera/mic preview + device dropdowns + "Ask to join" button
3. **Requesting overlay** — the spinner overlay shown after "Ask to join" is pressed
4. **GuestWaitingScreen** — "Waiting for the host" screen during approval
5. **TerminalScreen** — denied/expired/not_found message screens
6. **GuestCallFlow admitted phase** — the MeetingRoom rendered inside StreamCall/StreamTheme
7. **Owner's Accept/Deny toast** — the toast rendered in MeetingRoom.tsx
8. **GuestStreamClientProvider** — the loading/load-error states

## Method

Code review + responsive token assertions as revert guards (jsdom has no layout engine, so responsive reflow is locked by unit tests asserting responsive class tokens, the same pattern P13.1 through P13.10 established). Live viewport confirmation at true mobile width (375px) is the visual gate per fix via `/check verify`, per the P13 pattern.

Tailwind breakpoints in play: `sm=640`, `md=768`, `lg=1024`, `xl=1280`.

---

## Canonical Problem List (G7.0)

### G7-D1 — NameModal inputs overflow on small phones [Priority: High, Severity: Major on 375]
- **Screen:** NameModal (`src/app/(root)/meeting/[id]/guest/page.tsx:742`)
- **Breakpoint:** 375 (major), 768 (minor)
- **Symptom:** The modal card is `w-full max-w-sm` (`page.tsx:743`). Inside, the name and email inputs are `w-full` (`page.tsx:766,787`). On a 375px phone the modal takes the full screen width minus the overlay padding, but the inputs have no horizontal padding on the card itself — the card was `p-6` (48px total horizontal padding, 24px per side) which left very little room for the content. The inputs are `rounded-xl px-4 py-2.5` and the label text `text-sm` can wrap awkwardly. The real problem: the modal `max-w-sm` (~320px on a 375px phone minus overlay padding = ~311px usable) is tight — with the old `p-6` (48px total) the usable width dropped to ~263px, which is cramped for the `text-body-md` inputs and the "Join meeting" button `w-full rounded-2xl px-6 py-3` text `text-body-md font-semibold` may wrap on very narrow cards.
- **Root cause:** No `sm:` responsive adjustment on the modal itself. The `max-w-sm` is fine for 375 but the card padding `p-6` (48px total horizontal) plus `w-full` inputs with `px-4` leaves very little room for the button row on the smallest screens.
- **Fix direction:** Add responsive padding to the modal card: `p-4 sm:p-6` so the card breathes on 375 (24px total horizontal at 375 vs 48px before, restoring ~23px of usable width). Ensure the button text stays on one line: `whitespace-nowrap` or `text-body-sm` on the smallest breakpoint. Verify the modal does not overflow horizontally on 375.

### G7-D2 — GuestWaitingScreen card too tall and text overflows on 375 [Priority: Medium, Severity: Minor]
- **Screen:** GuestWaitingScreen (`src/app/(root)/meeting/[id]/guest/page.tsx:542`)
- **Breakpoint:** 375 (minor)
- **Symptom:** The card is `w-full max-w-2xl rounded-xl border ... p-4` (`page.tsx:543`). On a 375 phone, `max-w-2xl` (~448px) is way wider than the screen — the `w-full` caps it at 375 minus padding. The heading `text-display-sm font-semibold` plus the spinner row `flex items-center justify-center gap-3 mb-4` plus the text `text-body-md` may cause vertical overflow on a small phone (the card is centered with `flex min-h-screen items-center justify-center` so it fills the viewport height). The `p-4` padding on a 375 screen is generous but the content inside is not constrained horizontally — the spinner SVG `h-5 w-5` and text sit side by side and could overflow if the text is long ("Waiting for the host to let you in…" is ~30 chars at `text-body-md`).
- **Fix direction:** Add `px-4 sm:px-6` horizontal padding to the card content so text never gets closer than ~16px to the screen edge on 375. Consider `text-body-sm` on the waiting text at `sm:` breakpoint. The card is already `max-w-2xl` which is a desktop target — on mobile it should feel narrower, which `w-full` + `max-w-2xl` already handles. Verify no horizontal overflow.投票

### G7-D3 — Requesting overlay card has no horizontal margin on 375 [Priority: High, Severity: Major on 375]
- **Screen:** Requesting overlay (`src/app/(root)/meeting/[id]/guest/page.tsx:408`)
- **Breakpoint:** 375 (major)
- **Symptom:** The overlay card is `relative w-full max-w-[420px] rounded-xl border ... px-8 py-6 text-center shadow-xl` (`page.tsx:409`). On a 375 phone, `px-8` (32px) on each side of a 375-wide screen minus the `max-w-[420px]` cap leaves the card at 375px wide (since `w-full` caps it). The `px-8` internal padding means the internal content starts at 32px from each edge and the text "Sending your request to the host…" at `text-body-md` in a `flex items-center justify-center gap-3` row has only ~311px of internal width. The spinner SVG `h-5 w-5` plus the text could overflow. Additionally, `px-8` is generous on 375 — the card content is too spread out relative to the screen, and the text+spinner row could wrap awkwardly or overflow.
- **Fix direction:** Reduce horizontal padding on small screens: `px-4 sm:px-8` on the card. The `max-w-[420px]` is a desktop target; on 375 the card should hug the screen with modest padding. Verify the spinner+text row fits on one line at 375.

### G7-D4 — TerminalScreen card text overflows on 375 [Priority: Medium, Severity: Minor]
- **Screen:** TerminalScreen (`src/app/(root)/meeting/[id]/guest/page.tsx:823`)
- **Breakpoint:** 375 (minor)
- **Symptom:** TerminalScreen is `rounded-xl border px-8 py-12 text-center max-w-md` (`page.tsx:827`). On a 375 phone, `px-8` (32px) + `py-12` (48px) inside a `max-w-md` (~384px, capped at 375) card leaves the title `text-title-lg font-semibold` and message `text-body-md` with limited horizontal room. The title "Request denied" or "Session expired" at `text-title-lg` (~20px font) could wrap to two lines on 375. The message text is longer and could wrap to 3+ lines. The button `rounded-lg bg-primary px-6 py-2.5` is fine as a touch target.
- **Fix direction:** Add responsive padding: `px-4 sm:px-8` on the card. The `py-12` is acceptable for a terminal screen (it's a full-screen overlay anyway). Verify title fits on one line at 375.

### G7-D5 — GuestStreamClientProvider loading/error states lack responsive constraints [Priority: Low, Severity: Minor]
- **Screen:** GuestStreamClientProvider (`src/components/GuestStreamClientProvider.tsx:119-148`)
- **Breakpoint:** 375 (verify)
- **Symptom:** The `LoadError` and `LoaderOne` wrappers are `flex min-h-screen items-center justify-center` (`GuestStreamClientProvider.tsx:119,129,143`). These are full-screen flex containers with no horizontal constraint issue — they center a single child. The `LoaderOne` component should be verified to not overflow horizontally. The `LoadError` message text `text-body-md` could wrap on 375 but stays within the screen.
- **Fix direction:** Verify the `LoadError` component and `LoaderOne` render within the viewport at 375 with no horizontal overflow. Likely no fix needed; lock with a revert-guard test.

### G7-D6 — Owner's Accept/Deny toast overflows on small screens [Priority: High, Severity: Major on 375]
- **Screen:** Owner's Accept/Deny toast (`src/components/MeetingRoom.tsx:638-748`)
- **Breakpoint:** 375 and 768 (major)
- **Symptom:** The toast container is `flex min-w-[280px] items-center gap-3 rounded-xl border ... px-4 py-3` (`MeetingRoom.tsx:639`). The `min-w-[280px]` means on a 375 phone, the toast is 280px wide (plus the `px-4` padding = 296px from the toast itself). The toast sits in the top-right of the viewport (react-hot-toast default). On a 375 phone the toast occupies the right ~296px, leaving only ~79px for the rest of the content. The guest name text `text-body-sm font-medium` and the subtext `text-body-xs` are inside a flex column. The button column is `flex shrink-0 w-[90px] justify-end` — the Deny button `invisible w-[90px]` and Accept button `w-[90px]` are each 90px. The total toast width is `min-w-[280px]` + `px-4`*2 = ~312px minimum, which exceeds the 375 screen width minus safe margins.
- **Root cause:** `min-w-[280px]` plus padding exceeds the usable width on 375. The toast is not responsive at all — it has no `sm:` or `md:` breakpoint adjustments.
- **Fix direction:** Make the toast responsive: `min-w-[260px] sm:min-w-[280px]` and add `max-w-[calc(100vw-2rem)]` so it never exceeds the screen. On 375, the toast should be ~343px (375-16-16) which fits. Reduce button column width on small: `w-[70px] sm:w-[90px]`. The text should be allowed to shrink: add `text-body-xs` on `sm:` for the subtext. Verify the toast does not overflow horizontally on 375.

### G7-D7 — GuestCallFlow admitted phase (MeetingRoom) side panels on small screens [Priority: High, Severity: Major on 375]
- **Screen:** GuestCallFlow admitted → MeetingRoom (`src/app/(root)/meeting/[id]/guest/page.tsx:374-380`, `src/components/MeetingRoom.tsx`)
- **Breakpoint:** 375 (major)
- **Symptom:** When the guest is admitted, `MeetingRoom` renders inside `<StreamCall><StreamTheme>`. MeetingRoom has the side panels (participants + recordings) that are `hidden sm:static` (P13.6 fix already applied). The control bar is `fixed inset-x-0 bottom-0 ... flex w-fit flex-wrap` (P13.6 verify). The P13.6 fixes already addressed the Meeting Room side panels for the signed-in path — the guest path renders the exact same MeetingRoom component, so it inherits the P13.6 responsive fixes.
- **Fix direction:** Verify the P13.6 responsive fixes apply to the guest path too (they should, since MeetingRoom is shared). Add a revert-guard test for the guest path specifically. The `bottom-32` inset on panels and the `hidden sm:static` tokens must be present in the guest path's MeetingRoom rendering.

### G7-D8 — GuestCallFlow requesting overlay inside StreamCall [Priority: Medium, Severity: Minor]
- **Screen:** GuestCallFlow requesting phase (`src/app/(root)/meeting/[id]/guest/page.tsx:406-438`)
- **Breakpoint:** 375 (minor)
- **Symptom:** The requesting overlay is `fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm` with a `max-w-[420px]` card (`page.tsx:408-409`). This is the same pattern as G7-D3 (the requesting phase inside GuestCallFlow, distinct from the NameModal requesting state). The `px-8 py-6` on the card is generous on 375. The text "Sending your request to the host…" with the spinner is in a flex row that could overflow.
- **Fix direction:** Same fix as G7-D3: `px-4 sm:px-8` on the card. Verify the spinner+text row fits at 375.

### G7-D9 — NameModal error/pending state messages overflow [Priority: Low, Severity: Minor]
- **Screen:** NameModal error and requesting states (`src/app/(root)/meeting/[id]/guest/page.tsx:708-737`)
- **Breakpoint:** 375 (minor)
- **Symptom:** When the NameModal shows the requesting state (`phase === "requesting"`), it renders `fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm` with `rounded-xl border ... px-8 py-6 text-center shadow-xl max-w-sm` (`page.tsx:710-711`). The `max-w-sm` (~320px) with `px-8` on a 375 screen leaves the text "Sending your request to the host…" in a flex row with the spinner. Same overflow risk as G7-D3.
- **Fix direction:** Same fix: `px-4 sm:px-8` on the card. Consistent with G7-D3 and G7-D8.

### G7-D10 — GuestWaitingScreen poll error state [Priority: Low, Severity: Minor]
- **Screen:** GuestWaitingScreen poll failure (`src/app/(root)/meeting/[id]/guest/page.tsx:530-539`)
- **Breakpoint:** 375 (verify)
- **Symptom:** When `pollFailCount >= 2`, GuestWaitingScreen renders `<LoadError message="Connection lost while waiting…" onRetry={...} />` inside `flex min-h-screen items-center justify-center bg-surface`. The LoadError component is the same as everywhere else — verify it fits at 375.
- **Fix direction:** Verify LoadError renders within the viewport at 375. Likely no fix needed; lock with a revert-guard test.

---

## Priority order for G7.1 through G7.10

1. **G7.1 — NameModal responsive padding** (G7-D1): `p-4 sm:p-6` on the modal card, `whitespace-nowrap` on the button text.
2. **G7.2 — Requesting overlay responsive padding** (G7-D3 + G7-D9 + G7-D8): `px-4 sm:px-8` on all three requesting-state cards (NameModal requesting, GuestCallFlow requesting, GuestCallFlow requesting in StreamCall).
3. **G7.3 — Owner's Accept/Deny toast responsive** (G7-D6): `min-w-[260px] sm:min-w-[280px]`, `max-w-[calc(100vw-2rem)]`, `w-[70px] sm:w-[90px]` on buttons.
4. **G7.4 — GuestWaitingScreen responsive padding** (G7-D2): `px-4 sm:px-6` on the card content, `text-body-sm` on the waiting text at `sm:`.
5. **G7.5 — TerminalScreen responsive padding** (G7-D4): `px-4 sm:px-8` on the card.
6. **G7.6 — GuestStreamClientProvider verify** (G7-D5): lock with revert-guard test.
7. **G7.7 — GuestCallFlow admitted phase verify** (G7-D7): verify P13.6 fixes apply to guest path, add revert-guard test.
8. **G7.8 — GuestWaitingScreen error state verify** (G7-D10): lock with revert-guard test.
9. **G7.9 — Global responsive token audit**: scan all guest-facing screens for any `w-full` without `max-w-*`, any `px-8` without a `sm:` variant, any `text-body-md` that could wrap at 375.
10. **G7.10 — Manual `/check verify` at 375px**: verify every guest-facing screen renders correctly at true mobile width.

---

## Hard rules

1. **Reuse the token system.** All colors must come from `context/ui-tokens.md`. No new Tailwind color classes. No raw hex values.
2. **Tailwind breakpoints only.** `sm:` / `md:` / `lg:` / `xl:` — no custom media queries, no new framework.
3. **No new framework or dependency.** Everything must be achievable with existing Tailwind classes plus the existing component library.
4. **jsdom has no layout engine.** Responsive reflow is locked by unit tests asserting responsive class tokens as revert guards, following the P13 pattern (see `src/components/MeetingRoom.test.tsx` for the established pattern).
5. **GuestStreamClientProvider stays usable on small screens.** The loading spinner, LoadError, and connected state must all render correctly at 375.
6. **The `MeetingRoom` component is shared** between signed-in and guest paths. Any responsive fix to MeetingRoom must not break the signed-in path.
7. **The `react-hot-toast` toast** for the owner's Accept/Deny must remain interactive and readable at all breakpoints. The toast content must not overflow or become unclickable.

---

## Existing responsive state (what already works)

The following responsive fixes are **already applied** to the signed-in MeetingRoom and should carry over to the guest path automatically (since MeetingRoom is shared):

- **Side panels** (`MeetingRoom.tsx:505,515`): `hidden sm:static` — hidden on phones, inline on desktop (P13.6)
- **Panel bottom inset** (`bottom-32`): lifts the fixed panel above the two-row control bar (P13.6)
- **Show-block toggle**: `show-block` class applied when a panel is opened on mobile (P13.6)
- **Tap-outside backdrop**: `bg-inverse-surface/50` backdrop when a panel is open (P13.6)
- **Control bar**: `fixed inset-x-0 bottom-0 ... flex w-fit flex-wrap` (P13.6)
- **EndCallButton**: `w-full sm:w-auto` (P13.6 fix, verified by tests)
- **Constant-size toast container**: `min-w-[280px]` with fixed-width button column (G2 fix, already in MeetingRoom)

The following responsive fixes are **already applied** project-wide via P13:
- Sidebar off-canvas drawer (P13.1)
- Dashboard inline list reflow (P13.3)
- Dropdown/popover token fixes (P13.10)
- Meeting Intelligence tabs overflow-x-auto (P13.4)
- Follow-ups and recordings responsive reflow (P13.5)
- Floating chat height cap (P13.9)
- Personal Room and Settings responsive (P13.7)
- Search/Prep/AfterMeetingRecap responsive (P13.8)

---

## Test plan

Following the P13 pattern, each fix gets unit tests in the appropriate test file asserting the responsive class tokens as revert guards. All tests go in `src/components/MeetingRoom.test.tsx` (already has the responsive revert-guard pattern from P13.6) and a new `src/components/GuestResponsive.test.tsx` for the guest-specific screens.

### G7.1 tests — NameModal responsive
- Assert the modal card has `p-4 sm:p-6` (or whatever padding is chosen)
- Assert the button has `whitespace-nowrap`
- Assert `max-w-sm` is present

### G7.2 tests — Requesting overlay responsive
- Assert the requesting card has `px-4 sm:px-8` (or whatever padding is chosen)
- Assert `max-w-sm` or `max-w-[420px]` is present
- Assert no `px-8` remains on any guest-facing requesting card

### G7.3 tests — Accept/Deny toast responsive
- Assert the toast container has `min-w-[260px] sm:min-w-[280px]`
- Assert the toast container has `max-w-[calc(100vw-2rem)]`
- Assert the button column has `w-[70px] sm:w-[90px]`

### G7.4 tests — GuestWaitingScreen responsive
- Assert the card has `px-4 sm:px-6` (or equivalent)
- Assert `max-w-2xl` is present

### G7.5 tests — TerminalScreen responsive
- Assert the card has `px-4 sm:px-8` (or equivalent)
- Assert `max-w-md` is present

### G7.6 tests — GuestStreamClientProvider responsive
- Assert the LoadError wrapper uses `flex min-h-screen items-center justify-center`
- Assert no horizontal overflow classes are missing

### G7.7 tests — GuestCallFlow admitted phase (MeetingRoom)
- Assert the side panels have `hidden sm:static` + `bottom-32` in the guest path
- Assert `show-block` toggle works in the guest path

### G7.8 tests — GuestWaitingScreen error state
- Assert LoadError wrapper uses `flex min-h-screen items-center justify-center`

### G7.9 — Global audit test
- Scan all guest-facing JSX for `px-8` without a `sm:` variant — flag in test
- Scan for `w-full` without `max-w-*` on modal-like cards — flag in test

### G7.10 — Manual `/check verify`
- Viewport 375×667: verify every guest screen renders without horizontal overflow
- Viewport 768×1024: verify tablet layout
- Viewport 1440×900: verify desktop layout
- Verify the owner's Accept/Deny toast does not overflow at 375
- Verify the NameModal is fully usable at 375 (all inputs, labels, button accessible)
- Verify the GuestWaitingScreen spinner+text row fits at 375

---

## Verification criteria

- `npx tsc --noEmit` clean
- `npx vitest run` all green (including new responsive revert-guard tests)
- `npm run build` exit 0
- `/check verify` at true mobile width (375px) confirms every guest-facing screen is usable
- No horizontal overflow on any guest-facing screen at 375, 768, or 1440
- No broken touch targets on mobile
- The owner's Accept/Deny toast remains fully interactive and readable at all breakpoints
