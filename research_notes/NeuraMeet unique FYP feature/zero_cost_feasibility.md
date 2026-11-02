# Zero-Cost Stack Feasibility for NeuraMeet Unique FYP Features (as of 2026-10-30)

Scope: free-tier capabilities and exact limits of the fixed NeuraMeet stack (Vercel Hobby, Stream Video free "Build" tier, Supabase Free, Gemini API free tier, Groq free tier, browser ML), and what real-time and post-meeting AI features they can support for a 5 to 10 person meeting. Installed SDKs checked locally: `@stream-io/video-react-sdk` 1.40.2, `@stream-io/video-client` 1.57.0.

## Gemini API free tier: models, limits, Live API, audio, context

### Takeaway
The Gemini free tier still covers Flash, Flash-Lite, 2.5 Pro, the Live (real-time audio) models, TTS and embeddings at no charge. Google no longer publishes a per-model free-tier RPM/RPD table; the binding numbers are only visible in the AI Studio dashboard. Third-party reports put Flash at roughly 10 to 15 RPM and 250 to 1,500 RPD, and Live at 3 concurrent sessions. Treat every number as something to verify in AI Studio before relying on it.

### Cited Findings
- The official rate-limits page gives no numbers. It says limits "depend on a variety of factors (such as your usage tier) and can be viewed in Google AI Studio", and that "rate limits are more restricted for experimental and preview models". — [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- These models are listed as "Free of charge" for input and output on the free tier: Gemini 3.8 Flash, 3.6 Flash, 3.8 Flash-Lite, 3.1 Flash-Lite, 2.5 Pro, 2.5 Flash, 2.5 Flash-Lite. — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Live and native-audio models are also free of charge on the free tier: Gemini 3.8 Live, 3.8 Live Extended Thinking, and 3.1 Flash Live Preview. The TTS models (3.8 Flash TTS, 3.8 Flash-Lite TTS, 3.1 Flash TTS Preview) are free too. — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Embeddings are free. "Gemini Embedding 2" is free for text, image, audio and video input, and "Gemini Embedding" is free for input. — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Free-tier content is used "to improve our products". This is a privacy point to disclose for meeting transcripts. — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- A third-party article (updated 2026-09-30) says "Google's documentation no longer prints a per-model free-tier table". It reports that in December 2025 the Gemini 2.5 Flash free tier dropped to about 20 requests per day, and that January 2026 third-party tables listed 5 to 15 RPM, 250,000 TPM and 100 to 1,000 RPD. — [yingtu.ai](https://yingtu.ai/en/blog/google-gemini-api-free-tier-limits-2026)
- Other aggregators give different figures. Some say 2.5 Flash has 10 RPM, 250K TPM and 250 RPD, and Flash-Lite has 30 RPM and 1,000 RPD. Others say Flash is "roughly 15 RPM and 1,500 RPD". These figures conflict, which is why they should be treated as unreliable. — [tinkerllm](https://tinkerllm.com/blog/gemini-api-free-tier-limits-rate-quotas/), [geotoolbox](https://geotoolbox.ai/blog/gemini-api-pricing.md)
- Live API: the free tier for Gemini 2.5 Flash Live is limited to 3 concurrent sessions, and paid tiers allow 50 or more. Audio-only Live sessions are capped at 15 minutes. — [Firebase AI Logic Live API limits](https://firebase.google.com/docs/ai-logic/live-api/limits-and-specs)

### Inferences
- **Real-time audio (Live API) is technically free**, but the 3-session concurrency limit and the 15-minute audio session cap mean it cannot listen to a whole 10-person, 60-minute meeting without reconnecting. Session-resumption logic would be needed, and only about 3 meetings could run at once. It suits one "AI participant" per meeting for short demos, not production-grade always-on listening.
- **Use Flash-Lite for high-frequency calls** such as periodic nudges, because it consistently gets the higher RPM and RPD in third-party reports. Keep 2.5 Pro and Flash for once-per-meeting post-processing.
- Gemini's multimodal audio input and free audio embeddings (Embedding 2) make "embed audio directly" possible. For RAG, though, the existing transcript-text pgvector route is cheaper.

### Gaps
- No primary source for exact 2026 free-tier RPM, TPM or RPD per model. Check the AI Studio rate-limit dashboard on the project's own key.
- No primary source for the context window of the 3.x models on the free tier. Historically Flash had 1M tokens; not verified for 2026.
- Not verified: whether the 3 concurrent sessions and 15-minute cap also apply to the 3.8 Live models. The Firebase page covers 2.5 Flash Live.
- No benchmark found for how well Gemini handles Urdu-English code-switching.

## Groq free tier: Whisper and LLM limits, file size, Urdu

### Takeaway
On the free plan, Groq Whisper (large-v3 and v3-turbo) allows 20 RPM, 2,000 RPD, 7,200 audio-seconds per hour (2 h of audio per hour) and 28,800 audio-seconds per day (8 h per day), with a 25 MB file cap and a 10-second minimum billed length. LLMs on the free plan are tight on tokens: 8K TPM and 200K TPD for gpt-oss-120b and 20b.

### Cited Findings
- Free-plan limits for whisper-large-v3 and whisper-large-v3-turbo: 20 RPM, 2K RPD, 7.2K ASH (audio seconds per hour) and 28.8K ASD (audio seconds per day). — [Groq rate limits](https://console.groq.com/docs/rate-limits)
- Free-plan LLM limits:
  - openai/gpt-oss-120b and gpt-oss-20b: 30 RPM, 1K RPD, 8K TPM, 200K TPD.
  - qwen/qwen3.8-27b: 30 RPM, 1K RPD, 8K TPM, 200K TPD.
  - gpt-oss-safeguard-20b: 3 RPM.
  - Llama Prompt Guard 2: 30 RPM and 14.4K RPD.
  - No Llama chat models are listed in the free-plan table any more. — [Groq rate limits](https://console.groq.com/docs/rate-limits)
- Speech-to-text file size limit is 25 MB on the free tier and 100 MB on the Dev tier. Minimum billed length is 10 seconds. Accepted formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm. — [Groq speech-to-text](https://console.groq.com/docs/speech-to-text)
- `timestamp_granularities` supports "segment" and "word", and both can be requested together. Passing an ISO-639-1 `language` (for example `ur`) improves accuracy and latency. The translation endpoint only outputs English and only works with v3, not turbo. — [Groq speech-to-text](https://console.groq.com/docs/speech-to-text)
- Groq's stated error rates: whisper-large-v3 10.3% WER at 189x speed; v3-turbo 12% WER at 216x speed. Groq recommends chunking audio with overlap for files above the size limit. — [Groq speech-to-text](https://console.groq.com/docs/speech-to-text)

### Inferences
- The 10-second minimum billed length means sending many tiny chunks (for example 3-second VAD utterances) wastes the ASH budget. Batch audio into chunks of 10 seconds or more.
- 25 MB holds roughly 60 to 100 minutes of mono 16 kHz opus/webm. A full meeting per participant fits in one request once compressed.
- 200K TPD on gpt-oss caps live LLM nudging badly. Sixty nudges per hour at about 3K tokens each is about 180K tokens, so roughly one meeting-hour per day. Groq LLMs should be the fallback, not the main engine, for frequent real-time calls.

### Gaps
- Groq publishes no Urdu-specific accuracy figures. Its WER figures are general and multilingual.
- The free-plan model list differs from older knowledge (no Llama 3.x chat models). Re-check the console before choosing a model ID.

## Stream Video free tier: minutes, captions, recording, events, raw audio

### Takeaway
Stream's free Build tier gives 333,000 video-call participant minutes per month and $100 in monthly credits, with no card required. Webhooks and recording are included. Native transcription and closed captions are a paid add-on at $8 per 1,000 call minutes, and Urdu is not one of the 29 supported caption languages. In-browser building blocks are all available in the installed SDK: custom events, reactions, and per-participant `MediaStream` audio.

### Cited Findings
- Build (free) tier includes:
  - 333,000 video-call participant minutes and 833,000 live-streaming audio participant minutes.
  - "Unlimited Participants".
  - Recording, and "Webhooks Integration".
  - "$100 in free credits" monthly, "No Credit Card".
- Transcription and closed captions are an add-on at "$8.00 / Per 1000 call minutes". — [Stream Video pricing](https://getstream.io/video/pricing/)
- Captions and transcription are started with `startTranscription()` and `startClosedCaptions()` and emit `call.closed_caption`, `call.transcription_ready`, and related events. 29 languages are supported and **Urdu is not listed**. Auto-detection reduces accuracy and adds latency. Transcripts are stored for 2 weeks. — [Stream transcription docs](https://getstream.io/video/docs/react/transcribing/calls/)
- The installed `@stream-io/video-client` 1.57.0 type definitions expose `sendCustomEvent`, `sendReaction`, `startClosedCaptions`, `startTranscription`, `startRecording`, and per-participant `audioStream?: MediaStream`. — local check of `node_modules/@stream-io/video-client/dist/src/*.d.ts`

### Inferences
- Each client can access raw audio in the browser through the participant `audioStream` and the local microphone `MediaStream`. It can feed this to `MediaRecorder`, Web Audio, or transformers.js without Stream's paid captioning. This is the zero-cost path for live transcription.
- `sendCustomEvent` lets you broadcast live captions or AI nudges to all participants over Stream's existing WebSocket. This avoids spending Supabase Realtime quota.
- Whether the $100 credit can be spent on the transcription add-on is unclear, and it would not help Urdu anyway. Under the project's zero-cost rule, Stream native captions should be treated as off-limits.
- Project context: AGENTS.md records that composite recording proved non-functional on this account (D3.4), and transcript generation (F-steps) relies on individual recordings plus Groq Whisper.

### Gaps
- No source found on the custom-event payload size limit or the rate limit for `sendCustomEvent`. Verify in the Stream `stream-react` skill (`references/VIDEO.md`).
- Not confirmed: recording storage retention and limits on the free tier, and whether noise cancellation is free.

## Supabase Free: Realtime, Edge Functions, pgvector, storage, pausing

### Takeaway
Supabase Free is enough for a 5 to 10 person meeting app. Limits: 500 MB DB, 1 GB storage, 50 MB max upload, 5 GB egress, 500K Edge Function invocations, 200 concurrent Realtime connections, 2M Realtime messages per month. The project pauses after 1 week of inactivity, which is a demo-day risk.

### Cited Findings
- Free plan:
  - Database: 500 MB (shared CPU, 500 MB RAM).
  - Egress: 5 GB, plus 5 GB cached egress.
  - Storage: 1 GB file storage, 50 MB max file upload.
  - Edge Functions: 500,000 invocations.
  - Realtime: 200 concurrent peak connections, 2 million messages per month.
  - Auth: 50,000 MAU.
  - Projects: "paused after 1 week of inactivity", limit of 2 active projects. — [Supabase pricing](https://supabase.com/pricing)

### Inferences
- Example Realtime load: 10 participants receiving a caption broadcast every 3 seconds is about 200 messages per minute, or 12K per meeting-hour if delivered messages are counted per recipient. That allows roughly 160 meeting-hours per month, which is comfortable for an FYP.
- pgvector shares the 500 MB DB. A 768-dimension float4 embedding is about 3 KB per chunk, so roughly 100K chunks before you hit storage pressure. That is ample.
- Upload a pg_cron or GitHub Actions keep-alive ping before the viva so the project does not get paused.

### Gaps
- Not verified: whether Realtime "messages" counts each fan-out delivery. Not verified: Edge Function wall-clock and CPU limits on Free (not on the pricing page).

## Vercel Hobby: duration, streaming, body size, cron

### Takeaway
Vercel Hobby functions run for up to 300 s with 2 GB memory and 1 vCPU, and support streaming. Request and response bodies are capped at 4.5 MB. Cron jobs are limited to once per day with ±59 min precision, so Vercel cron cannot drive anything time-sensitive.

### Cited Findings
- With Fluid compute, Hobby functions run 300 s by default and at most. Memory is 2 GB with 1 vCPU. Concurrency auto-scales to 30,000. The maximum request or response payload is 4.5 MB (413 `FUNCTION_PAYLOAD_TOO_LARGE`). — [Vercel functions limits](https://vercel.com/docs/functions/limitations)
- Edge runtime must start responding within 25 s and can stream for up to 300 s. WebSocket support is in public beta. — [Vercel functions limits](https://vercel.com/docs/functions/limitations)
- Hobby cron: 100 jobs per project, a minimum interval of once per day, and per-hour precision (±59 min). More frequent expressions fail at deploy. — [Vercel cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing)

### Inferences
- The 4.5 MB body cap means you cannot POST a whole meeting's audio to a Next.js API route. Upload it to Supabase Storage (50 MB cap) or post small chunks of 30 to 60 s of opus, about 0.2 to 0.5 MB each, then have the route fetch the audio and send it to Groq.
- 300 s is enough for one Whisper call plus LLM processing per chunk. Long post-meeting jobs should fan out per participant track.
- Scheduled real-time work (for example "nudge every 60 s") must be driven by a client timer in the meeting room, not by Vercel cron.

### Gaps
- Not checked: Hobby monthly quotas for invocations and active CPU on the /docs/limits page.

## Browser ML: Web Speech API, transformers.js Whisper, MediaPipe, WebGPU

### Takeaway
Chrome's Web Speech API now supports on-device recognition (`processLocally`, Chrome 139+). There is no source confirming an on-device Urdu (ur-PK) language pack; check it at runtime with `SpeechRecognition.available()`. In-browser Whisper (transformers.js) and MediaPipe were not researched in this pass beyond general knowledge, so they are listed as gaps.

### Cited Findings
- Setting `SpeechRecognition.processLocally = true` forces on-device recognition (default false), so neither audio nor transcript leaves the device. — [MDN Using the Web Speech API](https://developer.mozilla.org/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- On-device Web Speech recognition shipped in Chrome 139. `SpeechRecognition.available()` checks whether a language pack is present. — [blink-dev Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM)

### Inferences
- **Zero-quota live captions:** each participant runs Web Speech on their own microphone (cloud or on-device in Chrome) and broadcasts the text with Stream `sendCustomEvent`. Speaker labels are free because each client only transcribes itself, and nothing touches the Groq or Gemini quotas. Weaknesses: Chrome and Edge only (Firefox lacks SpeechRecognition), English quality is good, Urdu quality is unknown, and there is no mixed-language mode (one `lang` per session).
- MediaPipe (face, gesture, pose) and transformers.js run fully client-side, so they cost nothing and use no quota. Attention or engagement detection and gesture reactions are feasible from a cost standpoint. The limits are client CPU and GPU load during a video call.

### Gaps
- Not confirmed: Urdu (ur-PK) support in Chrome Web Speech, either cloud or on-device.
- Not researched with citations: transformers.js Whisper model sizes and latency on WebGPU, MediaPipe task list, and WebGPU browser coverage in 2026.

## Urdu and Roman Urdu: Whisper and Gemini accuracy on code-switching

### Takeaway
Off-the-shelf Whisper large-v3 is usable but imperfect on pure Urdu. Its accuracy degrades badly on Urdu-English code-switching: about 29% WER without code-switching versus about 53% with it, according to an IBA FYP-level study found via search but not opened, so that figure is unconfirmed. English words often come out in Urdu script or translated. Fine-tuned models reach about 18 to 24% WER.

### Cited Findings
- "WER We Stand: Benchmarking Urdu ASR Models" (Arif et al., arXiv 2409.11252v3, June 2025). After fine-tuning, Whisper large-v3 reached 23.79 WER on read speech and 17.86 WER on conversational speech. Seamless-Large reached 17.09 and 18.75; MMS 1B reached 28.37 and 42.46. Seamless tended to translate English words (for example "Research" became "Tehqeeq") instead of transliterating them. — [arXiv 2409.11252](https://arxiv.org/html/2409.11252v3)
- Reported: Whisper-large-v3 WER of 0.289 without code-switching and 0.532 with code-switching. It failed on code-switched audio by transliterating or translating English into Urdu script. This comes from a search-result summary attributed to an IBA repository and arXiv 2605.17846; the original was not opened, so it is unverified. — [IBA FYP repository](https://ir.iba.edu.pk/fyp-bscs/50), [arXiv 2605.17846](https://arxiv.org/pdf/2605.17846)

### Inferences
- For bilingual meetings, try two approaches: let Whisper auto-detect the language, or pass `language: "ur"` and then run an LLM post-pass (Gemini) to transliterate the output into Roman Urdu and restore English technical terms. The LLM clean-up step is a plausible novel FYP contribution and costs nothing.
- Because pure Whisper output on code-switched audio is weak, a "Roman Urdu normalisation" or "code-switch-aware transcript" feature is both a real problem and feasible on this stack.

### Gaps
- No benchmark found for how Gemini handles Urdu-English code-switching in speech or text.
- No Groq-specific Urdu WER figure was found.

## Feasibility: real-time in-meeting AI for 5 to 10 people within free limits

### Takeaway
Live captions plus an LLM nudge every 60 s is achievable for free if transcription happens in the browser, or through one mixed Groq Whisper stream per meeting. Running Groq Whisper per participant for 10 people breaks the 7,200 ASH limit. LLM nudges should use Gemini Flash-Lite with a rolling summary, with Groq as fallback. The calculations below combine the cited limits above.

### Cited Findings
- Constraints, all cited in the sections above:
  - Groq Whisper: 20 RPM, 7,200 ASH, 28,800 ASD, 10 s minimum billed length.
  - Groq LLM: 200K TPD.
  - Gemini Live: 3 concurrent sessions and a 15-minute audio cap.
  - Vercel: 4.5 MB body and 300 s maximum duration.
  - Supabase: 2M Realtime messages per month.
  - Stream: `sendCustomEvent` available; native captions are paid and have no Urdu. — [Groq rate limits](https://console.groq.com/docs/rate-limits), [Firebase Live limits](https://firebase.google.com/docs/ai-logic/live-api/limits-and-specs), [Vercel limits](https://vercel.com/docs/functions/limitations), [Supabase pricing](https://supabase.com/pricing), [Stream pricing](https://getstream.io/video/pricing/)

### Inferences
Arithmetic on the cited limits:
- **Option A: Groq Whisper per participant, 30 s chunks.** 10 people × 3,600 s = 36,000 audio-seconds per hour, which is 5× over the 7,200 ASH limit. 10 × 2 = 20 requests per minute, which sits exactly at the 20 RPM limit. **Not feasible.**
- **Option B: Groq Whisper on VAD-gated speech per participant.** In a meeting, total speech across everyone is about the meeting length, roughly 3,600 s per hour. That is within 7,200 ASH, so about 1 to 2 concurrent meetings and about 8 meeting-hours per day (28,800 ASD). Speaker labels come for free. Chunks must be at least 10 s each, otherwise the minimum billed length inflates usage. **Feasible for a demo-scale FYP.**
- **Option C: Web Speech API per participant, plus Stream custom events.** This uses no server quota and supports unlimited meetings. Urdu support is unverified. **Most scalable for English. Combine with Option B as the Urdu fallback, or as a post-meeting high-accuracy pass.**
- **LLM nudges every 60 s on Gemini Flash-Lite.** A 60-minute meeting needs about 60 requests, about 1 RPM, which is well under any reported Flash-Lite RPM. A daily budget of roughly 1,000 RPD, if accurate, allows about 16 meeting-hours per day. Send only the last 60 s of transcript plus a short rolling summary, under 2K tokens per call. Fall back to Groq gpt-oss-20b, at roughly 100K tokens per meeting-hour against 200K TPD.
- **Gemini Live as a voice agent:** only 3 concurrent sessions and 15-minute audio sessions. Suitable for an on-demand "ask the meeting AI" voice moment, not for continuous listening.
- **Post-meeting** (summaries, action items, RAG, attendance PDF, cross-meeting search) fits comfortably in every quota. The main risk is Gemini RPD on the free tier, which the existing Groq fallback covers.

### Gaps
- The actual per-key Gemini limits must be read from AI Studio. Every Gemini number here is either third-party or inferred.
- No load test has been done. The browser CPU cost of running MediaPipe, transformers.js and a 10-tile video grid at the same time is unknown.
