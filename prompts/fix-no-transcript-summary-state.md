# Fix: summary tab offers a useless retry when the meeting has no transcript

## Problem (found in live testing 2026-11-09)
Meeting `77caf6f9…` (PDF App project) has no `transcripts` row. The AI Summary tab still shows
"Retry summary generation". That button calls `POST /api/ai/process`, which returns 404
"Transcript not found", and the UI shows the generic toast "Summary generation failed, try again".
Retrying can never work until a transcript exists.

## Scope (UI only, no API or schema change)
1. `SummaryTab`: new optional props `transcriptMissing` and `recapHref`. When `transcriptMissing`,
   show "No transcript yet" with a short instruction and a link to the recap page
   (`/after-meeting/<streamCallId>`, where Generate Transcript lives). Do not render Retry.
   Retry stays when a transcript exists but the summary is missing.
2. `MeetingTabs`: pass `transcriptMissing = !isViewer && !transcriptText?.trim()` and the recap link
   built from `meeting.streamCallId`. Viewers get no transcript field, so they never see this state
   (they also never get Retry).
3. `MeetingDetail.retrySummary`: read the JSON `error` from a non-OK response and show it in the
   toast, falling back to the existing generic message.

## Not in scope
Why this particular call produced no transcript (needs the live F10 test). Invite email (needs a
verified Resend domain and `RESEND_WORKSPACE_FROM`).

## Tests
`MeetingTabs.test.tsx`: no transcript shows the message and link and no Retry; transcript present
and no summary still shows Retry.
