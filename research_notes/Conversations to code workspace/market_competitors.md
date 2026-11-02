# Market competitors: "development workspace connecting meetings with code" (as of Nov 2026)

Scope note: 17 searches/fetches run on 2026-11-02. Many sources are vendor pages or third-party aggregators (summarizemeeting.com, eesel.ai, aipicks.jp, toolradar); these are flagged where used. Items stated only from prior knowledge (not re-verified in this session) are kept out of Cited Findings and listed under Inferences/Gaps with an "unverified" label.

## Q1. Competitor overlap matrix: what each product covers vs NeuraMeet concept (a)-(g)

Legend for concept parts: (a) project workspace + roles/invites, (b) built-in video + recording + live captions/transcription, (c) AI summary/decisions/AI-proposed tasks with evidence quotes + human review + optional GitHub issue, (d) Kanban linked to GitHub with PR-open -> In Review, PR-merge -> Done, (e) unified activity timeline (meetings+decisions+tasks+code), (f) decisions log, (g) project-scoped RAG assistant citing meetings+tasks+code.

### Takeaway
No single product covers all of (a)-(g) natively. Huly is the closest "all-in-one" (workspace + built-in video + live transcription + tracker + bidirectional GitHub sync, free plan) but its AI only transcribes; summaries/action items/tasks from meetings are still roadmap per its own docs. Linear, Plane and Notion cover (a)+(d) well but rely on third-party notetakers for meetings. Atlassian (Loom + Rovo + Jira) and Microsoft (Teams Facilitator + Planner) are the closest "meeting -> tracker with review" pipelines but sit in paid enterprise tiers and do not trace back from code to meeting quote.

### Cited Findings

**Huly (huly.io) — closest all-in-one**
- Open-source "everything app": issue tracking, chat, video calls, docs, time-blocking in one workspace — [openalternative](https://openalternative.co/huly); [dupple](https://www.dupple.com/tools/hulyio)
- Virtual Office on LiveKit: audio/video, screen share, meeting recording, live transcription in 40+ languages — [openapps.pro](https://openapps.pro/apps/huly) (aggregator)
- Bidirectional GitHub sync with Issues and Projects; "merge a PR on GitHub and its status flips in Huly automatically" — [toolradar](https://toolradar.com/tools/huly) (aggregator); [toolmage](https://www.toolmage.com/en/tool/huly/)
- Official docs: Hulia (AI assistant) is "limited to transcription"; it will eventually "summarize main points, create action items and documents based on your meetings, help schedule follow-ups" — no dates given — [Huly docs: live transcription](https://docs.huly.io/communication/live-transcription/)
- Transcripts are saved as chat correspondence (react/reply/bookmark) — [dupple](https://www.dupple.com/tools/hulyio)
- "Huly MetaBrain" (connected knowledge base) announced as upcoming; AI features to be charged by compute — [bestaitools](https://www.bestaitools.com/tool/huly/)
- Pricing: Common plan free, unlimited users, 10GB storage, 10GB video/audio traffic; paid tiers from $19.99/month — [dupple](https://www.dupple.com/tools/hulyio)

**Linear**
- Free plan: unlimited members, up to 250 issues, 2 teams, GitHub integration, basic AI/agent access — [aiproductivity.ai](https://aiproductivity.ai/tools/linear/); [aitoolsatlas](https://aitoolsatlas.ai/tools/linear/pricing) (aggregators)
- GitHub integration moves issue In Progress -> Done as linked PR goes drafted -> merged — [eesel.ai](https://www.eesel.ai/de/blog/linear-ai) (aggregator)
- March 2026: Linear CEO essay declaring issue tracking "dead", replaced by agentic AI; Linear Agent in beta — [aipicks.jp](https://aipicks.jp/mag/linear-ai-guide-2026) (aggregator, not primary)
- No native meeting capture; meetings come in via integrations: Granola (Zapier), Fellow, Read AI, Tactiq, Supernormal, Circleback — [Linear: Granola](https://linear.app/integrations/granola); [Linear: Read AI](https://linear.app/integrations/read-ai); [Linear: Fellow](https://linear.app/integrations/fellow); [Linear: Tactiq](https://linear.app/integrations/tactiq)
- "No native meeting-to-Linear pipeline with Granola" — [tryearmark (2026)](https://www.tryearmark.com/blog/the-best-ai-meeting-assistants-for-linear-(2026)) (competitor blog)

**Jira + Confluence + Rovo + Loom (Atlassian)**
- Loom meetings connected to a Jira space: after recording, Rovo reviews transcript and maps decisions/action items to existing work items, surfacing "a batch of suggested updates" — [Atlassian support](https://support.atlassian.com/ja/loom/docs/get-ai-suggested-work-item-updates-from-loom-meetings-in-jira/); [Atlassian blog](https://www.atlassian.com/blog/loom/turn-meetings-and-bugs-into-action)
- Requires Jira Standard/Premium/Enterprise with Rovo and Loom AI enabled — [Atlassian blog](https://www.atlassian.com/blog/loom/turn-meetings-and-bugs-into-action)
- Loom (via Rewatch acquisition) notetaker joins Zoom/Teams/Meet; auto-creates a Confluence meeting note page — [diginomica](https://diginomica.com/node/27824)
- Rovo can break a recorded planning meeting into epics/stories/tasks — [Atlassian support: create work items with Rovo](https://support.atlassian.com/ja/jira-software-cloud/docs/create-work-items-with-rovo/)
- Atlassian "AI-powered meeting notes" in Confluence went GA (2025) — [Atlassian community](https://community.atlassian.com/forums/AI-powered-Meeting-Notes-Beta/Thank-you-for-participating-AI-powered-meeting-notes-is-now-GA/ba-p/3057981)

**ClickUp**
- AI Notetaker extracts action items, creates assigned tasks after meetings, links mentioned tasks, timestamped transcripts; works with Zoom/Teams/Meet — [ClickUp AI Notetaker](https://clickup.com/brain/ai-notetaker)
- SyncUps: built-in calls with screen share, transcription, AI summary, direct task creation — [summarizemeeting](https://summarizemeeting.com/en/tool/clickup) (aggregator)
- AI Notetaker is a paid add-on (standalone or "Everything AI"), priced by meeting hours — [ClickUp help](https://help.clickup.com/hc/en-us/articles/6303101719831-Purchase-ClickUp-add-ons)

**Notion**
- AI Meeting Notes can trigger Custom Agents after summary to convert action items into tasks / update trackers — [createwith](https://www.createwith.com/tool/notion/updates/notion-ai-meeting-notes-now-triggers-custom-agents-for-automated-post-meeting-wo)
- GitHub Pull Request property in Notion databases auto-updates task status from PR status — [Notion release 2.30 (May 2023, older)](https://notion.com/releases/2023-05-31)

**Plane**
- Free cloud tier up to 12 seats, 500 AI credits/seat; Pro $6/seat/mo, Business $13/seat/mo; free self-hosted Community Edition — [everydev](https://www.everydev.ai/tools/plane); [Plane](https://plane.so/one)
- Plane AI (Ask/Build), bidirectional GitHub/GitLab sync; Intake from email/forms (no meeting intake found) — [everydev](https://www.everydev.ai/tools/plane)

**Zoom AI Companion**
- Zoom Tasks auto-detects action items from meeting summaries, chat, mail; tracked in a Workplace tab or embedded in Zoom Docs; syncs with third-party apps like Jira — [Zoom news](https://news.zoom.com/zoom-agentic-ai/); [Zoom IR](https://investors.zoom.us/news-releases/news-release-details/zoom-rolls-out-new-agentic-ai-offerings-save-time-and-drive)
- AI Companion connects to 16 third-party apps incl. Jira to assign tasks/adjust deadlines from Zoom — [UC Today](https://uctoday.com/collaboration/enterprise-connect-2025-zoom-elevates-productivity-with-45-agentic-ai-innovations)

**Microsoft Teams + Copilot**
- Facilitator agent captures decisions as tasks during the meeting, users @mention to create/assign; tasks sync to Planner; Recap tab with decisions + tasks — [Microsoft Tech Community](https://techcommunity.microsoft.com/blog/microsoft365insiderblog/keep-meetings-focused-and-productive-with-facilitator-in-teams/4456029); [Message center RM500701](https://mc.merill.net/message/RM500701)
- Project Manager Agent structures meeting tasks into Planner — [Planner blog](https://techcommunity.microsoft.com/t5/planner-blog/power-up-project-management-in-teams-with-the-project-manager/ba-p/4454813)
- No Azure DevOps work-item path from meeting recap found in sources (see Gaps).

**Google Meet + Gemini**
- "Take notes for me" captures summary, decisions, action items, transcript; Feb 2025 "next steps" assigns owners and suggests due dates; users review/edit — [Workspace Updates (Feb 2025)](https://workspaceupdates.googleblog.com/2025/02/google-meet-take-notes-for-me-next-steps.html); [Google blog](https://blog.google/products-and-platforms/products/workspace/take-notes-for-me/)
- Notes attached to Calendar event; no tracker/code linkage cited — [Google Workspace](https://workspace.google.com/solutions/ai/ai-note-taking)

**Notetakers with tracker push (Fireflies, Read.ai, tl;dv, Fathom, Spinach, Supernormal, Fellow, Tactiq, Circleback)**
- Fireflies auto-extracts action items and pushes to a chosen Jira board after every meeting; available to all users — [Fireflies Jira integration](https://fireflies.ai/integrations/project-management/jira)
- Read AI: create Jira tickets from action items (paid plans) and push to Linear with project/status — [Read AI Jira](https://www.read.ai/zh/post/read-ai-launches-jira-confluence-integration); [Linear: Read AI](https://linear.app/integrations/read-ai)
- tl;dv to Jira/Linear only via Zapier — [Zapier](https://zapier.com/apps/jira-software-cloud/integrations/tldv/255661348/add-new-tldv-notes-as-attachments-to-issues-in-jira-software-cloud)
- Spinach files Jira/Linear tickets mid-meeting; can hold drafts for review; approve/edit from Slack — [Spinach help](https://help.spinach.ai/en/articles/8593494-create-tickets-from-action-items); [Spinach](https://www.spinach.ai/content/ticket-management)
- Supernormal drafts Linear issues with title, description, acceptance criteria, priority from meeting — [Supernormal](https://www.supernormal.com/integrations/linear)
- Tactiq auto-creates Linear issues from transcripts — [Tactiq help](https://help.tactiq.io/en/articles/12085070-automatically-create-linear-issues-from-meeting-transcripts)

### Inferences
- Matrix (Y = native, P = partial/via integration or paid add-on, N = not found):

| Product | (a) workspace+roles | (b) built-in video+rec+captions | (c) AI tasks w/ evidence + review | (d) Kanban + PR->status | (e) unified timeline incl. code | (f) decisions log | (g) RAG w/ citations over meetings+tasks+code |
|---|---|---|---|---|---|---|---|
| Huly | Y | Y (LiveKit, rec, live transcription) | N (roadmap) | Y (bidirectional GitHub) | P (activity feed; code events via sync) | N | N (MetaBrain upcoming) |
| Linear | Y | N | P (via Read/Spinach/Supernormal/Circleback) | Y | P (issue activity incl. PRs, no meetings) | N | P (Linear AI over issues, not meetings) |
| Jira+Confluence+Rovo+Loom | Y | P (Loom recordings/notetaker; no native live meeting room) | Y (suggested updates, human batch review) — paid tiers | Y (Jira dev panel/smart commits) | P | P (Confluence notes) | P (Rovo over Atlassian+connectors) |
| GitHub Projects + Copilot | Y | N | N | Y (closing keywords, Projects workflows) | P (code only) | N | P (Copilot over repo, not meetings) |
| Plane | Y | N | N | Y | P | N | P (Plane AI over work items) |
| ClickUp | Y | P (SyncUps/Clips) | Y (paid add-on) | P (GitHub via integration) | P | N | P (Brain) |
| Notion | Y | N (notes capture, no room) | P (agents) | P (PR property) | N | P (manual DB) | P (Notion AI) |
| Zoom | P | Y | P (Tasks, Jira sync) | N | N | N | P (AI Companion) |
| Teams+Copilot | Y | Y | Y (Facilitator -> Planner) | N (not to GitHub) | N | P (Recap) | P (M365 Copilot) |
| Google Meet+Gemini | P | Y | P (next steps, Docs) | N | N | N | P |
| Fireflies/Read/Spinach/Supernormal/Fellow/tl;dv/Fathom/Granola/Otter | N | N (bot/desktop capture) | P-Y (push to Jira/Linear; Spinach has review) | N | N | N | P (per-meeting chat) |
- Huly is the honest "it largely exists" answer for (a)+(b)+(d): workspace + built-in video + tracker + GitHub-driven status changes, free, open source. What it lacks today (per its own docs) is (c), (f), (g) and any meeting<->code traceability.
- Atlassian and Microsoft already do (c) with human review, so "AI-proposed tasks reviewed before creation" alone is not new.
- Unverified (prior knowledge, not re-checked this session): Height announced shutdown in 2025; Multi was acquired by OpenAI (2024) and wound down; Tuple and Pop are pair-programming tools with no tracker; Swarmia, LinearB, Sleuth are engineering-metrics tools (PR/DORA analytics) with no meeting capture; Zenhub and Shortcut are GitHub-centric trackers that link PRs; Range/Hypercontext (Hypercontext reportedly acquired by Spinach) are standup/1:1 tools; Tara AI, Kollab, Avoma, Otter similar notetaker/tracker roles. Treat these as low-confidence.

### Gaps
- Could not confirm a current Huly changelog entry (2026) showing meeting summaries/action items shipped; the docs page is undated and could be stale.
- Linear "Asks" and any native Linear meeting product: no primary source found this session.
- GitHub Copilot / Projects meeting features: not searched; assumed none.
- Teams -> Azure DevOps meeting-task path: no source found.
- Slack huddles AI notes -> tasks: not verified this session.
- Did not read the user's PDF (concept taken from the brief).

## Q2. Who does meeting -> AI action items -> tracker tickets? Who requires human review? Who auto-closes on PR merge? Who links decisions to code evidence?

### Takeaway
Meeting -> tickets is a crowded, commoditised capability (Fireflies, Read, Spinach, Supernormal, Tactiq, Circleback, ClickUp, Loom/Rovo, Teams Facilitator, Zoom Tasks). PR-merge -> Done is also standard (Linear, Huly, Jira, GitHub, Notion). Nobody found links a code event back to the originating meeting quote.

### Cited Findings
- Auto-create without review by default: Fireflies pushes action items to Jira after every meeting — [Fireflies](https://fireflies.ai/integrations/project-management/jira); Tactiq auto-creates Linear issues — [Tactiq](https://help.tactiq.io/en/articles/12085070-automatically-create-linear-issues-from-meeting-transcripts); Circleback "auto-assigned issues via configurable automations" — [tryearmark](https://www.tryearmark.com/blog/the-best-ai-meeting-assistants-for-linear-(2026))
- Human review step: Loom/Rovo "suggested updates" batch — [Atlassian](https://support.atlassian.com/ja/loom/docs/get-ai-suggested-work-item-updates-from-loom-meetings-in-jira/); Spinach drafts held for review, approve in Slack — [Spinach](https://www.spinach.ai/content/ticket-management); Google Meet next steps editable — [Workspace Updates](https://workspaceupdates.googleblog.com/2025/02/google-meet-take-notes-for-me-next-steps.html); Read AI push per action item (user-initiated) — [Linear: Read AI](https://linear.app/integrations/read-ai)
- Auto status from PR: Linear (In Progress -> Done on merge) — [eesel](https://www.eesel.ai/de/blog/linear-ai); Huly (PR merge flips status) — [toolradar](https://toolradar.com/tools/huly); Notion PR property — [Notion 2.30](https://notion.com/releases/2023-05-31)
- Decision <-> code evidence: VDF AI markets a "decision traceability map" linking stories, PRs, meetings, documents and architecture decisions for audits — [vdf.ai](https://vdf.ai/use-cases/decision-traceability-map-audits/) (vendor marketing, enterprise compliance positioning, no product depth verified)
- DecisionTrace (GitHub) — student coursework project: decisions, rationale, commitments with status, AI candidate extraction with confirm/edit/reject; README does not mention meeting transcripts or GitHub PR/commit linking; 0 stars, 13 commits — [GitHub](https://github.com/wyz-water/DecisionTrace)

### Inferences
- The "evidence quote" on an AI-proposed task is partially present elsewhere (Rovo maps transcript to work items; ClickUp has timestamped transcripts), but a task carrying a verbatim quote + timestamp as its provenance, kept through to code, was not found.
- Linear's "In Review on PR open" is a Linear workflow default (prior knowledge, unverified here), so (d) is fully commoditised.

### Gaps
- Exact Linear/Jira review UX for meeting-sourced issues (do they retain a transcript link/quote?) not verified.
- VDF AI product specifics, pricing and whether it ingests meetings natively were not verified.

## Q3. Does any product close the full loop: meeting promise/decision -> task -> PR/commit -> verified done, traceable back to the meeting quote?

### Takeaway
Not found. Each segment exists separately (meeting -> task in notetakers/Rovo/Facilitator; task -> PR -> Done in Linear/Huly/Jira), and one could stitch them (e.g. Fireflies -> Jira -> GitHub). But no product found presents a single chain where a merged PR resolves a promise and the system shows "this commitment, said by X at 12:04 in meeting Y, was delivered by PR #N", nor tracks promises across later meetings as kept/open/overdue/reversed.

### Cited Findings
- Huly has video + transcription + tracker + GitHub, but AI action items from meetings are not shipped — [Huly docs](https://docs.huly.io/communication/live-transcription/)
- Rovo maps meeting decisions to existing Jira items (link is meeting -> item, not code -> meeting quote) — [Atlassian](https://support.atlassian.com/ja/loom/docs/get-ai-suggested-work-item-updates-from-loom-meetings-in-jira/)
- Closest concept matches are compliance-oriented (VDF AI) or student prototypes (DecisionTrace) — [vdf.ai](https://vdf.ai/use-cases/decision-traceability-map-audits/); [DecisionTrace](https://github.com/wyz-water/DecisionTrace)

### Inferences
- Genuinely new narrow slice (defensible claim wording: "none of the products we reviewed"): (1) quote-anchored provenance carried end to end (meeting quote -> reviewed task -> GitHub issue/PR -> merge), (2) "verified done" meaning the promise is closed by code evidence and visible from the meeting view, and (3) cross-meeting promise status (kept/open/overdue/reversed) that can use code events as one source of "kept" evidence — this extends NeuraMeet's existing Promise Ledger.
- Not new and should not be claimed: built-in video + tracker + GitHub sync (Huly), meeting -> tickets (many), human-review of AI tasks (Atlassian, Spinach, Teams), PR merge -> Done (everyone), workspace roles/invites (everyone), RAG over meetings (most notetakers).
- Risk: incumbents (Atlassian Rovo, Linear Agent, Huly MetaBrain) are each one integration away from this loop; the window is a demo/FYP-level differentiator, not a durable moat.

### Gaps
- Searches for "meeting quote -> PR" products were limited (one extended query); small startups (e.g. YC 2025-2026 batch) may exist that were not surfaced.

## Q4. Pricing / free tiers of closest competitors (zero-cost student angle)

### Takeaway
Several close competitors are free for small teams (Huly free unlimited users; Plane free up to 12 seats; Linear free 250 issues; Fireflies/Fathom free transcription), so "free" alone is not a differentiator against Huly. Meeting-to-tracker AI is mostly paid (ClickUp add-on, Atlassian Standard+ with Rovo, Read AI paid plans, Spinach paid beyond Starter, Microsoft Copilot licence).

### Cited Findings
- Huly: free Common plan, unlimited users, 10GB storage + 10GB video/audio traffic; paid from $19.99/mo; future AI billed by compute — [dupple](https://www.dupple.com/tools/hulyio); [bestaitools](https://www.bestaitools.com/tool/huly/)
- Linear: free, unlimited members, 250 issues, 2 teams, GitHub integration — [aiproductivity.ai](https://aiproductivity.ai/tools/linear/)
- Plane: free up to 12 seats; Pro $6, Business $13 per seat/mo; free self-hosted CE — [everydev](https://www.everydev.ai/tools/plane)
- Loom->Jira AI suggestions need Jira Standard/Premium/Enterprise + Rovo + Loom AI — [Atlassian](https://www.atlassian.com/blog/loom/turn-meetings-and-bugs-into-action)
- ClickUp AI Notetaker: paid add-on by meeting hours — [ClickUp help](https://help.clickup.com/hc/en-us/articles/6303101719831-Purchase-ClickUp-add-ons)
- Spinach: Starter free; Pro from $2.90/meeting hour; Business $19-29/user/mo — [creati.ai](https://creati.ai/ai-tools/spinach-io) (aggregator)
- Fireflies free unlimited transcription (rate-limited), Pro ~$10/mo; Fathom free unlimited recordings/transcripts; Read.ai free 5 meetings/mo, ~$15/mo paid; tl;dv free with 3-month storage, ~$18/seat paid; Otter free 300 min — [summarizemeeting](https://summarizemeeting.com/en/comparison/free-vs-paid) (aggregator, prices may vary by billing period)
- Read AI Jira integration only on paid plans — [Read AI](https://www.read.ai/zh/post/read-ai-launches-jira-confluence-integration)

### Inferences
- Student angle should be framed as "the full loop (meeting -> reviewed task -> GitHub -> verified done) on free tiers", since stitching the equivalent from incumbents needs at least a paid AI tier (Rovo/ClickUp AI/Copilot) or Zapier.
- GitHub Student Developer Pack (free Copilot for verified students) is relevant but was not verified this session.

### Gaps
- Primary pricing pages for Linear, Plane, Fireflies not fetched; figures come from aggregators.

## Q5. Academic work on linking meeting discussions to software artefacts

### Takeaway
There is an active but thin literature: software-meeting characterisation (ICSE 2024), lost knowledge from unlinked conversations, conversation -> issue conversion on GitHub, LLM requirements extraction from elicitation conversations, and LLM traceability across artefacts. No paper found that traces spoken meeting commitments to commits/PRs end to end — a citable research gap for an FYP.

### Cited Findings
- "Characterizing Software Maintenance Meetings: Information Shared, Discussion Outcomes" — ICSE 2024 research track; case study of 10 consecutive maintenance meetings at a healthcare software provider — [ICSE 2024](https://conf.researchr.org/details/icse-2024/icse-2024-research-track/48/Characterizing-Software-Maintenance-Meetings-Information-Shared-Discussion-Outcomes)
- "When Conversations Turn Into Work: A Taxonomy of Converted Discussions and Issues in GitHub" — [arXiv 2307.07117](https://arxiv.org/pdf/2307.07117)
- "Land of Lost Knowledge" (UCI): unlinked commits account for 5-21% of knowledge needed for future modification — [UCI](https://ics.uci.edu/~iftekha/publication/land-of-lost-knowledge-an-initial-investigation-into-projects-lost-knowledge)
- Spoken design knowledge "evaporates"; design rationale from meetings usually not captured — [UCI workshop paper](https://www.ics.uci.edu/~iftekha/pdf/W.7.pdf)
- Thesis evaluating 16 meeting summarisation approaches (incl. LLMs) on 45 software maintenance meeting topics — [eScholarship](https://escholarship.org/content/qt0j97592v/qt0j97592v_noSplash_23b8a19a890900f2ea052be3e2150dbd.pdf)
- RECOVER: LLM-based requirements extraction from stakeholder conversations (TSE) — [paper PDF](https://gianwario.vercel.app/papers/journals/TSE_RECOVER_conversation_RE.pdf)
- LLMs for requirements traceability across heterogeneous artefacts (cross-task empirical evaluation) — [arXiv 2608.21531](https://arxiv.org/pdf/2608.21531)
- Developer IRC meetings in OSS projects studied (participation, topics) — [FLOSSHub](https://flosshub.org/node/1518)
- Systematic literature review of issue-based requirement traceability — [GNU scholarworks](https://scholarworks.gnu.ac.kr/item/5b421532-3fb8-4332-b75b-b0e811ee992e)

### Inferences
- An FYP report can position the feature as operationalising "meeting -> artefact traceability" (ICSE 2024 + lost-knowledge work motivate it; GitHub conversion taxonomy and RECOVER show partial steps).

### Gaps
- Did not verify full author lists/venues for the UCI papers or the arXiv 2608 paper; no CSCW paper specifically found.

## Q6. Pakistani / local market

### Takeaway
Pakistani software houses predominantly use global tools (Jira, ClickUp, Trello, GitHub, Google Meet, Zoom); no local equivalent of an integrated meeting+code workspace was found. Evidence is thin and mostly indirect.

### Cited Findings
- IBA survey of agile PM tool adoption in Pakistani software companies (100 responses, ~20 companies) — [IBA repository](https://ir.iba.edu.pk/survey-reports-mscs/77)
- Paper: "Software Project Management and Its Tools in Practice in IT Industry of Pakistan" — [catalog record](https://vufind-test.katalog.k.utb.cz/SummonRecord/FETCH-LOGICAL-i175t-98857d6d9ad5345c2bd464f8bcf9ea2506b0f8aeb8c11a03f513b574e01ceb363)
- Technographic listings show many Pakistani IT services firms using Jira and ClickUp — [TheirStack Jira PK](https://theirstack.com/en/technology/jira/pk); [TheirStack ClickUp PK](https://theirstack.com/en/technology/clickup/pk)
- Claim that ~90% of Pakistani IT projects are outsourced (context for client-meeting-heavy workflows) — via [IBA survey summary](https://ir.iba.edu.pk/survey-reports-mscs/77) (as reported by search snippet; not verified in full text)

### Inferences
- Outsourcing-heavy software houses run frequent client calls whose commitments must be traced to delivery, which supports the "promise -> PR -> verified" angle; bilingual English/Urdu meeting handling (already in NeuraMeet) is a local differentiator no global competitor markets.
- FYP teams' tool usage (Trello/GitHub/Meet/WhatsApp) is anecdotal; no survey found.

### Gaps
- No source found on FYP team tool usage at Pakistani universities, nor any Pakistani-built competitor; IBA survey results (which tools, percentages) not read in full.
