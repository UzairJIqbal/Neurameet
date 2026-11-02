# Competitor Gaps: Meeting Capabilities Still Missing From Major Meeting Apps and AI Notetakers (as of Nov 2026)

Scope note: research done 2026-11-02 with ~20 web searches/fetches. "Absent" below means "no shipping product found in these searches", not proven absence. Vendor blog claims are marked (unverified vendor claim). Excluded per brief: Promise Ledger, Live Ledger / Agreement Check, anonymous AI devil's advocate, While You Were Gone recap, Viva/FYP panel mode, Urdu English meeting intelligence.

## What do the major products ship in 2025-2026, and which plausible features does none of them ship?

### Takeaway
The big suites now cover live agenda/timekeeping, in-meeting Q&A, cross-meeting search, personalized recaps, meeting cost and attendee pruning, redaction, and carry-forward of open items. What remains thin is **participant-side control of the record** (each attendee confirming or disputing what is attributed to them), **faithfulness of the summary to minority/dissenting views**, **verifiable integrity of minutes**, and **cross-meeting fact drift detection**. Several candidates in the brief (meeting cost/async, personalized recaps, airtime coaching, open-question carry-forward) are already shipped and should be dropped.

### Cited Findings

Already shipped (rules out candidates):
- Microsoft Teams Facilitator: surfaces the agenda, shows an agenda timer on stage, rebalances time when topics are added, captures key points, decisions, action items, and "summarizes key decisions and open questions" — [aguidetocloud](https://www.aguidetocloud.com/blog/microsoft-365-facilitator-agent/); [preciofishbone](https://www.preciofishbone.com/knowledge-hub/teams-facilitator-agent-meeting-assistant/)
- Teams Facilitator (planned Aug 2026 rollout, Copilot Premium): detects unresolved factual questions in a meeting, asks a participant to confirm, then web-searches and posts an answer in chat — [windowsforum](https://windowsforum.com/news/microsoft-teams-facilitator-aug-2026-answers-unanswered-questions-with-web-search.430248/); [windowsnews.ai](https://windowsnews.ai/article/microsoft-teams-facilitator-will-web-search-unanswered-meeting-questions-in-august-2026.430248) (rollout status not independently verified)
- Zoom AI Companion 3.0: agentic search across past meetings, transcripts, notes and connectors (Drive, OneDrive; May 2026 expansion to ten connectors incl. Salesforce, Workday, ServiceNow), custom agents, AI Docs/Sheets/Slides from conversations, post-meeting deliverable workflows — [Zoom news](https://news.zoom.com/zoom-launches-ai-companion-3-0/); [Zoom EC26](https://news.zoom.com/ec26-zoom-ai/); [contentgrip](https://www.contentgrip.com/zoom-ai-companion/)
- Zoom AI Meeting Notes: host can edit and share summaries via email and Team Chat — [tldv guide](https://tldv.io/blog/meeting-notes-ultimate-guide/) (secondary). Webex: after the meeting, sends the host an email to "review and share" summary, action items, transcript, chapters — [Webex help](https://help.webex.com/article/nslyqzx/Webex-App-%7C-AI-generated-meeting-summaries-in-recordings)
- Read.ai: recaps "custom to you" with email/calendar context; before recurring meetings surfaces last session's action items and key questions — [ZoomInfo breakdown](https://pipeline.zoominfo.com/sales/read-ai-features); [read.ai](https://www.read.ai/meeting-reports)
- Read.ai Read Score combines sentiment, engagement, conversation balance/turn-taking; Smart Scheduler recommends making invitees optional, removing them, or deleting/reviewing a series — [Read support: Read Score](https://support.read.ai/hc/en-us/articles/4406653674003); [Read support: recommendations](https://support.read.ai/hc/en-us/articles/7989314755731-What-kinds-of-meeting-recommendations-does-Read-make)
- Fellow: Meeting Guideline Analytics with eight metrics (meeting health, calendar hygiene, preparedness, recurring meetings with no end date, etc.) — [Fellow help](https://help.fellow.ai/en/articles/8940594-meeting-guideline-analytics); [Fellow workspace analytics](https://fellow.ai/features/workspace-analytics)
- Fellow: permanent Redaction of transcript/recording lines with optional AI recap regeneration (organizer-side action, used "when meeting participants request that certain statements be removed") — [Fellow help: Redaction](https://help.fellow.ai/en/articles/10359653-redaction)
- Fellow: custom AI note templates where users add sections in plain language, e.g. "Identify any customer objections" — [Fellow help: templates](https://help.fellow.ai/en/articles/9844905-customize-your-ai-meeting-notes-with-templates)
- Gong: detects customer objections, talk ratios, how long objections were discussed (sales-only) — [Lindy review of Gong](https://www.lindy.ai/blog/gong-note-taker)
- Meeting cost calculators with "move to async" suggestions are commodity (Flowtrace, MeetingMeter, Rock, Koalendar, etc.) — [Flowtrace roundup](https://www.flowtrace.co/collaboration-blog/best-meeting-cost-tools); [MeetingMeter](https://meetingmeter.org/meeting-load-analyzer)
- Carry-forward of open items/questions across recurring meetings: Wispr Notetaker, Hedy, Fellow, Scribbl (unverified vendor claims) — [Wispr](https://wisprflow.ai/notetaker/ai-meeting-notes); [Scribbl](https://scribbl.co/post/ai-notetaker-for-1-on-1-meetings); [Hedy](https://www.hedy.ai/post/top-5-ai-meeting-assistants/)
- TrueScreen: a bot joins a meeting and certifies audio, video and transcript with qualified timestamp and chain of custody (forensic/legal product, paid) — [truescreen.io](https://truescreen.io/) (unverified vendor claim)
- Account handoff via shared folders of call recordings (Granola) and offboarding "AI interview" knowledge capture (Sensay) — [Granola blog](https://www.granola.ai/blog/ai-notetaker-account-handoff-knowledge-loss); [Sensay](https://blog.sensay.io/introducing-sensay-ai-offboarding) (both unverified vendor claims)

### Inferences
- Review/approval in every product found is **host-centric**: host edits (Zoom), host reviews and shares (Webex), organizer redacts (Fellow). No product found gives each attendee a per-line "that's what I said / that's not what I said" sign-off on their attributed statements.
- Integrity products exist (TrueScreen) but are forensic, bot-based, paid; no mainstream notetaker exposes a public "verify these minutes have not been altered" check.
- Drop from consideration: meeting cost/ROI and "should this meeting exist" (Read.ai, Fellow, Flowtrace ship it), personalized recaps (Read.ai), airtime/fairness coaching (Read.ai; NeuraMeet already has per-speaker engagement), open-question carry-forward (Read.ai, Wispr, Facilitator).

### Gaps
- Did not check Otter, Fireflies, tl;dv, Fathom, Krisp, Avoma, Supernormal, Circleback, Bluedot, Granola release notes individually; absence claims for those rest on comparative roundups and searches, not changelogs.
- Board-portal tools (Diligent, BoardEffect, etc.) likely have manual minutes-approval workflows; not researched, so "summary sign-off" novelty should be scoped to AI notetakers / meeting apps.

## Candidate features that appear absent, with evidence of absence and demand

### Takeaway
Six candidates survive checking. Strongest for a FYP (novel, demoable, zero-cost, builds on existing NeuraMeet transcripts/ledger): (1) Participant Sign-off with attributed-line disputes, (2) Dissent-Preserving Summary with a representation check, (3) Tamper-evident hash-chained minutes (best combined with 1 as "Attested Minutes"). Medium: (4) Cross-meeting Fact Drift detector, (5) Summary Omission Audit, (6) Successor Handover Brief.

### Cited Findings

**1. Participant Sign-off ("each attendee attests their own lines")**
- Absence: host/owner review is the 2026 norm; "the standard 2026 approach emphasizes host/meeting owner review rather than formal participant approval" (search synthesis); Webex sends review email to host only — [Webex help](https://help.webex.com/article/nslyqzx/Webex-App-%7C-AI-generated-meeting-summaries-in-recordings); Fellow redaction is organizer-run — [Fellow help](https://help.fellow.ai/en/articles/10359653-redaction)
- A vendor post on misattribution "does not identify any product offering participant review, correction, or sign-off workflows" (my reading of the article) — [TeamMeet blog, 24 Aug 2026](https://teammeet.ai/blog/wrong-speaker-attribution) (vendor with interest)
- Demand: diarization ~88-90% one-on-one vs ~75% in calls with 5+ people (Reddit test cited by vendor); one user needed line-by-line corrections on all but one of 56 meetings — [TeamMeet blog](https://teammeet.ai/blog/wrong-speaker-attribution) (secondary, unverified)
- Demand: 24 Reddit users complained of missing/wrong speaker labels in Notion AI Meeting Notes vs 1 praising — [MetaWhisp review](https://metawhisp.com/blog/notion-ai-meeting-notes-review/)
- "A meeting summary carries the authority of a record even though nobody signed it" / most people do not review notes — search synthesis citing [Wikipedia: AI notetaker](https://en.wikipedia.org/wiki/AI_notetaker) and [Smith Law](https://www.smithlaw.com/newsroom/publications/the-silent-guest-in-your-meetings-legal-risks-of-ai-note-takers)
- Guidance recommends circulating action items to attendees for confirmation because "silent disagreements are the main reason action items stall" — [tldv guide](https://tldv.io/blog/meeting-notes-ultimate-guide/)
- Survey: 30.4% of AI meeting summaries had at least one factual error, 43.6% for peripheral exchanges — [AI Scout JP survey on note.com](https://note.com/ai_scout_jp/n/n99f638fec546?hl=en) (single survey, methodology unverified); 2024 evaluation found hallucinated dates/names/events in 14-37% of summaries — cited via [saner.ai stats](https://www.saner.ai/blogs/ai-note-taking-statistics) (aggregator)

**2. Dissent-Preserving Summary (every objection kept with speaker + quote, plus a representation check)**
- Research: across 18 LLMs, "persistent weaknesses in deliberation summarization, especially underrepresentation of minority positions"; DeliberationBank: 3,000 participants, 4,500 annotators — [Zhu, Yang, Bakker, Pentland, Pei, arXiv 2510.05154 (v. Mar 2026)](https://arxiv.org/abs/2510.05154)
- Minority/dissenting views and caveats, negations, attribution are among what AI summaries most often drop — [memx blog](https://memx.app/blog/what-ai-summaries-leave-out/); [EvalCommunity](https://academy.evalcommunity.com/ai-summarizes-evaluation-evidence/) (blogs, lower authority)
- Closest existing: Gong objection tracking (sales customers only) — [Lindy](https://www.lindy.ai/blog/gong-note-taker); Fellow custom sections that a user must write themselves — [Fellow help](https://help.fellow.ai/en/articles/9844905-customize-your-ai-meeting-notes-with-templates); Teams Facilitator summarizes "decisions and open questions", not dissent — [aguidetocloud](https://www.aguidetocloud.com/blog/microsoft-365-facilitator-agent/)
- Related research context: CHI 2026 "Rethinking AI-Mediated Minority Support in Power-Imbalanced Group Decision-Making: From Anonymity to Authenticity" — [arXiv 2604.22319](https://arxiv.org/pdf/2604.22319) (title only seen; consistent with the brief's note that anonymous devil's advocate harms psychological safety, so dissent should be attributed, not anonymous)

**3. Tamper-evident / verifiable minutes (hash-chained, public verify link)**
- Technique: append-only SHA-256 hash chain where any edit, insertion, deletion or reorder invalidates all later hashes; verification localizes tampering — [halo-record GitHub](https://github.com/bkuan001/halo-record); [AuditWeave arXiv 2607.09682](https://arxiv.org/pdf/2607.09682)
- Closest product: TrueScreen certified meeting capture (forensic, paid) — [truescreen.io](https://truescreen.io/) (unverified vendor claim)
- No mainstream notetaker found exposing integrity verification of AI minutes (absence from searches only)
- Demand signal: legal-risk commentary on notetaker records — [Smith Law](https://www.smithlaw.com/newsroom/publications/the-silent-guest-in-your-meetings-legal-risks-of-ai-note-takers); [craftnote, regulated meetings 2026](https://www.craftnote.com/blog/ai-meeting-summaries-legal-regulated-meetings-2026)

**4. Cross-meeting Fact Drift detector (numbers, dates, scope or facts stated differently across meetings or vs an uploaded brief)**
- Demand: a Microsoft Q&A user asked for an AI meeting agent with "context continuity and contradiction detection" — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/2336737/ai-meeting-agent-for-transcript-summarization-cont)
- Only DIY workarounds found: tutorials comparing notes to a project brief with a local model — [DEV article](https://dev.to/alichherawalla/how-to-find-contradictions-between-meeting-notes-and-a-project-brief-in-2026-571d); [getoffgridai](https://getoffgridai.co/articles/how-to-find-contradictions-between-meeting-notes-and-a-project-brief-in-2026/)
- Overlap caution: Promise Ledger already marks promises "reversed"; Fact Drift would need to target non-promise facts (figures, dates, requirements) to be distinct.

**5. Summary Omission / Coverage Audit (show which speakers and transcript segments the summary did not represent)**
- Research: "LLM Judges Verify Presence, Not Absence: Omission Blindness in AI Clinical Notes" — [arXiv 2608.31016](https://arxiv.org/pdf/2608.31016) (title only seen; clinical domain)
- Minority underrepresentation finding above — [arXiv 2510.05154](https://arxiv.org/abs/2510.05154)
- No meeting product found showing per-speaker summary coverage (absence from searches only). Pairs naturally with #2.

**6. Successor Handover Brief (when someone leaves/hands off, generate a brief from their meetings: open promises, decisions they owned, key contacts, quotes)**
- Closest: Granola recommends shared folders of transcripts for account handoffs (no generated brief described) — [Granola blog](https://www.granola.ai/blog/ai-notetaker-account-handoff-knowledge-loss); Sensay offboarding uses AI interviews, not meeting history — [Sensay](https://blog.sensay.io/introducing-sensay-ai-offboarding); generic advice to run prompts over transcripts to make a handoff doc — [People Managing People](https://peoplemanagingpeople.com/workforce-management/ai-in-employee-offboarding/)
- Weaker FYP fit: NeuraMeet has no team/org model (multi-tenant is out of scope), so "reassign owner's open ledger items to a successor" is the most it could do.

Rejected after checking (already shipped): meeting cost/ROI and auto-cancel/async (Read.ai Smart Scheduler, Fellow analytics, Flowtrace); per-person tailored recaps (Read.ai); airtime/fairness coaching (Read.ai Read Score; CHI 2026 field study found users used it for "personal reflection rather than feedback exchange" — [Houtti et al., CHI '26, arXiv 2601.11750](https://arxiv.org/abs/2601.11750)); unanswered-question tracking (Teams Facilitator, Read.ai, Wispr); meeting-to-meeting dependency graph (no evidence either way found; low demand signal).

### Inferences
- The strongest third feature is a combined **"Attested Minutes"**: after processing, each participant gets their attributed lines and the summary items mentioning them, confirms or disputes each (dispute = correction note + quote/timestamp), the summary carries a mandatory "Dissent and objections" section with speaker + quote, and the finalized version is sealed with a SHA-256 hash chain and a verify page. It reuses Promise Ledger's confirm/reject review pattern and quote-evidence model, so it is consistent with NeuraMeet's identity ("evidence-backed meeting record") without duplicating the ledger.
- Zero-cost feasibility: hashing via Node `crypto` (built in), storage in Supabase, dissent extraction as an extra field in the existing `/api/ai/process` Gemini/Groq call, coverage check via existing per-speaker transcript segments. No new provider needed.
- Claim wording should stay narrow, e.g. "none of the major meeting apps or notetakers we reviewed let each participant attest their own attributed statements".
- Risk: diarization errors in NeuraMeet are lower than bot-based tools because F-series transcription is per-participant track (individual recording), which strengthens the attribution story but also means misattribution demand is less of a pain point inside NeuraMeet itself; the sign-off value then rests on summary errors (30% figure) and dissent omission rather than speaker labels.

### Gaps
- No independent (non-vendor) Reddit/HN thread fetched directly asking for participant sign-off; demand evidence is via vendor blogs and a review aggregator.
- The 30.4% summary-error survey and the 14-37% hallucination figure were seen only through secondary sources; original methodology not verified.
- Did not verify whether Otter/Fireflies/Fathom allow non-host attendees to comment on or edit shared notes (comments are plausible in some; would weaken #1 only if tied to attribution sign-off).
- Could not confirm whether any board-portal or legal-tech product combines AI summaries with participant attestation.
