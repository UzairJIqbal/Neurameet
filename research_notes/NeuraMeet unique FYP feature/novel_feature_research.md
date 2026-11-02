# Novel, Research-Backed AI Meeting Features for NeuraMeet (FYP)

Scope note: about 15 tool calls of web research (Oct 2026). Every claim below has a source link. Where I saw only a search snippet and did not open the paper, it is marked "(snippet)". Commercial status comes from what I could verify; "not found" means I found no shipping product in this pass, not proof that none exists.

## Q1. What do 2022–2026 CHI/CSCW/ACL/IUI papers propose for meetings?

### Takeaway
Research has moved past "summarize this meeting" toward (a) memory across meetings (decisions, goals, commitments), (b) feedback on the meeting process (goal alignment, turn-taking, inclusion), and (c) agents that take part in the meeting (delegates, devil's advocates, facilitators). Most of these exist only as probes or benchmarks, not as products.

### Cited Findings
**Cross-meeting memory and decisions**
- *Meeting Decision Tracker: Making Meeting Minutes with De-Contextualized Utterances* (2022, Cinnamon AI). It pipelines a Decision Utterance Detector (DUD) and a Decision Utterance Rewriter (DUR), which rewrites each decision so it can be read without the rest of the meeting. The stated goal is "extensive tracking of past discussions." — [arXiv 2210.11374](https://arxiv.org/pdf/2210.11374)
- *Summaries, Highlights, and Action items: Design, implementation and evaluation of an LLM-powered meeting recap system* (CSCW 2024, Microsoft). It compares recap types and finds both are valuable in different contexts. This is close to NeuraMeet's existing baseline. — [arXiv 2307.15793](https://arxiv.org/abs/2307.15793)
- *Towards Group Decision Support with LLM-based Meeting Analysis* (TU Graz). It uses LLMs to track how decisions develop across meeting transcripts (snippet). — [TU Graz](https://tugraz.elsevierpure.com/en/publications/towards-group-decision-support-with-llm-based-meeting-analysis/)
- The idea of contradiction or supersession detection shows up mainly in practitioner and hackathon tools, not peer-reviewed work. Examples: a "Decision Logger" skill with conflict types "resurface, topic contradiction, owner conflict" at a 70% similarity threshold, and a hackathon project, "Memoria". — [Decision Logger](https://skillselion.com/skills/borghei/claude-skills/decision-logger); [Memoria (lablab.ai)](https://lablab.ai/submissions/n3w5zei6scg74a0xkld5hip6)

**Goal and agenda alignment during the meeting**
- *Are We On Track? AI-Assisted Active and Passive Goal Reflection During Meetings* (Chen et al., CHI 2025, Microsoft Research). A technology probe with 15 knowledge workers using their real meeting data. It compared an Ambient Visualization probe (passive goal-alignment feedback) with an Interactive Questioning probe (active nudges). Passive feedback kept people focused without interrupting. Active nudges triggered reflection right away but risked breaking the conversation flow. Participants named goal clarification as the core value. — [arXiv 2504.01082](https://arxiv.org/pdf/2504.01082); [MSR](https://www.microsoft.com/en-us/research/?p=1134757)
- *Nudging Attention to Workplace Meeting Goals: A Large-Scale, Preregistered Field Experiment* (Tankelevitch, Scott, Challakere, Panda, Rintel, 2026). 361 employees, 7,196 meetings, 2 weeks. Pre-meeting goal surveys did **not** significantly change meeting effectiveness. Self-reported awareness and behaviour improved in **both** groups, and the post-meeting survey itself seemed to act as an intervention. — [arXiv 2602.16939](https://arxiv.org/abs/2602.16939)

**Turn-taking, inclusion, effectiveness**
- *MeetingCoach* (CHI 2021, Microsoft; just before the 2022 window). A survey (N=120) identified turn-taking and sentiment as key signals, followed by a 4-week longitudinal study with 8 teams. Participants became more aware of group dynamics. — [MSR PDF](https://microsoft.com/en-us/research/uploads/prod/2021/01/MeetingCoach_CHI2021_cameraready.pdf)
- Margariti et al., CHI 2022 LBW. A scalable automatic process that categorizes turn-taking patterns from remote-meeting transcripts. A related Microsoft paper maps "competitive vs collaborative overlapping talk" (snippet). — [CHI22 LBW PDF](https://www.microsoft.com/en-us/research/uploads/prod/2022/03/Margariti-CHI22-LBW-CameraReady.pdf); [Overlapping talk](https://microsoft.com/en-us/research/?p=826696)
- *Meeting effectiveness and inclusiveness: large-scale measurement, identification of key features, and prediction in real-world remote meetings* (Hosseinkashi, Tankelevitch, Pool, Cutler, Madan, 2023/2024). It links in-platform effectiveness and inclusiveness surveys to objective call telemetry and builds a model that predicts both from objective features alone. — [arXiv 2304.00652](https://arxiv.org/abs/2304.00652)

**Agents that take part in the meeting**
- *MEETING DELEGATE: Benchmarking LLMs on Attending Meetings on Our Behalf* (Microsoft, Feb 2025; also HCI+NLP workshop 2025). Built from real transcripts. About 60% of delegate responses cover at least one ground-truth key point. Gemini 1.5 Pro is more cautious; Gemini 1.5 Flash and Llama3 are more active. Problems include irrelevant or repetitive output and sensitivity to ASR errors. — [arXiv 2502.04376](https://arxiv.org/html/2502.04376v1)
- *Amplifying Minority Voices: AI-Mediated Devil's Advocate System for Inclusive Group Decision-Making* (Lee et al., IUI 2025 poster). Members privately send a dissenting opinion. An LLM devil's-advocate agent paraphrases it and presents it as its own, which keeps the author anonymous and aims at psychological safety. It uses multiple agents (summary, conversation, duplicate-checker, paraphrase). **No quantitative results** in this poster. — [arXiv 2502.06251](https://arxiv.org/abs/2502.06251)
- *Conversational Agents as Catalysts for Critical Thinking: Challenging Social Influence in Group Decision-making* (CHI EA 2025). A companion LLM devil's-advocate study (snippet). — [arXiv 2503.14263](https://arxiv.org/pdf/2503.14263)
- *LLM-Based Bot Broadens the Range of Arguments in Online Discussions, Even When Transparently Disclosed as AI* (2025, snippet title). — [arXiv 2506.17073](https://arxiv.org/html/2506.17073v1)

**Argument and consensus mapping**
- The BCause transcript viewer uses LLM argument mining to highlight claims and premises in meeting transcripts and their relations. LLMs can produce simplified IBIS (Issue-Based Information System) argument maps from transcripts (snippet). — [arXiv 2603.16260](https://arxiv.org/pdf/2603.16260)
- TU Delft thesis work on extracting values, value tensions, and points of agreement from deliberation transcripts. — [TU Delft](https://repository.tudelft.nl/record/uuid:6a50ff22-02d2-428c-9bc2-28d85a4ca04f)
- *Guided Sensemaking: Agents in Collaborative Deliberation* (CHI 2026 Tools for Thought workshop). Conceptual only, with no user study. It surfaces thematic clusters and points of disagreement. — [arXiv 2606.02260](https://arxiv.org/abs/2606.02260)

**Proactive context surfacing**
- *Omakase* (2026). A proactive assistant for evolving research projects (N=42 across a probe and an iterative prototype). Proactive, context-sensitive suggestions improved actionability and relevance and lowered cognitive load. It is not meeting-specific, but the method transfers. — [arXiv 2604.08898](https://arxiv.org/pdf/2604.08898)
- *Knowing Isn't Understanding* (2026). Argues that proactive agents need principled rules for when to intervene. — [arXiv 2602.15259](https://arxiv.org/html/2602.15259v1)

**Commitments**
- CommitmentBank (naturally occurring discourse annotated for speaker commitment). State-of-the-art models perform poorly on it. SemEval-2025 PromiseEval checks promises against evidence in the ESG domain (snippet). — [SemEval-2025 paper](https://preview.aclanthology.org/transition-to-people-yaml/2025.semeval-1.225.pdf)
- The claim that "63% of verbal commitments made in meetings are never documented" came from a non-academic skill page with no traceable study. **Do not cite it.** — [skills.sh page](https://skills.sh/sixtysecondsapp/use60/meeting-digest-truth-extractor)

**Urdu / code-switched speech (relevant because NeuraMeet uses EN+UR Whisper)**
- *WER We Stand: Benchmarking Urdu ASR Models* (2024). Compares Whisper, MMS, and Seamless-M4T on Urdu read and conversational speech. whisper-large is best on conversational speech. The paper names code-switching, disfluency, and overlap as open problems. — [arXiv 2409.11252](https://arxiv.org/pdf/2409.11252)
- *Assessing the Feasibility of Lightweight Whisper Models for Low-Resource Urdu Transcription* (2025). — [arXiv 2508.09865](https://arxiv.org/abs/2508.09865v1)
- A search snippet reported that Whisper-large-v3 transliterates or translates English into Urdu script on code-switched audio, and that a fine-tuned model reached WER ~0.35 on 1,000 Urdu-English code-switch clips. I could not confirm which paper this comes from; it may be [arXiv 2605.17846](https://arxiv.org/pdf/2605.17846). Verify before citing.

### Inferences
- The richest research areas that are still unproductized are **memory across meetings** (decision, commitment, and contradiction tracking) and **dissent and inclusion mechanisms** (anonymous devil's advocate). Both can be built as LLM-over-transcript pipelines, which fits NeuraMeet's Gemini/Groq + pgvector stack.

### Gaps
- I did not reach ACL/EMNLP/Interspeech 2024–26 papers on meeting knowledge graphs, multimodal gaze/emotion feedback, or psychological-safety detection from speech. Those need a follow-up search.
- I did not cover YC or Product Hunt 2024–26 meeting-AI startup launches systematically.

## Q2. Which have experimental evidence of benefit?

### Takeaway
The evidence is modest and mostly qualitative. The strongest results are probe studies showing awareness and focus gains (MeetingCoach, Are We On Track). The best-powered field experiment (N=361) found **no significant effectiveness gain** from goal nudges. Devil's-advocate and argument-mapping systems mostly lack outcome data so far.

### Cited Findings
- Awareness of group dynamics increased over a 4-week, 8-team deployment of an inclusion dashboard. — [MeetingCoach](https://microsoft.com/en-us/research/uploads/prod/2021/01/MeetingCoach_CHI2021_cameraready.pdf)
- Passive ambient goal-alignment feedback helped focus without disruption, and active questioning risked disruption (N=15, qualitative). — [arXiv 2504.01082](https://arxiv.org/pdf/2504.01082)
- Pre-meeting goal nudges had no significant effect on effectiveness (N=361 people, 7,196 meetings, preregistered). — [arXiv 2602.16939](https://arxiv.org/abs/2602.16939)
- An LLM delegate covered at least one key point in about 60% of responses. This is promising, but the authors say it is not ready to deploy. — [arXiv 2502.04376](https://arxiv.org/html/2502.04376v1)
- Proactive context-aware suggestions improved relevance and lowered cognitive load (N=42, research-project domain). — [Omakase](https://arxiv.org/pdf/2604.08898)
- The minority-voice devil's advocate has no quantitative results yet (IUI'25 poster). — [arXiv 2502.06251](https://arxiv.org/abs/2502.06251)

### Inferences
- For the FYP panel, frame features as "implementing and evaluating a mechanism proposed in [paper]." Running a small within-subjects evaluation (for example, 5–8 classmates) would itself be a research contribution, because most of these ideas lack outcome data.

### Gaps
- I found no controlled study of cross-meeting contradiction or decision-reversal detection. The idea appears untested academically, which makes it both novel and risky.

## Q3. Which are still absent from commercial tools?

### Takeaway
Real-time agenda tracking, talk-time analytics, sentiment, and live speaker coaching are **already commercial**, so they are not novel. Cross-meeting decision contradiction detection, commitment-vs-fulfilment tracking, anonymous AI devil's advocate, argument/consensus maps, and code-switch-aware bilingual meeting intelligence appear **absent from mainstream tools** in this pass.

### Cited Findings
- **Already shipped (avoid as the standout):** The Microsoft Teams Facilitator agent is generally available for Copilot-licensed users. It provides an agenda timer with time allocations, topic-start markers, live collaborative notes, task tracking with Planner, and Q&A. — [Microsoft Support](https://support.microsoft.com/en-US/teams/copilot/facilitator-in-microsoft-teams-meetings); [Tech Community](https://techcommunity.microsoft.com/blog/microsoft365insiderblog/keep-meetings-focused-and-productive-with-facilitator-in-teams/4456029)
- **Already shipped:** Read.ai offers live on-screen coaching on pace, filler words, sentiment, and engagement, plus talk-to-listen ratio. Fireflies offers talk-time % and sentiment after the meeting (Pro plan). — [Fireflies vs Read AI](https://fireflies.ai/blog/fireflies-vs-read-ai/); [ZoomInfo breakdown](https://pipeline.zoominfo.com/sales/read-ai-features)
- **Emerging, not mainstream:** "decision drift" tracking across meetings is described by a small vendor blog (upmeet.ai; the page returned 404 when fetched, so it is unverified). There are also "organizational memory" betas such as mem0. — [upmeet search result](https://www.upmeet.ai/en/blog/meeting-ai-is-starting-to-track-decision-drift); [mem0 org memory](https://mem0.ai/organizational-memory)

### Inferences
- NeuraMeet's existing "per-speaker engagement insights" overlap with Read.ai and Fireflies, so the panel will have seen that kind of feature. The standout should be about **reasoning across meetings** or **group process**, not per-meeting analytics.

### Gaps
- I did not verify Gong, Otter, or Fathom feature lists for commitment or contradiction features. Gong likely has deal-level "next steps" tracking. Check this before claiming "no product does this."

## Q4. Candidate features (13) and demo-able versions of the top 5

### Takeaway
**Top recommendation: "Decision Ledger with Contradiction & Reversal Alerts"**, combined with **"Commitment Keeper"** (broken-promise detection). Both reuse pgvector, Gemini/Groq, action items, and follow-ups. The runner-up for originality is the **"Anonymous AI Devil's Advocate."**

### Candidate list
| # | Feature | Technique | Research grounding | Commercial status |
|---|---|---|---|---|
| 1 | **Decision Ledger + Contradiction/Reversal detection** | LLM decision extraction plus de-contextualized rewrite ([2210.11374](https://arxiv.org/pdf/2210.11374)); embed decisions in pgvector; on each new meeting, run nearest-neighbour search plus an LLM NLI-style judge (supports / contradicts / supersedes) | Decision Tracker 2022; TU Graz group decision support | Not mainstream; only practitioner/hackathon tools ([Decision Logger](https://skillselion.com/skills/borghei/claude-skills/decision-logger)) |
| 2 | **Commitment Keeper (broken-promise detection)** | Classify commissive utterances ("I'll send X by Friday"), then check later transcripts for fulfilment evidence, as in the PromiseEval task | CommitmentBank / SemEval-2025 PromiseEval ([paper](https://preview.aclanthology.org/transition-to-people-yaml/2025.semeval-1.225.pdf)) | Action items are everywhere; automatic fulfilment verification across meetings was not found |
| 3 | **Anonymous AI Devil's Advocate** | A participant privately sends dissent; an LLM paraphrases it and voices it as the AI's own in chat | [IUI'25 2502.06251](https://arxiv.org/abs/2502.06251); [CHI EA'25 2503.14263](https://arxiv.org/pdf/2503.14263) | Not found in Zoom/Meet/Teams/Otter/Fireflies |
| 4 | **Ambient "Are We On Track?" goal-alignment meter** | Rolling-window embedding similarity between live transcript and stated goal or agenda | [CHI'25 2504.01082](https://arxiv.org/pdf/2504.01082) | Partly shipped (Teams Facilitator agenda timer); goal-similarity drift meter not seen |
| 5 | **Argument / consensus map** | LLM argument mining into an IBIS graph (issues, positions, pro/con) with an agreement heat per issue | BCause ([2603.16260](https://arxiv.org/pdf/2603.16260)); TU Delft value tensions | Not found commercially |
| 6 | **Meeting Delegate ("send my AI")** | RAG over the user's past meetings and notes answers questions on their behalf in chat | [2502.04376](https://arxiv.org/html/2502.04376v1) | Research only; ~60% key-point coverage |
| 7 | **Proactive past-context cards** | During the live meeting, retrieve related past decisions or commitments when a topic recurs | [Omakase](https://arxiv.org/pdf/2604.08898); [2602.15259](https://arxiv.org/html/2602.15259v1) | Partly available in Copilot-style Q&A; proactive push rare |
| 8 | **Turn-taking fairness & interruption map** | Classify overlaps as competitive or collaborative; Gini of talk time; "unheard voices" list | [CHI22 LBW](https://www.microsoft.com/en-us/research/uploads/prod/2022/03/Margariti-CHI22-LBW-CameraReady.pdf); [MeetingCoach](https://microsoft.com/en-us/research/uploads/prod/2021/01/MeetingCoach_CHI2021_cameraready.pdf) | Talk-time shipped (Read.ai, Fireflies); competitive-interruption classification not seen |
| 9 | **Meeting effectiveness predictor** | Predict effectiveness and inclusiveness from objective features (attendance, talk share, durations), calibrated with a one-tap post-meeting survey | [2304.00652](https://arxiv.org/abs/2304.00652); survey-as-intervention in [2602.16939](https://arxiv.org/abs/2602.16939) | Read.ai has a "meeting score"; research-calibrated version not seen |
| 10 | **Code-switch-aware bilingual intelligence (Urdu/English)** | Keep the original code-switched text, and produce parallel English plus Roman-Urdu summaries | [2409.11252](https://arxiv.org/pdf/2409.11252); [2508.09865](https://arxiv.org/abs/2508.09865v1) | Mainstream tools have weak Urdu support; a strong local differentiator |
| 11 | **Unresolved-question tracker** | Detect questions asked but not answered, and carry them into the next meeting's prep | Builds on decision and argument mining above (no dedicated paper found; inference) | Not found |
| 12 | **Value-tension / disagreement summary** | LLM extracts the values behind positions and where they conflict | [TU Delft](https://repository.tudelft.nl/record/uuid:6a50ff22-02d2-428c-9bc2-28d85a4ca04f); [2606.02260](https://arxiv.org/abs/2606.02260) | Not found |
| 13 | **Post-meeting micro-reflection loop** | A one-question survey in NeuraMeet after each call feeds the predictor in #9 | [2602.16939](https://arxiv.org/abs/2602.16939) found the survey itself raised awareness | Simple; Zoom/Teams have generic call-quality ratings only |

### Demo scripts (3–5 min) for the top 5
1. **Decision Ledger + Contradiction Alert.** Meeting 1 (seeded): "We'll launch on Vercel, no paid tier." Meeting 2 (live or uploaded): "Let's move to AWS paid." After processing, a red "Reverses decision from Meeting 1 (date, speaker)" card appears with both quotes side by side and a "Mark superseded / Keep both" button. The ledger timeline shows each decision's history.
2. **Commitment Keeper.** Meeting 1: "Ali: I'll share the survey results by Friday." Meeting 2 has no mention of it, so the Follow-ups page shows "Unfulfilled commitment, Ali, 7 days overdue, no evidence in 2 later meetings." Meeting 3 contains "Ali: I sent the survey," and it flips to "Fulfilled (evidence: quote, timestamp)."
3. **Anonymous Devil's Advocate.** During a live Stream call, a junior member clicks "Raise concern anonymously" and types it. The AI posts in call chat: "Devil's advocate: has anyone considered that X…?" After the call, the panel sees that the summary credits the concern to "AI (anonymous)."
4. **Ambient goal meter.** Set the goal "Pick the FYP demo feature." A live bar turns green, then amber, then red as the talk drifts off-topic, using rolling embedding similarity on transcript chunks. There are no pop-ups, following the CHI'25 finding that passive feedback is less disruptive.
5. **Consensus map.** After a debate meeting, show an IBIS graph: issue nodes, position nodes, pro/con edges, and the speaker on each position, with issues coloured by agreement level.

### Inferences
- Feasibility on NeuraMeet's zero-cost stack: features 1, 2, 5, 11, and 12 run after processing on transcripts that already exist (Gemini/Groq + pgvector), with no new provider. Features 3 and 4 need live transcription or a chat channel. Stream call chat or custom events work for #3. #4 needs near-real-time transcription, which the current post-call Groq Whisper pipeline may not support. Flag this for `/architect`.
- Recommended framing for the panel is a pitch along the lines of "NeuraMeet remembers what your team decided and promised, and tells you when you contradict yourselves." That combines #1 and #2 into one "Organizational Memory" feature, cites Decision Tracker 2022, CommitmentBank / PromiseEval, and Hosseinkashi 2023, and could include a small user evaluation.

### Gaps
- I did not measure LLM accuracy on contradiction detection in meeting transcripts. A precision check on a hand-made test set is recommended.
- I did not confirm free-tier rate limits for running pairwise decision comparisons across many meetings. Top-k retrieval should keep this small, but it is untested.
