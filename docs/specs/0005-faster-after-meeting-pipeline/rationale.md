# 0005. Faster after meeting pipeline: rationale

## Context

After a call the after meeting page drives everything from the browser: it polls until Stream finishes the individual recordings (up to 60 checks, 5 s apart), calls `POST /api/transcript/download` (Whisper per track, then one cleanup AI call), then `POST /api/ai/process`, with embed alongside, then ledger match. Each AI step gives Gemini Flash 30 s (cleanup 90 s) before falling back to Groq, which is slower.

On 2026-11-15 Gemini Flash (`gemini-flash-latest`, `gemini-3.8-flash`) passed 30 s on every call, even a one word prompt, and once returned "high demand". So one meeting can spend up to 150 s just waiting on timeouts before Groq starts. `gemini-3.5-flash-lite` answered the same structured call in about 2 s (it rejects `thinkingBudget: 0`). No step timings are stored, and Vercel Hobby keeps logs for about an hour, so nobody can yet say which step is slowest on a real meeting.

Forces: the zero cost rule in AGENTS.md (free tiers only), Vercel Hobby's 300 s function ceiling, and the rule that every AI call fails soft.

## Options considered

### Option 1: Paid Gemini and Groq keys
Enable billing on Gemini for priority under load, and the Groq Developer tier.
- Pros: fewer Gemini 503s under load; higher Groq audio limits.
- Cons: Groq paid raises limits only (20 to 50 RPM, 7,200 to 14,400 audio seconds per hour), not per request speed; paid Gemini users, Tier 2 with Priority included, still report constant 503s on Flash; does nothing for the Stream wait or the serial steps; breaks the zero cost rule.

### Option 2: Fix the model fallback only
Add Flash Lite and the busy skip, nothing else.
- Pros: smallest change, biggest single win.
- Cons: the page still has to stay open; ledger match still blocks the redirect; still no measurement.

### Option 3: Free fixes plus a server start on recording ready (chosen)
Option 2, plus saved step timings, ledger match on the server, a step list, and Stream's `call.recording_ready` webhook to start on the server, with the page as fallback.
- Pros: removes the timeout waits, the ledger wait, and the dependence on an open tab; adds the data for the next decision; stays free.
- Cons: a public webhook route, a dashboard setting, and shared server functions to extract from two routes.

### Option 4: A durable job queue (Vercel Workflow or similar)
Run each step as its own durable job with retries.
- Pros: each step gets its own time budget and retries.
- Cons: a new tool and new concepts for a small team; not needed until timings show a step outgrowing one function.

## Rationale

Paying does not touch the two biggest waits: Stream finishing the recordings and timeouts on an overloaded Flash. The research shows paid Gemini still sees 503s, and Groq paid only lifts limits this app does not hit. So the fix is design, not spend, and it keeps the zero cost rule intact.

Option 3 over Option 2 because you chose to remove the open tab dependence and the ledger wait too, and because measurement must come before any deeper change (strangler instinct: the page path stays as fallback, so the webhook can be switched off by removing the dashboard URL). Option 4 waits for evidence: the saved timings will show whether one 300 s function is ever not enough.

Settle rule over "start on first event": Stream sends one ready event per track, so starting on the first would miss later speakers. Reading `listRecordings` server side, not the payload, matches the existing filter and keeps the payload untrusted.

## References

**Project sources**:
- `AGENTS.md`: zero cost rule, Stream verification rule, API contract rule, loading state rule.
- `src/agent/models.ts`, `src/agent/transcript-generation.ts`, `src/app/api/transcript/download/route.ts`, `src/lib/meeting-pipeline-client.ts`.
- `@stream-io/node-sdk` 0.7.3 types: `verifyWebhook(requestBody, xSignature)`, `CallRecordingReadyEvent { call_cid, egress_id, call_recording }`.
- `prompts/fix-gemini-lite-fallback.md` (folded into build task 1).

**Practices & standards**:
- Fast failover with a short lived circuit breaker (the 60 s busy skip).
- Webhook HMAC verification over the raw body, idempotent processing.
- Measure before you optimise; strangler pattern with the old path as fallback.

**Links**:
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Groq Developer tier: https://groq.com/developer-tier-now-available-on-groqcloud/
- 503 on paid Tier 2 with Priority: https://discuss.ai.google.dev/t/persistent-503-on-gemini-3-7-flash-with-priority-tier-tier-2-paid-0-success-over-multiple-retries/179804
- Does paying help with 503s: https://community.n8n.io/t/gemini-api-503-error-on-free-tier-does-paying-help/304875
- 503 with priority inference: https://discuss.ai.google.dev/t/503-with-gemini-priority-inference/147253
