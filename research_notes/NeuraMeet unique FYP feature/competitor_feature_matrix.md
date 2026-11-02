# Competitor AI Feature Matrix for Meeting Platforms and AI Notetakers (as of Oct 2026)

Research date: 2026-10-30. Legend: **FULL** = fully exists and shipped; **PARTIAL** = exists in a limited form, in preview, or only from a niche/startup vendor; **NOT FOUND** = no reliable source found in this pass (absence of evidence, not proof). Source quality: vendor pages and Microsoft message-center mirrors are primary. summarizemeeting.com, *.pages.dev, lovable.app and similar SEO comparison sites are low-trust aggregators, used only where flagged.

## Q1. What AI features do Zoom, Google Meet, Microsoft Teams and Webex offer today?

### Takeaway
All four big platforms now ship summaries, action items, in-meeting Q&A and catch-up, and real-time translation. Zoom and Teams also have agentic and agenda features: Zoom has meeting prep, "free up my time" meeting-skip suggestions, cross-app retrieval and photorealistic avatars, and Teams has the Facilitator agenda timer and the Interpreter agent. Almost all of this sits behind a paid tier: Zoom paid Workplace or the add-on, Google AI Pro/Ultra or Workspace, a Microsoft 365 Copilot license, or paid Webex.

### Cited Findings
**Zoom (AI Companion 3.0, announced Dec 2025, features rolled out Sep 2025 to Mar 2026)**
- AI note-taking works across in-person meetings, Microsoft Teams and Google Meet (Sep 2025), with Webex support "forthcoming". — [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/)
- "Agentic retrieval" searches Zoom Workplace plus Google and Microsoft platforms (Nov 2025). A "deep research" skill works over conversations, internal docs, knowledge bases and the web (Oct 2025). — [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/)
- Meeting prep with proactive prompts about agendas and action items (Oct 2025). Proactive recommendations for agenda tracking and decisions (Nov 2025). — [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/)
- A **"Free up my time"** feature suggests meetings to skip (Oct 2025). This partly covers "should this meeting have happened?" analysis. — [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/)
- Agentic scheduling across time zones, a Tasks integration, the Zoomie group assistant across Rooms, Meetings and Chat (Dec 2025), and in-office room optimization nudges. — [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/); [ChannelLife](https://channellife.co.nz/story/zoom-expands-agentic-ai-to-automate-workplace-tasks)
- Photorealistic avatars that mimic a live video feed (Dec 2025), plus real-time voice translation (Dec 2025). — [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/)
- Custom AI avatars for Zoom Clips (record yourself once, then the AI generates video messages) came through the Custom AI Companion add-on at US$12/month. Zoom's CEO has publicly described a "digital twin" that attends meetings for you as a future vision (reported Oct 2024). — [FMT/Bloomberg-syndicated, Oct 2024](https://www.freemalaysiatoday.com/category/leisure/2024/10/11/ai-avatars-could-soon-attend-zoom-meetings-on-your-behalf); [Decrypt](https://decrypt.co/285732/your-lifelike-zoom-clone-may-soon-be-taking-meetings-for-you-heres-how)
- AI Companion 3.0 is offered as a standalone subscription at $10/month. Most features are included in paid Zoom Workplace, and some are add-on-only. — [Constellation Research](https://www.constellationr.com/insights/news/zoom-launches-ai-companion-30-bevy-cx-tools); [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/)

**Google Meet (Gemini)**
- "Take notes for me" writes a summary with action items and emails the notes through Gmail. A July 2026 update added an option to take notes automatically only in meetings with 3 or more people. In-person note-taking mode also exists. — [Google Blog](https://blog.google/products-and-platforms/products/workspace/take-notes-for-me/); [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/11419/google-meet-take-notes-in-person-meetings)
- Speech translation (dubbed audio that keeps the speaker's tone and cadence) reached GA on the web on Jan 27, 2026 and on Android/iOS on Apr 8, 2026. It later expanded to 63 languages with auto-detection, replacing the fixed one-language-pair setup. — [Workspace Updates](https://workspaceupdates.googleblog.com/2026/02/speech-translation-meet-ga.html?hl=uk_GB); [LetsDataScience](https://letsdatascience.com/news/google-meet-expands-gemini-speech-translation-to-63-language-32d79be4)
- Gemini also does translated captions and answers private questions during the call. — [Google Workspace AI for meetings](https://workspace.google.com/intl/en_nz/resources/ai-for-meetings/)
- Tier: Google AI Pro/Ultra subscribers and eligible Workspace editions only (paid). — [LetsDataScience](https://letsdatascience.com/news/google-meet-expands-gemini-speech-translation-to-63-language-32d79be4)

**Microsoft Teams (Copilot and agents)**
- **Facilitator agent** (GA for Microsoft 365 Copilot-licensed users): creates and surfaces agendas, shows an **agenda timer with time allocations**, marks when each topic starts, asks for meeting goals if no agenda is detected, takes real-time notes, captures decisions, creates follow-ups (Planner/Loop/Word), and "pressure-tests discussion points". It is also coming to Teams Rooms. — [Microsoft Support](https://support.microsoft.com/en-US/teams/copilot/facilitator-in-microsoft-teams-meetings); [Microsoft Tech Community](https://techcommunity.microsoft.com/blog/microsoft365insiderblog/keep-meetings-focused-and-productive-with-facilitator-in-teams/4456029); [M365 Admin (handsontek)](https://m365admin.handsontek.net/?p=16419)
- **Interpreter agent**: real-time speech-to-speech interpretation in up to 9 languages, with voice and tone replication. It was extended to 1:1/group calls from Jan 2026, and a consecutive (turn-by-turn) interpretation mode arrived in May 2026. Requires a Microsoft 365 Copilot license. — [UC Today](https://www.uctoday.com/collaboration/the-microsoft-teams-interpreter-agent-how-will-it-impact-the-future-of-work/); [Topedia, May 2026](https://blog-en.topedia.com/2026/05/interpreter-agent-in-teams-now-supports-a-new-consecutive-interpretation-mode/); [mc.merill.net MC1191612 mirror](https://pupuweb.com/mc1191612-interpreter-agent-in-teams-calls)
- **Sign language**: Teams has a Sign Language Mode (role-aware, higher-fidelity video for signers and interpreters), and a pop-out interpreter video window is scheduled for Dec 2026. These features prioritise the video of human interpreters. No AI sign translation was found. — [mc.merill.net RM571387](https://mc.merill.net/message/RM571387); [Windows Report](https://windowsreport.com/microsoft-teams-to-soon-make-meetings-more-accessible-with-persistent-pop-out-interpreter-video/)

**Webex (Cisco AI Assistant)**
- In-meeting catch-up ("what you missed"), alerts when your name is mentioned, action-item summaries and Q&A about the meeting. — [KAUST IT](https://it.kaust.edu.sa/about/insideit/2025/08/13/meet-your-webex-ai-assistant); [Webex Help](https://help.webex.com/en-us/article/ne2xaqq/Cisco-AI-Assistant-for-Webex-Suite)
- Real-time translation from English into 30+ languages for live events, plus message translation. WebexOne 2026 announced AI Notes for impromptu discussions, enhanced multi-language captions and AI voice isolation. — [BT Business](https://business.bt.com/digital-workplace/cloud-collaboration/webex-meetings); [Techzine](https://www.techzine.eu/news/collaboration/135091/cisco-webex-gets-more-agentic-ai-for-collaboration-and-contact-centers)

### Inferences
- Late-joiner catch-up is **FULL** on Webex and Google Meet (ask Gemini privately) and is broadly available on Zoom and Teams Copilot. It is commoditized and not a viable unique feature.
- Real-time agenda and time-keeping coaching is **FULL** (Teams Facilitator, and Zoom's agenda tracking recommendations).
- Speech translation with voice cloning is **FULL** on Meet, Teams and Zoom. None of the sources lists Urdu among the Teams Interpreter's 9 languages, and Urdu was not confirmed for Meet's 63 either.

### Gaps
- I could not confirm whether Urdu is among Google Meet's 63 speech-translation languages, or which 9 languages Teams Interpreter supports. The vendor language lists were not fetched.
- I did not verify exact Zoom free-tier AI inclusion in 2026. Historically, AI Companion was paid-plan only, but this was not re-verified.
- I did not verify any Teams Copilot "Recap" changes in 2026.

## Q2. What do the AI notetakers offer?

### Takeaway
Otter has a live voice agent ("Hey Otter") that answers from your company's meeting history and creates tasks. Read.ai owns engagement, sentiment, talk-time and bias/inclusion coaching. Fireflies supports Urdu and mixed-language meetings. Fathom and tl;dv have the most generous free tiers. Cross-meeting action-item tracking is standard (Otter "My Action Items", Fellow, Circleback, Proactor).

### Cited Findings
- **Otter Meeting Agent** (launched Mar 2025): voice-activated with "Hey Otter". It answers questions about the current meeting, past meetings and workspace content, creates action items by voice, schedules follow-up calls and drafts emails. It started on Zoom, with Teams and Meet to follow. Otter also has sales and other agents, and passed $100M ARR. — [BusinessWire](https://www.businesswire.com/news/home/20250325249430/en/Otter.ai-Breaks-$100M-ARR-Barrier-and-Transforms-Business-Meetings-Launching-Industry-First-AI-Meeting-Agent-Suite); [Engadget](https://engadget.com/ai/otterais-meeting-agent-can-schedule-calls-and-write-emails-for-you-130048189.html); [UC Today](https://www.uctoday.com/collaboration/otter-revolutionises-meetings-with-ai-agent-that-speaks-up-during-calls/)
- Otter's "My Action Items" tracks action items across all your meetings. — [SalesTechStar](https://salestechstar.com/?p=238379)
- **Read.ai**: the Read Score combines sentiment and engagement, using video facial cues plus audio pitch, volume and intonation. It tracks per-participant talk time and flags one-sided conversations. Speaker Coach covers inclusion (talk-to-listen ratio, balance), impact (charisma, **bias indicators**) and trends over time. — [Read.ai Support](https://support.read.ai/hc/en-us/articles/4406653674003-About-Sentiment-Engagement-and-the-Read-Score); [Read.ai AI Meeting Coach](https://www.read.ai/articles/ai-meeting-coach); [ZoomInfo](https://pipeline.zoominfo.com/sales/read-ai-features)
- **Fireflies**: 100+ languages, explicitly including **Urdu ("ur")**, Hindi, and **"Hindi (Latin)" ("hi-Latn")**, which is romanized Hindi. **Multi-Language Mode** transcribes 60+ languages within one meeting "where speakers switch languages". There is no explicit mention of Hinglish or Roman Urdu. Fireflies also markets a "Conflict Detector" skill (HR). — [Fireflies Guide](https://guide.fireflies.ai/articles/2973706448-learn-about-fireflies-supported-languages); [Fireflies skills](https://fireflies.ai/skills/hr/conflict-detector)
- **Free tiers (aggregator data, moderate trust)**: Fathom gives unlimited recording and storage free (one source says only 5 AI summaries a month free). tl;dv gives unlimited recording with 3-month storage and 10 summaries a month. Otter gives 300 min/month, Read.ai 5 meetings/month, and Granola 25 meetings total. — [Fabric comparison](https://fabric.so/comparison/best-free-ai-note-taker); [TechRepublic 2026](https://www.techrepublic.com/article/news-best-ai-meeting-note-takers-2026/); [Granola blog](https://www.granola.ai/blog/meeting-note-tool-pricing-granola-vs-fireflies-fathom-otter)
- Granola is known for bot-free capture ("staying invisible"). — [Fabric comparison](https://fabric.so/comparison/best-free-ai-note-taker)

### Inferences
- Engagement, sentiment, talk-time fairness and bias nudges are **FULL** (Read.ai), so NeuraMeet's per-speaker engagement insights are not unique.
- A voice-commanded in-call assistant is **FULL** (Otter "Hey Otter"; Zoom's Zoomie is partial).
- Urdu transcription is **FULL** (Fireflies). Code-switched transcription in one meeting is **FULL** (Fireflies Multi-Language Mode). Roman-Urdu output and Urdu-English code-mixed summaries are **NOT FOUND** as an explicit feature from any major vendor.

### Gaps
- I did not research Krisp, Granola's AI features beyond bot-free capture, Fellow, Avoma, Gong/Chorus, Supernormal, MeetGeek, Bluedot or Jamie individually, because of the tool-call budget. General knowledge says Gong/Chorus do deal-level conversation intelligence, but it was not re-verified for 2026, so the writer should not treat it as sourced.
- I did not verify current Fireflies, Otter or Read.ai paid-tier pricing.

## Q3. Specific capability check (gap analysis)

### Takeaway
Most "novel-sounding" ideas already exist somewhere. The thinnest coverage is in: (a) **live contradiction and "you already discussed or decided this" alerts against past meetings** (only startups and hackathon-grade tools, none of the majors); (b) **Urdu / Roman Urdu / Urdu-English code-mixed summaries and outputs**, which exists only as a research project in Pakistan; and (c) **AI sign-language output**, which exists only as niche startups or research.

### Cited Findings
| Capability | Status | Who / tier | Source |
|---|---|---|---|
| Cross-meeting action-item tracking and accountability | FULL | Otter (My Action Items), Fellow, Circleback, Mem. Mostly paid tiers for team features | [SalesTechStar](https://salestechstar.com/?p=238379); [Fellow blog](https://fellow.ai/blog/how-to-manage-meeting-tasks-and-action-items/); [Circleback](https://circleback.ai/how-to/track-meeting-action-items) |
| Cross-meeting decision tracking and contradiction detection (post-hoc memory) | PARTIAL | Sentra flags when a new decision reverses an old one (startup) | [Sentra](https://www.sentra.app/articles/ai-meeting-memory) |
| Live in-meeting "contradicts past meeting" / fact-check alerts | PARTIAL (startups only) | Proactor AI "Insight Stream" triggers on contradictions to past meetings. ContextGuard shows evidence cards when a statement conflicts with company knowledge. Felarity flags within-session contradictions. None from Zoom, Meet, Teams, Webex, Otter or Fireflies | [Proactor](https://proactor.ai/blog/?p=3369); [ContextGuard/Vultr](https://discover.vultr.com/contextguard-use-case); [Felarity](https://felarity-com.pages.dev/product/) |
| Real-time agenda and time-keeping coaching | FULL | Teams Facilitator (Copilot license, paid). Zoom agenda tracking recommendations (paid) | [Microsoft Support](https://support.microsoft.com/en-US/teams/copilot/facilitator-in-microsoft-teams-meetings); [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/) |
| Bias, inclusion and talk-time fairness nudges | FULL | Read.ai Speaker Coach (freemium, deeper features paid) | [Read.ai](https://www.read.ai/articles/ai-meeting-coach) |
| Meeting cost / ROI scoring | PARTIAL | Standalone calculators and extensions ("That Should Be An Email" for Google Calendar and Outlook; Apify Meeting ROI Calculator). Not built into the major platforms | [Apify](https://apify.com/alizarin_refrigerator-owner/meeting-roi-calculator); [adam.ai](https://adam.ai/resources/calculator) |
| "Should this meeting have been an email" analysis | PARTIAL | Apify's AI "Could Have Been an Email" score (pre-meeting, metadata-based). Zoom's "Free up my time" suggests meetings to skip. No platform scores this post-meeting from the transcript | [Apify](https://apify.com/alizarin_refrigerator-owner/meeting-roi-calculator); [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/) |
| Urdu transcription | FULL | Fireflies (ur), plus standalone STT (ElevenLabs, Soniox, Speak AI) | [Fireflies](https://guide.fireflies.ai/articles/2973706448-learn-about-fireflies-supported-languages); [Soniox](https://soniox.com/soniox-app/use-cases/meeting-transcription/urdu) |
| Code-switched transcription in one meeting | FULL (generic) | Fireflies Multi-Language Mode. Sarvam handles mid-sentence switching for 22 Indian languages but does not list Urdu | [Fireflies](https://guide.fireflies.ai/articles/2973706448-learn-about-fireflies-supported-languages); [Sarvam](https://www.sarvam.ai/apis/speech-to-text) |
| Roman Urdu / Urdu-English code-mixed meeting summaries and minutes | NOT FOUND commercially; research only | CLE (Pakistan) research project "Automatic Meeting Minutes and Analytics Generation for Urdu", building English, Urdu and Roman Urdu datasets. Monolingual ASR shows 30 to 50% higher WER on code-switched audio | [CLE](https://cle.org.pk/research/projects); [Gladia](https://gladia.io/blog/what-is-code-switching-in-speech-recognition) |
| Sign-language support | PARTIAL | Teams Sign Language Mode and Zoom interpreter support (human interpreters). AI avatar signing only from niche tools (SignFlow) and research | [mc.merill.net](https://mc.merill.net/message/RM571387); [Emergent Mind paper](https://www.emergentmind.com/papers/2604.05605) |
| Low-bandwidth / audio-only AI | NOT FOUND (not researched in depth) | n/a | n/a |
| Late-joiner live catch-up summary | FULL | Webex AI Assistant, Gemini in Meet, Zoom and Teams Copilot (all paid) | [Webex Help](https://help.webex.com/en-us/article/ne2xaqq/Cisco-AI-Assistant-for-Webex-Suite) |
| AI avatar or proxy attending for you | PARTIAL | Zoom avatar clips (add-on $12/mo) and photorealistic avatars (Dec 2025). A full "digital twin attends a live meeting" was announced as a vision only | [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/); [Decrypt](https://decrypt.co/285732/your-lifelike-zoom-clone-may-soon-be-taking-meetings-for-you-heres-how) |
| Meeting knowledge graph | PARTIAL | Mem (auto-linked notes), MeetGraph (open source), Rowboat, CocoIndex Neo4j tutorials. No major platform exposes a visual graph | [MeetGraph GitHub](https://github.com/sensein/meetgraph); [CocoIndex](https://cocoindex.io/docs/examples/meeting-notes-to-knowledge-graph/); [Aloa](https://aloa.co/ai/comparisons/ai-note-taker-comparison/granola-vs-mem) |
| Voice-commanded in-call actions | FULL | Otter "Hey Otter" Meeting Agent | [Engadget](https://engadget.com/ai/otterais-meeting-agent-can-schedule-calls-and-write-emails-for-you-130048189.html) |
| Meeting prep suggestions from past meetings | FULL | Zoom AI Companion 3.0 (paid) | [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/) |
| Cross-meeting semantic search / RAG chat | FULL | Otter, Fireflies team search, Zoom agentic retrieval | [Engadget](https://engadget.com/ai/otterais-meeting-agent-can-schedule-calls-and-write-emails-for-you-130048189.html); [Zoom News](https://news.zoom.com/ai-companion-3-0-and-zoom-workplace/) |

### Inferences
- **Already offered, so not unique for NeuraMeet:** summaries, action items, RAG chat, cross-meeting search, meeting prep, per-speaker engagement, follow-ups, Urdu transcription, catch-up, agenda timers, voice agents and translation.
- **Strongest candidates for a genuinely unique FYP feature:**
  1. Live cross-meeting "memory alerts": real-time detection that a commitment or decision being made contradicts or repeats one from an earlier meeting, or that an action item now being discussed is still open from meeting N. Only startups (Proactor, ContextGuard) do anything similar, and none combines it with action-item accountability. NeuraMeet's existing pgvector chunks and action_items make this feasible at zero cost.
  2. Code-mixed Urdu-English / Roman Urdu-native meeting intelligence: summaries, action items and RAG answers that preserve the code-mixing, optionally in Roman Urdu script. Only a CLE research project targets this, and no commercial product does.
  3. Combining the two: an "accountability ledger" for Urdu-English teams that carries unresolved commitments across meetings.
- AI sign-language output is technically unique but too risky and expensive for a FYP at zero cost.

### Gaps
- The contradiction-detection startups (Felarity, ContextGuard) are thinly documented. Felarity is on pages.dev and may be a hackathon or demo product, and their maturity and pricing are unknown.
- Low-bandwidth / audio-only AI modes were not researched.
- I found no source that confirms or denies Roman-Urdu summary output in Fireflies, Otter or Gemini, because that would require hands-on testing.
