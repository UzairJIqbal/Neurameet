# Live / In-Call AI Meeting Features: What Ships, What Doesn't (as of Nov 2026)

Research date: 2026-11-02. About 17 tool calls. This builds on `research_notes/NeuraMeet unique FYP feature/competitor_feature_matrix.md` and `novel_feature_research.md`, and does not repeat them except where a finding changed.

Labels:
- **[V]** = verified on a primary or near-primary page I fetched (vendor page, arXiv abstract or full text).
- **[S]** = search-result snippet only. Plausible, but the page was not opened.
- **[U]** = unverified or low-trust: an aggregator, a competitor's blog, or a *.pages.dev site.

"Not found" means no source turned up in this pass. It does not prove no product has the feature.

## Q1. Which live in-call AI features already exist, and where?

### Takeaway
Most "live assistant" features are now standard. Every major platform and most notetakers ship at least one of these: on-demand in-call Q&A (catch me up, what was decided), live summaries, agenda and time nudges, live translation, and live Q&A over past meetings. What is thin or missing:
- **Proactive** push of past-meeting context while the call is running.
- **Anonymous** input during the call.
- **Live consensus or poll checks** run by AI.
- **Live captions in Roman Urdu or code-mixed Urdu.**

Silent-participant nudges exist only in niche facilitation bots, not in the majors.

### Cited Findings
**Major platforms (2026)**
- **Teams Facilitator (live):** posts the agenda, keeps timeline markers with midway and wrap-up reminders, writes real-time notes, summarizes decisions and open questions, and "@mentions absent participants in the meeting chat when they've been mentioned multiple times." **[U: InterMIND blog, Sep 2026]** — [InterMIND blog](https://intermind.com/blog/ai-meeting-assistant-in-the-meeting). Earlier verified Facilitator features are in `competitor_feature_matrix.md`.
- **Zoom AI Companion 3.0:**
  - Real-time in-meeting Q&A and response drafting **[S]**.
  - "Proactive meeting recommendations" from Nov 2025, where the AI acts as a facilitator, nudging teams to stay on the agenda, capturing decisions and suggesting next steps **[S]** — [Zoom community post](https://community.zoom.com/customer-success-forum-23/from-conversation-to-completion-zoom-ai-companion-3-0-73615); [UC Today](https://uctoday.com/top-10-new-transformative-zoom-ai-companion-features-for-it-leaders).
  - The InterMIND review says Zoom's documentation shows in-meeting Q&A only through preset prompts ("Catch me up", "What are the action items?") and "does not describe proactive unprompted actions" **[U]** — [InterMIND blog](https://intermind.com/blog/ai-meeting-assistant-in-the-meeting).
  - **Conflict:** Zoom's marketing says "proactive", while the competitor review says its documentation does not describe proactive actions. Treat Zoom's proactive nudging as agenda-level only.
- **Google Meet (Ask Gemini):**
  - Answers questions about the current call (discussions, decisions, action items) and helps late joiners catch up. No proactive interventions are documented **[U]** — [InterMIND blog](https://intermind.com/blog/ai-meeting-assistant-in-the-meeting).
  - **Urdu appears in Meet's translated-captions language list** (52 languages were added in 2024), and Urdu closed captions are in beta **[S]** — [Workspace Updates 2024](https://workspaceupdates.googleblog.com/2024/06/more-languages-for-captions-and-translated-captions-in-google-meet.html); [Meet Help](https://support.google.com/meet/answer/10964115).
  - Translated captions require paid Gemini add-ons for most Workspace customers (since Jan 2025) **[S]** — same Meet Help page.
- **Webex:** in-meeting catch-up and alerts when your name is mentioned (verified earlier in `competitor_feature_matrix.md`).

**Notetakers, checked one by one (this pass)**
| Product | Live / in-call feature found | Label | Source |
|---|---|---|---|
| Gong | Post-call conversation intelligence. Several sources say Gong has **no** native real-time in-call coaching; real-time sales "whisper" coaching comes from Wingman (Clari Copilot), Nooks and Deep View | [U] (competitor and aggregator sites) | [Rework](https://resources.rework.com/tools/sales-engagement/best-gong-alternatives); [DemandZen](https://demandzen.com/real-time-whisper-agents-top-sales-enablement-tools/) |
| Fathom | Fathom 3.0 (Apr 15, 2026): bot-free capture, **live summaries during the meeting**, and Ask Fathom across the whole meeting library with citations | [S] (BusinessWire press release seen in results, not opened) | [BusinessWire Apr 2026](https://www.businesswire.com/news/home/20260415965820/en/); [Product Hunt](https://www.producthunt.com/p/fathom/fathom-3-0) |
| tl;dv | Nothing live beyond recording and transcription; positioned on EU data storage | [U] | [tldv blog](https://tldv.io/blog/tldv-vs-fathom/) |
| Krisp | Noise cancellation, AI Live Interpreter (real-time translation), and listener-side real-time accent conversion (Mar 2026). Urdu support was not confirmed | [S] | [SiliconANGLE Mar 2026](https://siliconangle.com/?p=732765); [Krisp changelog](https://krisp.launchnotes.io/announcements/ann_VXHvr5WcqLqfH) |
| Granola | Live transcript during the meeting, plus per-meeting chat before, during or after it. Chat was rebuilt as an agent in Apr 2026 that searches months or years of notes with inline citations, and you can @-mention past meetings. All of this is **user-pulled**: you ask, it answers | [S] | [Granola help](https://help.granola.ai/article/chatting-with-your-meetings-ask-granola); [AlternativeTo](https://alternativeto.net/news/2025/10/granola-adds--mention-for-meeting-notes-in-chat); [Upstarts (coaching, recipes)](https://www.upstartsmedia.com/p/granola-launches-recipes) |
| Fellow | Agendas before, notes during, follow-ups after. "Ask Fellow" agent searches all of the team's meetings | [U] | [TechRepublic](https://www.techrepublic.com/article/news-best-ai-meeting-note-takers-2026/); [Fellow blog](https://fellow.app/blog/fathom-ai-alternatives-for-note-taking) |
| Avoma | **Live Answer Assistant** pops up in real time to suggest responses when specific questions or objections come up (sales use) | [U] (Jamie and moge aggregators) | [moge.ai](https://moge.ai/product/avoma); [Jamie blog](https://www.meetjamie.ai/blog/avoma-vs-fireflies-vs-jamie-which-one-is-better) |
| Jamie | Bot-free. Sidebar (Ctrl+J) gives real-time help during the meeting: drafting emails or summaries, and web search | [U] (Jamie's own blog) | [Jamie blog](https://www.meetjamie.ai/blog/supernormal-ai-notetaker) |
| Supernormal | Bot-free notes, summaries and action items. No distinct live feature found | [U] | [Jamie blog](https://www.meetjamie.ai/blog/supernormal-ai-notetaker) |
| MeetGeek | Joins, records and summarizes. No distinct live feature found | [U] | [Jamie blog](https://www.meetjamie.ai/blog/10-best-meetgeek-alternatives-competitors) |
| Bluedot | Chrome-extension recorder with real-time transcription in 100+ languages. No proactive live AI found | [U] | [Jamie blog](https://www.meetjamie.ai/blog/10-best-meetgeek-alternatives-competitors); [Circleback compare](https://circleback.ai/compare/avoma-vs-bluedot) |
| InterMIND (Mia) | Shipping freemium meeting platform with live translation in 23 languages (Urdu is in its UI language list). Per its own blog, Mia **posts previous session decisions and open items at the start**, gives halfway and wrap-up summaries, auto-notes commitments ("Noted: Anna — send the estimate by Friday"), surfaces unanswered questions and proposes next steps | [V] product exists, [U] feature claims (vendor blog) | [InterMIND](https://intermind.com/); [InterMIND blog](https://intermind.com/blog/ai-meeting-assistant-in-the-meeting) |
| Otter | "Hey Otter" live voice agent answers from past meetings (verified earlier in the matrix) | [V earlier] | see `competitor_feature_matrix.md` |

**Features by candidate category**
- **Silent-participant inclusion prompts:**
  - Raddle's AI Facilitator, a Webex App Hub app, "sends prompts throughout meetings in response to group dynamics" and shows a live Speaker Meter with a meeting-balance indicator **[S]** — [Webex App Hub](https://apphub.webex.com/applications/ai-meeting-facilitator-by-raddle-raddle-19041).
  - Equal Time is a niche inclusive-meeting tool **[U]** — [G2](https://www.g2.com/products/equal-time/reviews).
  - Read.ai has live talk-time coaching (matrix). The majors only @-mention *absent* people (Teams).
  - So this category is **taken by niche tools**.
- **Live polls / consensus checks by AI:** the InterMIND review says none of Teams, Zoom, Meet or Mia "document features like anonymous input, polls, or consensus checks during meetings" **[U]** — [InterMIND blog](https://intermind.com/blog/ai-meeting-assistant-in-the-meeting). I found no product with AI-generated live consensus checks.
- **Anonymous questions to AI in the call:** **not found** in any product checked.
- **Live "already decided" / contradiction cards:** still startup-only (Proactor Insight Stream, ContextGuard, Felarity, from the earlier matrix), plus InterMIND's start-of-meeting recap of previous decisions. Some aggregator articles describe tools that surface prior commitments "before the follow-up call starts" **[U]** — [Liminary](https://liminary.io/articles/ai-meeting-assistants-2026); [Fireflies blog](https://fireflies.ai/blog/best-ai-meeting-assistant).
- **Live Urdu / Roman Urdu captions:**
  - Urdu-script captions and translated captions exist in Meet (paid) **[S]**.
  - **Roman Urdu or code-mixed live captions: not found** anywhere.

### Inferences
- "Ask the AI during the call about past meetings" is commoditized: Otter, Granola, Fathom, Fellow, Gemini and Zoom all have it. "Proactive" in the majors means agenda and time nudges, not evidence pulled from memory.
- The open space is **proactive, evidence-backed push** (the AI interrupts with a quoted past commitment at the moment it becomes relevant) and **anonymity mechanics**.

### Gaps
- I could not fetch the Fathom 3.0 press release, Microsoft Learn Facilitator docs, or Zoom support pages in this pass. Several feature claims rest on snippets or on InterMIND's competitor review, which is a biased source.
- MeetGeek, Supernormal, tl;dv and Bluedot were checked only through aggregator or competitor blogs (mostly Jamie's). A missing live feature there is weak evidence.
- Webex 2026 live features were not re-checked beyond the earlier matrix.

## Q2. Does any product surface a past-meeting promise or decision LIVE during a call?

### Takeaway
**Partially.** InterMIND's Mia (by its own blog) posts previous decisions and open items **at the start** of the session, and Proactor, ContextGuard and Felarity claim live contradiction cards. Otter, Granola, Fathom and Fellow answer such questions only when asked.

I found no product that does what a "Live Promise Ledger" would do: detect *mid-call* that the current topic or speaker matches an open or overdue promise from an earlier meeting, push a card with the exact quote and timestamp ("Ali promised this on 24 Oct: '…'"), and let the owner confirm on the spot.

### Cited Findings
- Mia "posts previous session decisions and open items at start" and auto-notes commitments live **[U, vendor blog]** — [InterMIND blog](https://intermind.com/blog/ai-meeting-assistant-in-the-meeting).
- Proactor's "Insight Stream" triggers on contradictions with past meetings, and ContextGuard shows evidence cards. Both are startups (from the earlier pass) — [Proactor](https://proactor.ai/blog/?p=3369); [ContextGuard](https://discover.vultr.com/contextguard-use-case).
- Otter "Hey Otter" answers questions about past meetings by voice when asked (earlier pass) — [Engadget](https://engadget.com/ai/otterais-meeting-agent-can-schedule-calls-and-write-emails-for-you-130048189.html).
- Granola's chat agent answers "What did we agree on the pricing model last quarter?" with citations, but only on request **[S]** — [Granola help](https://help.granola.ai/article/chatting-with-your-meetings-ask-granola).
- Aggregator copy describes surfacing "what was promised in a previous call **before** the follow-up call starts" **[U]** — [Liminary](https://liminary.io/articles/ai-meeting-assistants-2026). NeuraMeet already has this pre-call case (prep suggestions plus ledger items in `/api/prep`).

### Inferences
- A **mid-call, topic-triggered, quote-evidenced promise card**, tied to an owner-confirm workflow and to Urdu/English code-mixed speech, is defensibly "not found among the products we reviewed". This follows the narrow claim wording already in AGENTS.md.
- It is a natural extension of the Promise Ledger: same `ledger_items`, same pgvector matching, moved from post-meeting to live.
- **Feasibility caveat:** NeuraMeet transcribes *after* the call (Groq Whisper on individual recordings). A live version needs near-real-time text. Options to evaluate in `/architect`:
  - Stream's built-in closed captions / transcription events, if they are on the free tier and support Urdu. Must be verified with the `stream-react` skill.
  - Browser Web Speech API on each client.
  - Chunked audio sent to Groq Whisper every N seconds.
  - Typed or "topic" triggers.

  The demo-safe fallback: trigger the card when the agenda topic or a participant's name is selected, or on a keyword in captions.

### Gaps
- I did not test Proactor, ContextGuard or InterMIND hands-on. Their live behavior is from vendor claims only.
- I did not check whether Stream's free tier provides live captions or transcription events and their language coverage. This is critical for feasibility.

## Q3. Is the anonymous AI devil's advocate still unshipped? New 2025–2026 results?

### Takeaway
**Still unshipped.** No product checked offers anonymous in-call input that an AI voices for you. A new **CSCW 2026** paper (N=96) gives a **negative-leaning result**: the anonymous AI-mediated message (AIMM) condition *lowered* junior members' psychological safety and satisfaction. Openly AI-generated counterarguments (AIGC) improved group atmosphere and satisfaction.

A separate FAccT 2026 study (N=879) found LLM facilitation did not improve consensus and created an **"illusion of inclusion."**

### Cited Findings
- **Lee, Hwang, Kim, Kim, Lee (UNIST), "Investigating LLM-Powered Dissenting Minority Support in Power-Imbalanced Group Decision-Making: Counterargument and Mediation as Intervention Strategies," PACMHCI / CSCW 2026, DOI 10.1145/3816954** **[V, full text]** — [arXiv 2606.31762](https://arxiv.org/html/2606.31762v1)
  - Design: 96 participants in 24 groups of 4 (3 senior "majority" members, 1 junior "minority" member). Conditions: AI-Generated Counterargument (AIGC) vs AI-Mediated Message (AIMM, the anonymous private message paraphrased by the AI) vs a no-AI baseline. GPT-4o in a custom chat environment, with a 20-minute task.
  - **Junior psychological safety:** AIMM M=3.17 (SD 1.53), Baseline 4.25, AIGC 4.08. The AIMM drop is significant (β=−1.40, SE=0.28, p<.001).
  - **Junior satisfaction:** AIMM 2.92, AIGC 4.92, Baseline 3.79.
  - **Engagement:** character count rose in AIMM (708.6 vs 577.6) but was not significant after Bonferroni correction. AIMM also raised juniors' mental and temporal workload.
  - **Limitations:** Korean cultural context, high AI familiarity, role-played hierarchy, short task, and text chat rather than video.
- **Parisi, Thain, Hallak, Tsai, Qian, "Real-Time Group Dynamics with LLM Facilitation: Evidence from a Charity Allocation Task"** (2026; the search snippet says FAccT 2026, Montreal) **[V abstract; venue S]** — [arXiv 2605.14097](https://arxiv.org/abs/2605.14097)
  - N=879 across two studies, with real stakes ($7,200).
  - LLM facilitation "did not significantly improve group consensus" even though participants preferred it, and it shifted allocations by up to 5.5 percentage points.
  - It created an "illusion of inclusion": participants cited inclusivity, yet participation equity did not change.
- Earlier work is already recorded in `novel_feature_research.md`: the IUI'25 poster (2502.06251, no quantitative results) and CHI EA'25 (2503.14263). There is also the IUI 2024 "Enhancing AI-Assisted Group Decision Making through LLM-Powered Devil's Advocate" **[S]** — [ACM DL](https://dl.acm.org/doi/10.1145/3640543.3645199).
- *Speak for Me: Giving LLMs the Situational Awareness to Participate in a Meeting* (2026), a related delegate-participation paper **[S, title only]** — [arXiv 2609.03923](https://arxiv.org/pdf/2609.03923).

### Inferences
- The anonymous devil's advocate is still novel commercially, but the best new evidence says the anonymous-mediation version can **backfire** for the junior member it is meant to help. A viva panel that knows the CSCW 2026 paper could challenge it.
- A version grounded in that evidence would be **AI-generated counterpoints** (AIGC). It would be openly voiced by the AI, optionally seeded by anyone, and not marketed as anonymity protection. That is closer to features that already exist and less distinctive.
- The FAccT result warns against claiming "AI makes meetings more inclusive" without measurement.

### Gaps
- I did not read the remaining 135k characters of the CSCW paper (the discussion and design implications). The writer should not over-generalize beyond the numbers above.
- I found no study of anonymous AI-voiced dissent in **video** calls, as opposed to text chat.

## Q4. Candidate live features: status, research basis, user need, viva demo moment

### Takeaway
The clearest 4-minute demo, and the strongest complement to the Promise Ledger, is **"Live Promise Recall"**: a card pops up mid-call with the past quote and date when a topic or person with an open or overdue promise comes up, and the owner taps Kept / Still open. It reuses all Promise Ledger infrastructure. No reviewed product does it mid-call with quote evidence.

Runner-ups:
- **Live Roman Urdu / code-mixed captions with a bilingual "what was just decided" strip.** This is a local differentiator, but it depends on live STT.
- **AI consensus check.** Not found commercially, and it is a visible moment.

Weak picks:
- The silent-participant nudge exists in niche tools.
- The anonymous devil's advocate now has negative evidence.

### Candidate table
| # | Live feature | Shipping anywhere? | Research basis | User need | Viva demo moment |
|---|---|---|---|---|---|
| 1 | **Live Promise Recall** (mid-call card: "Ali, 24 Oct: 'I'll send the survey by Friday', 3 days overdue" → owner taps Kept, Still open or Reversed) | **Not found mid-call.** Pre-call or start-of-call recaps exist (InterMIND Mia [U]; Zoom prep). Startups (Proactor, ContextGuard) claim live contradiction cards. Otter, Granola and Fathom only answer when asked | Proactive context surfacing (Omakase 2026, 2604.08898); intervention timing (2602.15259); commitment detection (CommitmentBank, PromiseEval), all in the earlier notes | Accountability carries across meetings; avoids "didn't we already agree on this?" | **Strong.** Seed meeting 1, start meeting 2, say "survey", and the card slides in with the quote and timestamp. Owner taps Kept and the ledger updates live |
| 2 | **Live "already decided" alert** (the current utterance matches or contradicts a past decision) | Startup-only claims (Proactor, ContextGuard, Felarity) | Decision Tracker 2022; the earlier matrix | Stops re-litigating settled decisions | Strong, but overlaps with #1. Merge them as one "Live Ledger" feature |
| 3 | **AI consensus check** (AI drafts the decision it thinks it heard, everyone taps Agree / Not yet, and the result is logged to the ledger) | **Not found** (the InterMIND review notes no product documents polls or consensus checks [U]) | FAccT 2026 shows facilitation does not raise consensus by itself, so the check makes agreement *explicit* rather than assumed. That is an inference, not tested | Silent "agreement" that later turns out to be false | Good. One button, a live tally, then a decision written to the ledger with an "agreed by 3/4" tag |
| 4 | **Live code-mixed Urdu/English captions + Roman Urdu toggle** | Urdu-script captions and translated captions exist in Meet (paid) [S]. Roman Urdu or code-mixed live captions **not found** | WER We Stand (2409.11252): code-switching is still an open problem | Pakistani teams speak mixed Urdu and English; script captions are unreadable for many | Good visually, but risky. Accuracy on live code-mixed speech is untested and needs a live STT path |
| 5 | **Silent-participant inclusion prompt** (private host nudge: "Sara hasn't spoken in 15 min") | **Exists in niche tools** (Raddle on Webex [S]; Equal Time [U]; Read.ai live coaching). Teams @-mentions *absent* people only | MeetingCoach (CHI 2021); FAccT 2026 "illusion of inclusion" warning | Inclusion in hierarchical teams | Easy to demo but not unique. Also overlaps with NeuraMeet's per-speaker engagement insights |
| 6 | **Anonymous AI devil's advocate** | **Not found commercially** | IUI'25 poster; **CSCW 2026 (N=96): the anonymous mediation version lowered junior safety and satisfaction** | Dissent in hierarchical groups | Memorable, but the panel could cite the negative result. If built, use the openly AI-generated counterpoint version |
| 7 | **Ambient goal-drift meter** | Partly shipped (Teams and Zoom agenda nudges); a similarity-based drift meter was not seen | CHI'25 "Are We On Track?" (passive feedback works) | Off-topic meetings | Moderate. A bar going green → red is subtle on screen |
| 8 | **Live unanswered-question tracker** | InterMIND Mia "surfaces unanswered questions" [U]. Otherwise not found | No dedicated paper (inference) | Questions get lost | Moderate. It is partly shipped by InterMIND |

### Inferences
- **Recommendation for the writer:** frame the second signature feature as **"Live Ledger": Promise Ledger goes live.** It combines #1, #2 and #3: proactive promise recall plus "already decided" alerts during the call, and a one-tap consensus check that writes new decisions straight into the ledger.
  - This complements the post-meeting Promise Ledger and makes one coherent story: "it remembers, it reminds you live, and it makes agreement explicit."
  - The claim stays narrow: "none of the major platforms or notetakers we reviewed push a past promise with its quote mid-call and let the owner confirm it on the spot."
- **Viva demo clarity ranking:** #1 > #3 > #4 > #6 > #5 > #7 > #8.
- **Biggest technical risk:** live transcription. A typed or agenda-topic trigger is a safe fallback for the demo, and a "Check ledger now" button could serve as a manual trigger.

### Gaps
- Whether Stream Video's free tier offers live closed captions or transcription (and Urdu support) was **not checked**. It decides #1, #2 and #4 and must be verified via the `stream-react` skill.
- I found no user study on proactive mid-call memory cards in meetings specifically. Omakase is research-project context, so the benefit is inferred.
- The InterMIND claims come from its own marketing. A hands-on check of Mia's free tier would firm up the "not mid-call" distinction.
