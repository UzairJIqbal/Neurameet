# Zero-cost technical feasibility: NeuraMeet as a GitHub-connected project workspace (as of 2026-11-02)

Context checked locally: next 15.5.18, react 19.1.9, @stream-io/video-react-sdk 1.40.2, @clerk/nextjs 6.35.2, @supabase/supabase-js 2.112.2, ai 7.0.64 (from `node_modules/*/package.json`). `resend` is not in node_modules (the project uses it per AGENTS.md A2 precedent, but it is not currently installed).

## 1. GitHub integration: GitHub App vs OAuth App, webhooks, limits, packages

### Takeaway
Use a GitHub App (free to register, works on private repos of free accounts because the installer picks repos at install time). Verify `X-Hub-Signature-256` against the raw `await req.text()` body, respond 2xx within 10 s, dedupe on `X-GitHub-Delivery`, and do the work in `after()`; GitHub never auto-retries, so a missed delivery needs manual or API redelivery within 3 days.

### Cited Findings
- GitHub's own guidance: "In general, GitHub Apps are preferred to OAuth apps because they use fine-grained permissions, give more control over which repositories the app can access, and use short-lived tokens." — [GitHub Docs: Differences between GitHub Apps and OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- GitHub Apps have built-in centralized webhooks across all installed repos/orgs; OAuth apps need a webhook configured per repo. Installation access tokens expire after one hour. Apps keep working after the installing person leaves an org. Only exception favoring OAuth apps: enterprise-level resources. — [same page](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- Installation access token rate limit: 5,000 requests/hour base, plus 50/hour per repo beyond 20 repos and 50/hour per org user beyond 20 members, max 12,500/hour (15,000 on Enterprise Cloud). User access tokens share the user's 5,000/hour limit. Secondary limits: max 100 concurrent requests, 900 points/min for REST, max 80 content-generating requests/min and 500/hour (relevant to "create issue" from NeuraMeet). — [GitHub Docs: REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- Webhook response: "Your server should respond with a 2XX response within 10 seconds of receiving a webhook delivery." Use `X-GitHub-Delivery` to ensure each delivery is unique (replay/dedupe). Use a high-entropy webhook secret. Recommended to queue payloads and process asynchronously. — [GitHub Docs: Best practices for webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- "GitHub does not automatically redeliver failed deliveries." Deliveries from the past 3 days can be redelivered, via web UI or REST API for GitHub Apps. — [GitHub Docs: Redelivering webhooks](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks)
- Signature: HMAC hex digest (SHA-256) of the payload with the webhook secret, header value prefixed `sha256=`; never compare with `==`, use `crypto.timingSafeEqual`. GitHub's JS example reads `const body = await req.text()` and calls `webhooks.verify(body, signature)` from `@octokit/webhooks`. — [GitHub Docs: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- Local testing: smee.io gives a proxy URL; run `smee --url WEBHOOK_PROXY_URL --path /PATH --port PORT` to forward to localhost. — [GitHub Docs: Testing webhooks](https://docs.github.com/webhooks/testing-and-troubleshooting-webhooks/testing-webhooks)
- npm (queried 2026-11-02 with `npm view`): `@octokit/app` 16.1.4, unpacked 96.7 KB; `@octokit/webhooks` 14.2.0, 186 KB; `@octokit/webhooks-methods` 6.0.0, 23.7 KB (verify/sign only); `@octokit/rest` 22.0.1, 8.3 KB wrapper (pulls in core deps). — npm registry via `npm view`
- Vercel Hobby "does not support connecting a project on your Hobby team to Git repositories owned by Git organizations" (this concerns deploying NeuraMeet itself, not the GitHub App reading org repos). — [Vercel Limits](https://vercel.com/docs/limits)

### Inferences
- Recommended permissions (least privilege): Repository: Contents read, Metadata read (mandatory), Pull requests read, Issues read and write. Subscribe to events: `push`, `pull_request` (actions opened/closed; merged = `closed` with `pull_request.merged === true`), `issues`, `installation`, `installation_repositories`. Permission names/event list are standard GitHub App settings; I did not re-fetch the permissions reference page, so verify names in the App settings UI.
- Installation flow: user clicks `https://github.com/apps/<slug>/installations/new`, picks repos, GitHub redirects to the App "Setup URL" with `installation_id`; store `installation_id` against the NeuraMeet project (verify the installing user owns it, e.g. by also requesting user authorization during install). Mint short-lived installation tokens server-side with the App private key (`@octokit/app` or `@octokit/auth-app`). Private key stays server-only, add it to the AGENTS.md "never expose" list.
- Private repos on free accounts: GitHub Apps are free to create and can be installed on private repos of free personal accounts and free orgs; I found no plan restriction. Student orgs (GitHub Education/Classroom orgs) may require an org owner to approve the install; members can request it. Flagged as unverified (no source fetched on org approval policy).
- Minimal bundle: for verification only, `@octokit/webhooks-methods` (24 KB) or plain `node:crypto` (zero deps) is enough; a few REST calls can be done with `fetch` plus a JWT signed with `node:crypto`, avoiding Octokit entirely. `@octokit/app` is convenient and small enough for a server route.
- In Next.js route handlers, read `await request.text()` once, verify, then `JSON.parse` the same string. Do not call `request.json()` first (it consumes the body).
- Webhook rate limits are dwarfed by an FYP's traffic; the binding constraint is the 80 content-creating requests/min if bulk-creating issues from action items.

### Gaps
- `gh webhook forward` (GitHub CLI extension) works for repo/org webhooks; whether it supports GitHub App webhooks was not confirmed. smee.io is the documented route for Apps.
- Vercel preview deployments have Deployment Protection (Vercel auth) by default, which would block GitHub's POSTs; a protection bypass or using production URL is needed. Not re-verified this session.
- Webhook payload size cap (commonly cited 25 MB) not confirmed from a fetched page.

## 2. Vercel Hobby: limits, background work, commercial clause

### Takeaway
Hobby gives 300 s max function duration, 1M invocations/month and 4 h Active CPU; cron only once per day with ±59 min precision. Use `after()` (stable since Next 15.1, backed by Vercel `waitUntil`) to ack webhooks fast and process afterwards within the same 300 s budget. Hobby is non-commercial only, which fits an FYP.

### Cited Findings
- Hobby function maximum duration: "300s (5 minutes) default and max" (Pro: 300 s default, 800 s max). — [Vercel Limits](https://vercel.com/docs/limits) (last_updated 2026-09-16)
- Hobby monthly included: 1,000,000 function invocations, 4 hours Active CPU, 360 GB-hrs provisioned memory, 100 GB Fast Data Transfer, 10 GB Fast Origin Transfer. — [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- Cron: 100 cron jobs per project on Hobby, minimum interval once per day, precision per-hour (±59 min). More frequent expressions "will fail deployment". — [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- Runtime logs kept 1 hour on Hobby. — [Vercel Limits](https://vercel.com/docs/limits)
- "Hobby teams are restricted to non-commercial personal use only." Commercial = financial gain for anyone involved, payments, ads, paid hosting work; donations are not commercial. — [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- `after()` schedules work after the response; works in Route Handlers; "will run for the platform's default or configured max duration of your route" (configurable via `maxDuration`); on Vercel implemented via `waitUntil(promise)`; runs even if the response errored; stable since v15.1.0. — [Next.js docs: after](https://nextjs.org/docs/app/api-reference/functions/after) (installed next 15.5.18 has `node_modules/next/dist/server/after/after.d.ts`)

### Inferences
- Webhook pattern: verify signature, insert a `github_events` row keyed by `X-GitHub-Delivery` (unique constraint = idempotency), return 202, then `after(() => process(deliveryId))`. If processing fails, the stored row lets a "reprocess" button or the daily cron retry; no external queue needed.
- Any AI step (Gemini task proposals) inside `after()` must finish within 300 s total; keep it small and resumable.
- Daily cron is fine for digests/overdue checks, not for near-real-time work. Sub-daily scheduling at zero cost would need an external free pinger or Supabase `pg_cron` (Supabase pg_cron availability on free not verified this session).
- Request body limit (commonly 4.5 MB for Vercel Functions) appeared in the Limits page section list but the exact number was not extracted; GitHub push payloads are normally far below this.

### Gaps
- Exact Vercel Functions request/response body size limit not quoted from a fetched page (believed 4.5 MB; unconfirmed this session).

## 3. Supabase free: limits, RLS with Clerk, Realtime, pausing

### Takeaway
Free plan: 500 MB DB, 1 GB storage, 5 GB egress, 200 concurrent Realtime connections, 2M Realtime messages/month, 2 active projects, pause after 1 week inactive. Clerk is a native third-party auth provider (JWT template deprecated since 2025-04-01), so RLS can use `auth.jwt()->>'sub'`; project membership should live in our own `project_members` table that RLS joins against.

### Cited Findings
- Free plan: database 500 MB per project; file storage 1 GB; max upload 50 MB; egress 5 GB (+5 GB cached); 50,000 MAU; Realtime 200 concurrent peak connections and 2 million messages/month; 500,000 Edge Function invocations; 2 active projects; "Free projects are paused after 1 week of inactivity"; log retention 1 day. — [Supabase Pricing](https://supabase.com/pricing)
- Realtime free limits: 200 concurrent connections, 100 messages/second, 100 channel joins/second, 100 channels per connection, Broadcast payload 256 KB, Postgres Changes payload 1,024 KB. — [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits)
- Clerk native Supabase integration: add Clerk under Supabase Authentication > Third Party Auth; "As of April 1st, 2025, the Clerk Supabase JWT template is considered deprecated"; Clerk adds `"role": "authenticated"` to session tokens; RLS example `using (((select auth.jwt()->>'sub') = (user_id)::text))`; clients pass the Clerk session token via an `accessToken` callback. The doc does not cover organization claims in RLS. — [Clerk Docs: Supabase integration](https://clerk.com/docs/guides/development/integrations/databases/supabase)

### Inferences
- Project currently uses the service-role key server-side for all writes (per AGENTS.md). Simplest multi-tenant model that keeps that architecture: keep service-role access in API routes and enforce membership in code (`project_members` lookup), and add RLS policies keyed on `auth.jwt()->>'sub'` joined to `project_members` only where the browser reads directly (e.g. Realtime subscriptions for the Kanban). Realtime Postgres Changes respect RLS, so a browser subscription needs the Clerk token path.
- Realtime Broadcast (no DB write) is the cheapest live channel for Kanban moves; 200 concurrent connections is ample for an FYP demo.
- pgvector capacity: 768-dim float4 embedding ≈ 3 KB per row plus index; roughly 100k chunks ≈ 300 MB+ with HNSW index, so 500 MB is the binding limit. This is an estimate, not a sourced figure.
- Pausing: a demo project idle >7 days pauses; a daily Vercel cron that runs one cheap query keeps it active (common practice; not an officially endorsed mechanism).

### Gaps
- Whether Clerk org claims (`o.id` in v2 session tokens) are usable in Supabase RLS was not confirmed from docs.
- pgvector row/size guidance not found on an official page.

## 4. Clerk free: MAU, Organizations, roles, invitations

### Takeaway
Clerk Hobby is free with no card: 50,000 monthly retained users per app, Organizations included (100 monthly retained orgs, max 20 members per org, only Admin and Member roles; custom roles need a paid add-on). For project workspaces with Owner/Maintainer/Member/Viewer roles, model roles in our own Supabase tables and send invites via Resend; skip Clerk Organizations.

### Cited Findings
- Hobby: "50,000 MRU limit per app" (MRU = user who returns 24+ hours after signup); Organizations: "100 MRO included per app", "Up to 20 members per Organization", "Includes Admin & Member roles"; custom roles require the B2B add-on ("Enhanced add-on — $100/mo"); invitations included; "No credit card required to start". — [Clerk Pricing](https://clerk.com/pricing) (summarized by fetch tool; the "custom permissions" wording on free was ambiguous)

### Inferences
- Own-table roles (`projects`, `project_members(user_id, role)`, `project_invites(token, email, role, expires_at)`) are zero-cost, unlimited members per project, any role set, and consistent with the existing service-role architecture. Clerk Organizations would cap teams at 20 and lock role names, plus add org-switching UI complexity. Recommendation: own tables.
- Invite acceptance: tokenized link emailed via Resend; on sign-in, the API route matches the token and inserts `project_members`. No Clerk invitations API needed.

### Gaps
- Exact current wording on whether Hobby allows custom permissions (as opposed to custom roles) was not verified in Clerk docs.

## 5. Stream Video free tier: minutes, recording, captions/transcription, chat

### Takeaway
Stream Build (free) plan gives a $100 monthly credit with no card; recording is included, but closed captions/transcription are billed at $8 per 1,000 call minutes and the installed SDK's caption language enum has no Urdu. Treat Stream captions as off-limits (cost plus no Urdu) and use Stream custom events (already used by Live Ledger) instead of Stream Chat for in-call messages.

### Cited Findings
- Free (Build) plan: $100 monthly free credit, roughly 333,000 audio call participant minutes; no credit card required; recording included; "Transcriptions/Closed Captions: $8.00 / Per 1000 call minutes". — [Stream Video pricing](https://getstream.io/video/pricing/) (summarized by fetch tool)
- Installed `@stream-io/video-client` types (`StartClosedCaptionsRequestLanguageEnum`) list: auto, en, fr, es, de, it, nl, pt, pl, ca, cs, da, el, fi, id, ja, ru, sv, ta, th, tr, hu, ro, zh, ar, tl, he, hi, hr, ko, ms, no, uk, bg, et, sl, sk. Urdu (`ur`) is absent. — local file `node_modules/@stream-io/video-client/dist/src/gen/coordinator/index.d.ts` lines 8604-8642 (SDK 1.40.2)

### Inferences
- The $8/1,000 minutes may be drawn from the $100 free credit (which would make captions technically free up to the credit), but the pricing page did not make that explicit; and Urdu is unsupported anyway (Hindi `hi` exists; spoken Urdu and Hindi overlap but output script would be Devanagari). Not recommended.
- Stream custom events have a 5 KB cap (per AGENTS.md LL0 notes), fine for caption lines.

### Gaps
- Whether captions/transcription consume the free $100 credit or require a paid plan was not confirmed.
- Stream Chat free tier limits were not researched (not needed if custom events suffice).

## 6. Live captions at zero cost

### Takeaway
Recommend the browser Web Speech API as an opt-in live-caption layer (each participant captions their own mic in Chrome/Edge and broadcasts lines via Stream custom events), with the existing post-call Groq Whisper pipeline as the source of truth. Groq chunked near-real-time burns the shared Whisper quota (20 RPM, 7,200 audio s/hour) and breaks past ~1 to 2 speakers; in-browser Whisper tiny/base is free but weak for Urdu and heavy on low-end laptops.

### Cited Findings
- Groq free Whisper (whisper-large-v3 and -turbo): 20 RPM, 2,000 RPD, 7,200 audio seconds/hour (ASH), 28,800 audio seconds/day (ASD); "there may be exceptions to these limits". — [Groq rate limits](https://console.groq.com/docs/rate-limits)
- Chrome's Web Speech API by default sends audio to Google servers for recognition. — [Chrome Developers blog](https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api)
- On-device mode exists: `SpeechRecognition.install()` downloads language packs; with `processLocally = true` and no pack, `start()` fails with language-not-supported. — [MDN: SpeechRecognition.install()](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/install_static); [MDN: available()](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/available_static)
- Edge on-device languages (Edge 150): en-US, de-DE, it-IT, pt-PT, es-ES, ko-KR (no Urdu). — [Microsoft Edge: Speech recognition API](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api)
- Google's cloud speech service has an Urdu language code (`ur-PK`). — [Google Cloud Speech LanguageCodes.Urdu](https://cloud.google.com/dotnet/docs/reference/Google.Cloud.Speech.V1/latest/Google.Cloud.Speech.V1.LanguageCodes.Urdu)
- Transformers.js runs Whisper via the ASR pipeline on WebGPU, falling back to WASM; whisper-tiny ~39 MB, whisper-base ~74 MB (~40 MB at q4); for real-time use stick to tiny/base. — [LogRocket: real-time voice AI in the browser](https://blog.logrocket.com/how-to-build-a-real-time-voice-ai-agent-in-the-browser); [HackerNoon: Whisper WebGPU guide](https://hackernoon.com/turn-audio-to-text-on-your-device-free-whisper-webgpu-guide)

### Inferences
- Groq math: 5 s chunks = 12 requests/min per active speaker, so 20 RPM supports ~1.5 concurrent speakers; 7,200 ASH = 2 hours of audio per hour total; 28,800 ASD = 8 hours/day, shared with the F-step post-call transcript generation. Live use would starve post-call generation. Reject.
- Web Speech in Chrome cloud mode likely accepts `ur-PK` (Google's backend supports it) and mixed Urdu-English poorly; Firefox has no SpeechRecognition; Safari support varies. Present captions as "best effort, Chrome/Edge" and fall back gracefully. Privacy note: audio goes to Google, disclose in UI.
- In-browser Whisper: zero server cost and private, but tiny/base Urdu quality is low (Whisper's Urdu WER is high even on larger models), first load 40 to 75 MB, and CPU/GPU load competes with the video call. Suitable only as a stretch option.

### Gaps
- No primary source confirmed Chrome's Web Speech `ur-PK` support or measured accuracy; must be tested in the target browser.
- Groq's list did not include llama-3.3-70b-versatile / llama-3.1-8b-instant on the free table (see section 8).

## 7. Email invitations (Resend)

### Takeaway
Resend free: 3,000 emails/month, 100/day, 10 req/s, no card. Without a verified domain you can only send from `onboarding@resend.dev` to your own account email, so invitations to arbitrary teammates require verifying a domain you control (a free subdomain is not provided by Resend).

### Cited Findings
- Free plan: 3,000 emails/month, 100 emails/day, 10 requests/second; domains on free plan reported as up to 3 by the fetch tool (unverified wording). — [Resend: Account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
- The `resend.dev` domain is "only available for testing purposes and can only send emails to the email address associated with your Resend account"; to send to others, verify a domain and change the `from` address. — [Resend: 403 error resend.dev domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
- npm `resend` 6.37.0, 393 KB unpacked. — npm registry via `npm view`

### Inferences
- Domain verification needs a domain you own (DNS records). If none is available at zero cost, fallback: show a copyable invite link in the UI (always works) and treat email as optional. The A2 email-notifications step presumably already faced this; check its config before deciding.

### Gaps
- Number of domains allowed on free not confirmed from a primary page (fetch summary said 3; Resend has historically allowed 1 on free).

## 8. Gemini and Groq free tiers for extra AI load

### Takeaway
Google no longer publishes per-model free limits in docs (they show only in AI Studio), so exact Gemini RPD must be read from the project's AI Studio page. Groq's free table (Nov 2026) lists gpt-oss-120b/20b and qwen3.8-27b at 30 RPM, 1K RPD, 8K TPM, 200K TPD; Llama 3.x models were not in the free table. Batch AI work per meeting/webhook to stay under ~1K requests/day per model.

### Cited Findings
- Gemini docs page now redirects to AI Studio and states "Rate limits depend on a variety of factors (such as your usage tier) and can be viewed in Google AI Studio"; "Specified rate limits are not guaranteed and actual capacity may vary." No numbers on the page. — [Google AI Studio: rate limits](https://aistudio.google.com/docs/rate-limits) (redirected from ai.google.dev)
- Third-party summaries (secondary, conflicting): free access limited to Gemini 2.5 Flash, 2.5 Flash-Lite, 3 Flash and 3.1 Flash-Lite; 2.5 Flash reported as 10 RPM / 250K TPM / 500 RPD by one source, 1,500 RPD for Flash models by another (May 2026); Flash-Lite 30 RPM, 1,500 RPD, 1M TPM. — [tinkerllm blog](https://tinkerllm.com/blog/gemini-api-free-tier-limits-rate-quotas/); [aipromptshub](https://aipromptshub.co/blog/gemini-api-free-tier-rate-limits); [DEV cheatsheet](https://dev.to/hiyoyok/gemini-api-cheatsheet-2026-free-tier-limits-models-and-endpoints-in-one-place-2god)
- Groq free: openai/gpt-oss-120b and gpt-oss-20b 30 RPM, 1K RPD, 8K TPM, 200K TPD; qwen/qwen3.8-27b same; Whisper as in section 6. Llama 3.3 70B / 3.1 8B not shown in the free table. — [Groq rate limits](https://console.groq.com/docs/rate-limits)

### Inferences
- Groq 8K TPM is tight for long-context prompts (a 40-minute transcript easily exceeds 8K tokens), so Groq stays a fallback for short tasks (task proposals from one PR, decision classification); Gemini Flash handles long context.
- If the codebase still references a Llama model on Groq, verify it is still served on the free tier (risk of silent fallback failure).
- Budget: per GitHub event at most 1 LLM call, batched; do proposals on demand (button) rather than on every push to avoid burning RPD.

### Gaps
- Exact Gemini free RPM/RPD per model for Nov 2026 cannot be confirmed from a primary public source; read from AI Studio for the project's key.

## 9. Kanban drag and drop

### Takeaway
Use `@hello-pangea/dnd` 18.0.1 (peer React ^18 || ^19, list/board-specific, accessible, simplest API for a Kanban) or `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 (peer react >=16.8, more flexible, last released Dec 2024). The newer `@dnd-kit/react` is still 0.x (0.5.3).

### Cited Findings
- npm (2026-11-02): `@hello-pangea/dnd` 18.0.1, peers react ^18.0.0 || ^19.0.0, 1.26 MB unpacked, last published 2025-02; `@dnd-kit/core` 6.3.1, peers react >=16.8.0, 1.07 MB unpacked, last published 2024-12; `@dnd-kit/sortable` 10.0.0, 234 KB; `@dnd-kit/react` 0.5.3, peers react ^18 || ^19, modified 2026-10-31. — npm registry via `npm view`
- @hello-pangea/dnd is the community fork of the unmaintained react-beautiful-dnd and supports React 19. — [Puck: Top 5 DnD libraries for React](https://next.puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react); [depscope](https://mcp.depscope.dev/pkg/npm/@hello-pangea/dnd)

### Inferences
- For a column/card Kanban with keyboard accessibility out of the box, `@hello-pangea/dnd` is the least code. Unpacked size overstates bundle cost (includes multiple builds). Both are MIT and free.
- Persist order with a `position` numeric (fractional indexing) column; broadcast moves via Supabase Realtime Broadcast.

### Gaps
- No primary source on `@hello-pangea/dnd` behaviour with React 19 StrictMode double-mount in Next 15; test it.

## 10. Global search (Ctrl K)

### Takeaway
`cmdk` 1.1.1 (82 KB unpacked, peers React 18/19) for the palette UI; back it with a Postgres hybrid query: `tsvector` full-text (`websearch_to_tsquery`, GIN index) for exact names/issue numbers plus the existing pgvector `/api/search` for semantic hits, merged with reciprocal rank fusion. All in-database, zero cost.

### Cited Findings
- npm: `cmdk` 1.1.1, peers react ^18 || ^19 || ^19.0.0-rc, 81.9 KB unpacked. — npm registry via `npm view`
- AGENTS.md already defines `GET /api/search` as user-scoped pgvector semantic search (C1), so the Ctrl K box should extend it rather than add a new route. — local `/Users/UzairIqbal/Projects/neurameet/AGENTS.md`

### Inferences
- Use Postgres `simple` text-search config (not `english`) so Urdu/Roman-Urdu tokens are not stemmed away.
- Debounce 200 to 300 ms; full-text-only for 1 to 2 character queries to avoid embedding calls (each embedding call costs Gemini RPD).

### Gaps
- Supabase's own hybrid search guide (RRF SQL function) was not fetched this session; the pattern is well known but cite it when implementing.
