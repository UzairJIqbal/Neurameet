# 0002. Live Ledger: rationale

## Context

The Promise Ledger (0001) works after the meeting. The second signature feature brings it into the call, where the people who made the promise are present. The research in `reports/NeuraMeet second signature feature.md` found no major platform or notetaker we reviewed that raises an earlier promise, with its exact quote, live in the call and records the room's answer.

Forces: the zero cost rule (Stream free tier, existing Gemini, Groq, pgvector), the fragile Meeting Room (camera re render loop history), guests without Clerk accounts, serverless routes with no shared memory, Stream's 5 KB custom event limit, and stored transcripts with no timestamps.

## Options considered

1. **Server sent events behind owner only routes, state in Supabase (chosen).** Trusted sender, durable state for late joiners and reconcile, throttling from stored timestamps.
2. **Client sent `call.sendCustomEvent`.** Least code, but any participant with `send-event` could fake a card, and there is nothing to reconcile or replay.
3. **Stream call custom data (`call.update({ custom })`) as live state.** Built in replay, but every update rewrites the whole call custom object (title, description live there), and votes would race.

Sub decisions:
- **Sender:** owner's id rather than a bot user. No new Stream user to create, and the route already proves ownership.
- **Check-in ranking:** deterministic (overdue, due soon, newest) rather than embedding the meeting title. Instant meetings are titled "Meeting", so an embedding would rank on noise, cost a call, and add a failure mode. Kept as a follow-up.
- **Agreement storage:** a `ledger_items` row with `source = 'live_agreement'` rather than a separate decisions table, so agreements show in the Ledger tab, prep, and matching with no new reader. Cost: `line_number = 0` and a `source` branch in the UI.
- **M (total):** Stream's server participant count at close, never a number from the browser.
- **Throttle:** a 1.5 second gap checked against the stored `raised_at`, since serverless memory is not shared.
- **Reconcile:** extend `runLedgerMatch`, not a second matcher. A live mark only auto confirms when the transcript agrees, which keeps the 0001 rule that proof backs every final status.
- **Card wording:** "Still open?" over "Overdue", plus a private preview, to avoid public blame.

## References

- `reports/NeuraMeet second signature feature.md` (research, demo script, evaluation plan)
- `.claude/skills/stream-react/references/VIDEO.md` (grants, custom events)
- `node_modules/@stream-io/node-sdk/dist/src/gen/video/VideoApi.d.ts` (`sendCallEvent`, `queryCallParticipants`)
- `node_modules/@stream-io/video-client/dist/src/Call.d.ts` (`sendCustomEvent`), `gen/coordinator/index.d.ts` (`CustomVideoEvent`)
- `src/app/api/guest/request-join/route.ts` (existing server event pattern)
