# Step D3.1 — In-Call Reactions (Reactions / ReactionsButton)

**Phase:** Meeting Experience Polish (D3 sub-step D3.1)
**Status:** Blueprint approved (architect session). Ready to implement after sign-off.
**Zero-cost rule:** satisfied — `Reaction` / `ReactionsButton` / `DefaultReactionsMenu` are all in the
core `@stream-io/video-react-sdk` (1.40.2). No separate package, no paid plan, no server-gated
setting (unlike `NoiseCancellation`, which needs `audio-filters-web` + a server flag). Confirmed by
reading the installed SDK type defs (`node_modules/@stream-io/video-react-sdk/dist/src/components/Reaction/Reaction.d.ts`,
`.../CallControls/ReactionsButton.d.ts`, `video-client/dist/src/Call.d.ts`).

## Goal
Add Zoom/Google Meet-style in-call emoji **Reactions** to the Meeting Room:
1. A tokened "Reactions" control in the existing D2 control pill that opens a picker and **sends** a
   reaction via `call.sendReaction(...)`.
2. A floating emoji animation **displayed** over each reacting participant, driven by
   `participant.reaction` (read by the `<Reaction>` component, auto-hides after a timeout).

## Language (agreed in architect session)
- **"Reactions"** — in-call emoji reactions (floating during a call), NOT chat emojis.
- **"Send"** — local user picks an emoji → `call.sendReaction({ type | emoji_code | custom })`,
  broadcast to others.
- **"Receive / display"** — each participant's reaction shown as a floating animation near them via
  `<Reaction participant={p} />`, which reads `p.reaction`.

## SDK facts (verified, do not assume)
- `Reaction` component: `Reaction({ participant, hideAfterTimeoutInMs?, emojiReactionMap? })` —
  reads `participant.reaction` (`StreamReaction = Pick<ReactionResponse,'type'|'emoji_code'|'custom'>`)
  and animates, auto-hiding after `hideAfterTimeoutInMs` (default exists).
- `ReactionsButton` / `DefaultReactionsMenu`: built-in picker UI. `ReactionsButton` = button+menu;
  `DefaultReactionsMenu` = just the menu, props `{ reactions: StreamReaction[]; layout?: 'horizontal'|'vertical' }`
  (defaults to `defaultReactions`). Assumed to call `call.sendReaction` internally; if it needs an
  `onSelect` callback, wire it to `call.sendReaction`. Confirm during build.
- `call.sendReaction(reaction: SendReactionRequest): Promise<SendReactionResponse>` — exists on the
  call object.
- Each `StreamVideoParticipant` carries a `reaction?: StreamReaction` field; `useParticipants()`
  exposes them. Receive = map over participants and render `<Reaction participant={p} />`.

## Decisions (locked)
- **Send control placement + styling:** a tokened "Reactions" icon+label button is added to the D2
  control pill (the existing tokened pill built from `CallControls` + custom `People`/`Layout`
  labels). It toggles a popover rendering `<DefaultReactionsMenu reactions={defaultReactions}
  layout="horizontal" />`. Styling must match the pill: `bg-inverse-surface` / `text-inverse-on-surface`,
  emoji lucide icon + "Reactions" label — no raw color classes, no `text-white`. This reuses Stream's
  send logic while keeping the locked-token aesthetic.
- **Display placement:** per-participant tile overlay — `<Reaction participant={p} />` mapped over
  `useParticipants()`. If `ParticipantView` does not expose a clean overlay/callout slot, fall back to
  a stage-level reactions layer that maps participants and floats emojis. Either way `Reaction` reads
  `participant.reaction`, so it auto-animates and auto-hides.
- **Reaction set:** Stream `defaultReactions` (built-in emoji set) — zero config, free.

## Implementation steps
1. In `src/components/MeetingRoom.tsx`, add a **"Reactions" icon+label button** to the control pill
   (tokened, matching the existing `People`/`Layout` labels). Clicking toggles a popover that renders
   `<DefaultReactionsMenu reactions={defaultReactions} layout="horizontal" />`. Wire the menu's send
   (auto or `onSelect`) to `call.sendReaction`.
2. Render **`<Reaction participant={p} />`** for each participant — overlaid on each `ParticipantView`
   if a slot exists, else a stage-level layer mapping `useParticipants()`.
3. Keep all existing robust logic untouched: attendance `reportLocalLeave()` on leave, `CallLayout`
   (defined outside the component), layout switching, `showParticipants` panel, standalone
   `CallStatsButton`, `EndCallButton`.
4. `npx tsc --noEmit` clean, `npm run build` exit 0.

## Verification
- **Live (`/check verify`):** in a real Clerk+Stream session, open the Reactions picker, send an emoji
  → it animates on the sender's tile and on other participants' tiles; no console errors; control pill
  styling matches the D2 tokens. `npx tsc --noEmit` clean, `npm run build` exit 0.
- **Zero-cost check:** no new dependency added; all symbols from core `@stream-io/video-react-sdk`.

## Out of scope
- Chat emojis, persistent reaction history/aggregations, custom reaction sets, and the other D3+
  features (D3.2 in-call Search, D3.3 RingingCall, D3.4 CallRecordingList, D3.5 screen-share polish).
- NoiseCancellation (server-gated, verify-first backlog — not built here).
