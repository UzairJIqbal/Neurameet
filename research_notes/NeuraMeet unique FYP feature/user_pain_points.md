# Unmet User Needs and Pain Points: Video Meetings and AI Meeting Assistants (focus: Pakistan / South Asia)

Research date: 2026-10-30. Evidence window preferred 2024-2026; older data is flagged inline.

Source-quality legend: [PRIMARY] = original report/paper/court filing/regulator; [PRESS] = reputable news reporting a primary source; [VENDOR] = blog by a meeting-tool company (commercial interest, often unsourced numbers; treat with caution).

## 1. What do users complain about most with AI notetakers and meeting apps?

### Takeaway
The dominant complaint clusters are (a) the meeting ends and nothing happens: unclear ownership and forgotten action items; (b) trust in AI output: hallucinated or misattributed content, weak speaker identification, poor accuracy on non-native accents; (c) consent/privacy: bots auto-joining calls and recording people who never agreed, now litigated (Otter class action, 2025). Accent/multilingual weakness is the complaint most directly relevant to Pakistani users and the least solved by incumbents.

### Cited Findings
**Post-meeting follow-through ("nothing happens after the meeting")**
- Atlassian survey of 5,000 knowledge workers (four continents): meetings ineffective 72% of the time; 77% say meetings mainly create more meetings; 78% struggle to finish work because of meeting load; 76% feel drained on meeting-heavy days. Fortune describes the outcome as "no decisions were made, and nobody knows what's expected of them." Survey date not specified (article March 2024) [PRESS] — [Fortune](https://fortune.com/2024/03/21/meetings-productivity-ineffective-atlassian-report)
- Atlassian: 54% of workers leave meetings without knowing next steps or who owns tasks; 62% attend meetings with no stated goal in the invite [PRESS/aggregator] — [Reworked](https://www.reworked.co/collaboration-productivity/atlassian-found-meetings-are-unproductive-heres-what-needs-to-change/); [myhours](https://myhours.com/articles/meeting-statistics-2025)
- Atlassian State of Teams 2024: 25 billion work hours lost annually to ineffective collaboration [PRESS] — [ChannelLife](https://channellife.com.au/story/atlassian-report-finds-25-billion-work-hours-lost-to-poor-teamwork)
- Claims that "44% of action items never get completed" and "up to 40% never completed" circulate widely, but only on vendor blogs with no traceable primary study. Do NOT cite as fact [VENDOR, UNVERIFIED] — [acta.ai](https://acta.ai/blogs/meeting-follow-through-why-action-items-dont-get-done); [owll.ai](https://owll.ai/blog/cost-of-poor-meeting-follow-through)

**AI accuracy, hallucination and speaker attribution**
- AI notetakers can hallucinate and misrepresent what was said; casual jokes and personal remarks leak into official summaries next to action items [encyclopedia summary] — [Wikipedia: AI notetaker](https://en.wikipedia.org/wiki/AI_notetaker)
- Bot-based notetakers reported to mangle speaker names, miss action items, and in some cases crash and delete Zoom recordings; a CTO called a bot he could not remove "a critical failure" [VENDOR] — [meetjamie.ai](https://www.meetjamie.ai/blog/bot-free-notetakers-for-zoom)
- G2 reviewers rank accuracy as the top Otter dislike; accuracy drops for African, Arabic, Somali and non-native accents, overlapping speakers, and background noise. One review test: Otter misidentified speakers ~30% of the time in a 10-person meeting [aggregated G2 reviews via comparison sites; single test, not rigorous] — [G2 Otter reviews](https://www.g2.com/products/otter-ai/reviews_and_filters); [wisprflow comparison](https://wisprflow.ai/notetaker/otter-vs-fireflies-how-the-ai-notetakers-compare)
- G2 speaker-identification scores: Fireflies 8.5 (480 reviews) vs Otter 7.7 (197 reviews) — [G2 compare](https://www.g2.com/compare/fireflies-ai-vs-otter-ai)
- Zoom's own community forum has threads titled "Why is the AI meeting summary so inaccurate?" and "AI Summary Quality Decline" (content not retrievable during this research) — [Zoom Community](https://community.zoom.com/meetings-2/why-is-the-ai-meeting-summary-so-inaccurate-75781); [Zoom Community 2](https://community.zoom.com/t5/Zoom-AI-Companion/AI-Summary-Quality-Decline/m-p/218448)
- Broader AI-trust context: Stack Overflow 2025 survey, 84% use or plan to use AI tools but 46% distrust output accuracy — [Let's Data Science recap](https://letsdatascience.com/news/stack-overflow-survey-documents-developer-ai-fatigue-c12da29b); KPMG 2025 global study: trust in AI remains a critical challenge — [KPMG](https://kpmg.com/za/en/home/newsroom/press-releases/2025/05/press-release-global-study-reveals-trust-of-ai-remains-a-critical-challenge-reflecting-tension-between-benefits-and-risks.html)

**Privacy, consent and bots joining**
- Brewer v. Otter.ai (filed 15 Aug 2025, N.D. Cal.): alleges Otter "deceptively and surreptitiously" recorded conversations and used them for training without consent. The plaintiff never signed up for Otter; his Feb 2025 sales call was recorded because another participant had OtterPilot running. Otter allegedly auto-joins via linked calendars. Four suits since consolidated [PRESS] — [NHPR/NPR](https://www.nhpr.org/2025-08-15/class-action-suit-claims-otter-ai-secretly-records-private-work-conversations); [National Law Review](https://natlawreview.com/article/ai-notetaking-tools-under-fire-lessons-otterai-class-action-complaint); [tl;dv summary](https://tldv.io/blog/ai-meeting-recorder-lawsuits/)
- Public-sector employers warn staff about AI notetakers in online meetings (Derbyshire County Council, UK) — [Derbyshire staff news](https://staff.derbyshire.gov.uk/news-and-engagement/employee-news/news-items/please-be-wary-about-ai-notetakers-in-online-meetings.aspx)
- Visible bots change meeting dynamics and raise consent concerns in client calls; Granola was the most-discussed newer tool on Reddit in late 2025 *because* it has no visible bot [VENDOR/aggregator] — [meetjamie.ai](https://www.meetjamie.ai/blog/bot-free-notetakers-for-zoom); [aitooldiscovery Reddit roundup](https://www.aitooldiscovery.com/guides/best-ai-note-taking-app-reddit)
- Reddit sentiment is mixed, not uniformly positive: in 567 Reddit posts/comments on Notion AI Meeting Notes, 58 praised vs 62 complained [aggregator analysis] — [MetaWhisp](https://metawhisp.com/blog/notion-ai-meeting-notes-review/)

**Preliminary ranking (frequency x pain), synthesized from above**
1. No follow-through / unclear ownership after meetings (Atlassian 54%, 72%, 77%) — highest frequency, high pain.
2. Accuracy and trust in AI output (hallucinations, wrong speakers, accents) — very frequent in reviews; worst for non-native/multilingual speakers.
3. Meeting overload and fatigue (see section 2) — very frequent, high pain, but hard for software alone to fix.
4. Privacy/consent of recording bots — lower frequency but very high severity (litigation, employer bans).
5. Language/connectivity gaps for South Asian users (section 3) — highly specific, almost entirely unserved.

### Inferences
- Incumbents already ship summaries and action-item lists; the unmet gap is *closing the loop* (owner + deadline + verification that it happened, across meetings) and *provable accuracy* (every summary claim traceable to a timestamped transcript line).
- A consent-first, botless design (recording is a native feature of the meeting app, with visible consent) is a structural advantage of a self-hosted meeting app like NeuraMeet versus bolt-on bots.

### Gaps
- No primary, peer-reviewed measurement of action-item hallucination rates in commercial notetakers was found.
- Could not retrieve Zoom community thread text or individual Reddit threads directly; complaint themes come via aggregators.
- No reliable primary statistic for "% of action items never completed"; widely quoted numbers are vendor-originated.

## 2. What does research say about meeting fatigue, meeting waste/cost, decision follow-through, and "meetings about meetings"?

### Takeaway
Strong, repeated evidence: meetings are perceived as mostly ineffective (Atlassian 72%; HBR 71% of senior managers), they generate more meetings (77%), they fragment the day (Microsoft: interruption every 2 minutes, 275/day), and video calls cause measurable fatigue (Stanford, n=10,591). Decision follow-through is the weakest-evidenced but most often-asserted gap.

### Cited Findings
- Microsoft Work Trend Index 2025 ("infinite workday", telemetry-based): employees interrupted every 2 minutes in core hours by meetings/email/notifications, ~275 interruptions/day; 57% of meetings are ad hoc calls with no calendar invite; 1 in 10 scheduled meetings booked last minute; meetings after 8pm up 16% YoY; 48% of employees and 52% of leaders say work feels chaotic [PRESS reporting on primary] — [Axios](https://www.axios.com/2025/06/17/microsoft-remote-work-meetings); [TechSpot](https://www.techspot.com/news/108343-microsoft-study-finds-infinite-workday-hurting-productivity.html); [ACS Information Age](https://ia.acs.org.au/article/2025/workday-now-dominated-by--focus-sapping--meetings.html)
- Atlassian (5,000 workers): 72% ineffective; 77% say meetings beget meetings ("meetings about meetings"); 78% can't finish work; >50% work overtime several days a week due to meetings; 67% of directors+ work overtime; 76% drained — [Fortune, Mar 2024](https://fortune.com/2024/03/21/meetings-productivity-ineffective-atlassian-report)
- Atlassian functional breakdown: 75% say collaborative decision-making in meetings fails; 72% say meetings don't create clarity on goals; 67% say they don't drive work forward — [myhours aggregation](https://myhours.com/articles/meeting-statistics-2025) (aggregator; verify against Atlassian original if quoted)
- HBR "Stop the Meeting Madness" (Perlow, Hadley, Eun, 2017 — OLDER DATA): 182 senior managers; 71% say meetings are unproductive and inefficient; 65% say meetings keep them from their own work; 64% say meetings come at the expense of deep thinking — [Runn summary](https://www.runn.io/blog/unproductive-meetings-statistics)
- Doodle State of Meetings (2019 — OLDER DATA, 19M meetings analysed): poorly organised meetings cost US companies ~$399bn/year; professionals lose ~31 hours/month to unproductive meetings (31h figure frequently attributed, provenance less clear) — [The Grocer](https://www.thegrocer.co.uk/comment-and-opinion/how-marginal-gains-can-reduce-meetings-and-recover-some-time/720881.article); [Runn](https://www.runn.io/blog/unproductive-meetings-statistics)
- Stanford VHIL (Fauville, Bailenson et al., n=10,591; published Computers in Human Behavior Reports 2023, data from 2021): Zoom fatigue predicted by daily usage and five nonverbal mechanisms (mirror anxiety, physically trapped, hyper-gaze, cognitive load of producing/interpreting cues); women report more fatigue, mediated by mirror anxiety; women have longer meetings with shorter breaks [PRIMARY] — [Stanford VHIL](https://vhil.stanford.edu/publications/videoconferencing/video-conferencing-usage-dynamics-and-nonverbal-mechanisms); [DOAJ record](https://doaj.org/article/64e3fedfe38e481fbbb927ff75deb0cc)

### Inferences
- "Meetings about meetings" (77%) suggests a measurable opportunity: detecting when a meeting re-discusses an already-decided topic (cross-meeting decision memory) and surfacing the prior decision, which NeuraMeet's pgvector cross-meeting search could support.
- Since 57% of meetings are ad hoc with no invite (Microsoft), tools that rely on calendar context for prep/agenda miss most meetings; context must be inferred from content.

### Gaps
- Atlassian original report URL not fetched; numbers come from Fortune/aggregators.
- No 2024-2026 primary study isolating "decisions forgotten / re-litigated" rates was found.
- No Pakistan-specific meeting-fatigue or meeting-cost survey was found.

## 3. What are the specific problems for Pakistani / South Asian users?

### Takeaway
Pakistani users face a compound problem incumbents ignore: speech is routinely Urdu-English code-switched ("Urlish"), text is often Roman Urdu, ASR quality for Urdu is still poor (Whisper-Small ~34% WER), connectivity is slow and unreliable (fixed broadband ranked 144th globally, repeated subsea-cable cuts, world's costliest shutdowns in 2024), and usage is overwhelmingly mobile.

### Cited Findings
**Language: code-switching, Urdu ASR, Roman Urdu**
- Urdu has 230M+ speakers (10th most spoken) but is under-represented in ASR due to dialectal diversity, code-switching and sparse data. Lightweight Whisper WER on Urdu: Tiny 67.08%, Base 53.67%, Small 33.68%; persistent phonetic and lexical-coherence errors on complex utterances (Antall & Akhtar, Aug 2025) [PRIMARY, preprint] — [arXiv 2508.09865](https://arxiv.org/abs/2508.09865)
- 2025/26 SSRN study (Haroon): zero-shot Whisper Tiny/Base/Small on 327 Urdu-English code-mixed recordings from 11 speakers, stratified by light/moderate/heavy mixing; introduces Switch Point Error Rate (SPER) measuring errors at language-transition boundaries; compares Urdu-forced, English-forced and auto language detection [PRIMARY, preprint; full numbers not retrievable — 403] — [SSRN 6959921](https://papers.ssrn.com/sol3/Delivery.cfm/6959921.pdf?abstractid=6959921&mirid=1)
- Systematic reviews confirm code-switching remains a core unsolved problem for end-to-end ASR — [arXiv 2507.07741](https://arxiv.org/pdf/2507.07741); [arXiv 2509.24310](https://arxiv.org/pdf/2509.24310)
- N-shot evaluation of ASR on Pashto, Punjabi and Urdu (CHiPSAL 2025) shows these regional languages remain low-resource for ASR — [ACL Anthology](https://aclanthology.org/2025.chipsal-1.20.pdf)
- English-Urdu mixing ("Urlish") is common and socially accepted in Pakistan; studies measure frequent code-mixing in spoken discourse at public and private institutions in Lahore — [IJLC](https://ijlc.wum.edu.pk/index.php/ojs/article/view/268); [UMT eScholar](https://escholar.umt.edu.pk/items/73622c04-80e6-4fa6-b806-f14fefd3333f)
- Roman Urdu is widely used in informal digital text; spelling variation makes retrieval/search hard; LUMS work on transliterating Roman-Urdu/English code-mix to Urdu script — [LUMS SBASSE](https://sbasse.lums.edu.pk/node/10174); [arXiv 2411.04752](https://arxiv.org/html/2411.04752v3)
- Incumbent notetakers' accuracy drops sharply for non-native accents (G2, section 1) — [G2](https://www.g2.com/products/otter-ai/reviews_and_filters)

**Connectivity, load-shedding, cost**
- Ookla 2025: Pakistan mobile 98th globally (24.32 Mbps), fixed broadband 144th (16 Mbps), vs India fixed 59 Mbps, Bangladesh 60 Mbps [PRESS citing Ookla] — [TechJuice](https://www.techjuice.pk/?p=196258)
- Top10VPN: Pakistan lost $1.62bn to deliberate shutdowns in 2024 (9,735 hours, 82.9M users affected, 21% of global shutdown losses) — [TechJuice](https://www.techjuice.pk/?p=196258); [Arab News](https://www.arabnews.pk/node/2618892)
- Four subsea cable failures in 2024; speeds dropped 30-40% in Aug 2024; Sept 2025 cuts to SMW4 and IMEWE near Jeddah raised latency; AAE-1 fault early 2025; Dec 2025 IT secretary said a disruption would last 4-5 weeks — [SubTel Forum](https://subtelforum.com/submarine-cable-cuts-disrupt-internet-services-in-pakistan/); [Express Tribune](https://tribune.com.pk/story/2567634/internet-disruption-to-last-4-5-weeks-it-secretary); [ProPakistani](https://propakistani.pk/2024/10/25/document-exposes-real-culprit-behind-internet-disruptions-in-pakistan-this-year/)
- Online learning studies in Pakistan repeatedly cite lack of internet, load-shedding, expensive data packages, technical issues and home disturbance; online classes get interrupted and students with poor access fall behind (mostly COVID-era 2020-2022 data — OLDER) — [ResearchGate: Barriers to Digital Learning (2024)](https://www.researchgate.net/publication/384157475_Barriers_to_Digital_Learning_Challenges_in_Online_Education_in_Pakistan); [IGI Global](https://www.igi-global.com/article/online-learning-system-in-higher-education-institutions-in-pakistan/281235); [ResearchGate: Punjab students](https://www.researchgate.net/publication/369962471_Impediments_of_Online_Learning_and_Teaching_During_Covid_Pandemic_A_Case_of_University_Students_in_Punjab_Pakistan)

**Mobile-first**
- PTA, Aug 2025: 148M mobile broadband subscribers (59.56% penetration) vs ~3M fixed telephone lines; total broadband 152M; ~2M fibre-to-home; smartphone adoption ~68% (GSMA) — [CW Pakistan](https://cwpakistan.com/pta-reports-193-million-cellular-subscribers-in-pakistan-growth-in-mobile-and-broadband-penetration/); [Pakistan Today](https://profit.pakistantoday.com.pk/2026/01/20/pakistans-mobile-subscriber-base-tops-200-million-by-end-of-2025-pta-data-shows/)
- FY2024-25 data: mobile 14,153 PB vs fixed 13,574 PB — [ProPakistani](https://propakistani.pk/2025/06/09/pakistanis-used-28-billion-gbs-of-internet-in-fy2024-25/)

### Inferences
- The highest-value, least-served problem for Pakistani users is *understanding* a code-switched meeting, not just transcribing it: a summary/action-item layer that handles Urdu-English mixing and outputs in the user's chosen language (English, Urdu script, or Roman Urdu) is something no mainstream notetaker markets.
- Because connections drop (load-shedding, cable cuts), a "catch me up on what I missed while disconnected" feature (dropout-aware recap using attendance join/leave timestamps plus transcript segments) maps directly to a documented, Pakistan-specific pain and reuses NeuraMeet's existing attendance_events + transcript data.
- Whisper-Small-class WER (~34%) means AI outputs on Urdu will contain errors; grounding each action item in a timestamped transcript quote (verifiability) matters more here than in English markets.

### Gaps
- No quantitative study of *meeting* (vs class) behaviour in Pakistani offices or government found.
- Could not retrieve SSRN code-switching WER/SPER numbers, or any public benchmark for Groq-hosted whisper-large-v3 on Urdu-English code-mix specifically.
- No Pakistan Reddit (r/pakistan) threads on meeting tools were successfully retrieved.

## 4. What problems do educators/universities face (online classes, viva/FYP panels, attendance proxies)?

### Takeaway
Evidence is mostly COVID-era (2020-2022) but consistent: unreliable attendance, proxy/fake attendance, assessment integrity concerns (vivas used to cross-check), connectivity-driven dropouts, and failing university portals. No tool combines verified attendance with what-was-covered recaps for students who dropped.

### Cited Findings
- Complaints at Pakistani universities include staff marking bogus attendance for untaught lectures and students pressured to sign fake attendance [PRESS, older] — [Express Tribune](https://tribune.com.pk/story/1596733/entertainment)
- Some universities exempted attendance during online classes, leading to students not taking classes seriously; "unreliable attendance patterns" and disparate video apps noted — [Express Tribune 2020](https://tribune.com.pk/story/2199209/entertainment); [Dawn 2020](https://www.dawn.com/news/1563247)
- Universities used online objective exams plus viva to cross-check unfair means; uploading attendance to portals could bar students from finals due to shortage — [The News TNS](https://www.thenews.pk/tns/detail/785522-on-online-classes-and-exams)
- GCU Faisalabad online exam became "a fiasco" due to a slow portal — [Dawn](https://www.dawn.com/news/1611610)
- Capital University (CUST) VLE monitoring committee minutes document institutional effort to monitor online class conduct (2020) — [CUST minutes](https://cust.edu.pk/static/uploads/2020/05/Minutes-of-3rd-VLE-Monitoring-Committee-Meeting.pdf)
- Student-reported problems: ear pain from prolonged headphone use, unreliable assessment results, expensive internet — [IGI Global](https://www.igi-global.com/article/online-learning-system-in-higher-education-institutions-in-pakistan/281235)

### Inferences
- Attendance based on "joined the call" is gameable (join and walk away). Engagement-weighted attendance (time present, mic/camera activity, spoken contribution from transcript) is a more credible record, and NeuraMeet already captures these signals (B2 attendance events, C3 speaker engagement).
- FYP/viva panels are themselves meetings with decisions (marks, required changes); a "decision + required-changes ledger" across successive panel/supervisor meetings is a natural academic use case for cross-meeting decision tracking.

### Gaps
- Little 2024-2026 data on Pakistani online/hybrid teaching; most studies are COVID-era.
- No data found on how FYP supervisors/panels currently record feedback or track required changes.

## 5. Accessibility gaps (deaf/hard-of-hearing, Pakistan Sign Language, non-native speakers)

### Takeaway
Pakistan has a large deaf population with weak institutional support (PSL not legally recognised; <5% of deaf children in school), and deaf professionals report exclusion from meetings. Live Urdu captioning in meetings is essentially absent; regulator-level initiatives (PTA + DeafTawk, 2025) show policy interest.

### Cited Findings
- Over 10 million deaf people in Pakistan; over 1 million deaf children, <5% enrolled in school; PSL not officially recognised by institutions [PRESS] — [Express Tribune, "Fluent in silence"](https://tribune.com.pk/story/2543840/1)
- A deaf Karachi graphic designer: "I had to leave three different workplaces... No one wanted to include me in meetings." — [Express Tribune](https://tribune.com.pk/story/2543840/1)
- PTA signed an MoU with DeafTawk (Jan 2025) for online sign-language interpretation at PTA offices and plans AI text-to-sign / speech-to-sign tools on its digital platforms [PRIMARY regulator] — [PTA](https://pta.gov.pk/category/pta-signs-mou-with-deaftawk-to-advance-accessibility-for-the-special--need-hearing-impairments-867832596-2025-01-03); [Arab News](https://www.arabnews.pk/node/2585023)
- Access to the Media (Deaf) Persons Act 2022 mandates sign-language interpretation on news bulletins — [Sindh Courier](https://sindhcourier.com/the-question-of-deaf-rights-in-pakistan/)
- Pakistan Association of the Deaf published Urdu grammar in PSL — [PAD](https://www.padeaf.org/quick-links/publications)
- Non-native speakers: incumbents' accuracy drops for non-native accents (section 1) — [G2](https://www.g2.com/products/otter-ai/reviews_and_filters)

### Inferences
- Real-time PSL translation is too ambitious for an FYP, but live (or near-live) Urdu/English captions plus a post-meeting plain-language summary in the reader's language is a feasible accessibility contribution that also helps non-native English speakers.

### Gaps
- No data on caption availability/quality for Urdu in Zoom/Meet/Teams was found.
- Prevalence figures (10M deaf) come from press, not a census; Pakistan Bureau of Statistics disability data not retrieved.
