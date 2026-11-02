# Local (Pakistan / South Asia), Education and Accessibility Needs: Candidates for NeuraMeet's Second Signature Feature

Research date: 2026-11-02. Builds on `research_notes/NeuraMeet unique FYP feature/user_pain_points.md` and `competitor_feature_matrix.md`; facts already recorded there (Ookla rankings, 2024 shutdown losses, subsea cable cuts, Whisper Urdu WER, PTA x DeafTawk MoU, 10M deaf estimate, Fireflies Urdu support, Webex catch-up) are not repeated except where re-verified or extended.

Labels: **[VERIFIED]** = checked on a primary/vendor page in this pass; **[PRESS]** = reputable news; **[AGGREGATOR/WEAK]** = SEO/comparison site or unsourced number; **[ABSENCE]** = I searched and found nothing, which is not proof it doesn't exist.

Candidate shortlist (detailed under each question, scored in Q5):
1. **Dropout-aware "While You Were Gone" recap**, tied to each participant's actual disconnect window (from the existing `attendance_events`), plus a low-data catch-up delivered as text.
2. **Roman Urdu / Urdu-script output and chat**: summaries, action items and RAG chat answered in the language the user writes in (English, Roman Urdu, Urdu script).
3. **Viva / FYP Panel Mode**: per-question log with answer segments, student vs examiner talk share, and a "required changes" list that carries into the next panel meeting (reuses Promise Ledger).
4. **Lecture-to-Study-Pack**: bilingual quiz, flashcards and revision notes from a class meeting, with per-student participation and dropout-aware attendance for the teacher.
5. **Urdu captions plus a plain-language "easy-read" recap for deaf and hard-of-hearing users** (PSL is research-only, see Q4).

---

## Q1. Urdu-English: does any product output Roman Urdu or Urdu-script summaries, or let you chat with a meeting in Roman Urdu? Is Urdu in Google Meet speech translation or Teams Interpreter (2026)?

### Takeaway
Urdu is absent from the big platforms' 2026 real-time translation features. Teams Interpreter supports only 9 languages, with no Urdu or Hindi (verified, docs updated Oct 2026). Google Meet expanded to 63 languages on 22 Oct 2026, but Google's announcement does not list them, so Urdu is unconfirmed. Small vendors (HappyScribe, JotMe, Tactiq) market Urdu transcription and summaries. I found no major platform or notetaker that ships Roman Urdu as a summary output language, or a meeting chat that answers in Roman Urdu. That is the clearest language gap.

### Cited Findings
- **Teams Interpreter languages [VERIFIED]:** "Chinese (Mandarin), English, French, German, Italian, Japanese, Korean, Portuguese, Spanish". No Urdu or Hindi. It needs a Microsoft Copilot license (20 h/user/month) and is not supported on Microsoft Teams free. The pipeline converts speech to English text, then runs MT and TTS. Page updated 2026-10-08. — [Microsoft Learn: Manage Interpreter agent](https://learn.microsoft.com/en-us/microsoftteams/interpreter-agent-teams)
- **Google Meet speech translation [VERIFIED for tiers and dates; language list NOT published in post]:** expanded to "63 languages across web and mobile" with auto language detection. Rapid Release from 22 Oct 2026, Scheduled Release from 2 Nov 2026. Paid tiers only: Business Standard/Plus, Enterprise Standard/Plus, Google AI Pro/Ultra, AI Pro for Education, and add-ons. Session limits run from 90 minutes on base plans to 8 hours on higher tiers. The post does not enumerate the 63 languages. — [Google Workspace Updates, 22 Oct 2026](https://workspaceupdates.googleblog.com/2026/10/real-time-speech-translation-in-google-Meet-expands-to-63-languages-with-automatic-language-detection.html); press coverage — [LetsDataScience](https://letsdatascience.com/news/google-meet-expands-gemini-speech-translation-to-63-language-32d79be4), [Chrome Unboxed](https://chromeunboxed.com/google-meet-can-now-translate-63-languages-in-real-time-with-zero-manual-setup/)
- **Zoom translated captions:** 35-36 languages, including Arabic and Hindi. Urdu does not appear in the lists retrieved. This is a paid add-on. [AGGREGATOR/WEAK; Zoom's own list not fetched] — [Tactiq](https://tactiq.io/learn/what-is-zoom-translation-and-how-does-it-work); [tech.co](https://tech.co/?p=339982); [Case Western UTech](https://case.edu/utech/about/utech-news/translated-captions-now-available-zoom)
- **Urdu summaries from small vendors:** HappyScribe markets an "AI Notetaker for Smarter Meetings in Urdu" (record, transcribe, summarize) — [HappyScribe](https://www.happyscribe.com/ai-meeting-notetaker/ur). JotMe offers Urdu (Pakistan) transcription for Google Meet and summaries in 13 languages — [JotMe](https://www.jotme.io/google-meet/transcription/urdu-pakistan). Tactiq offers Urdu transcription and translation — [Tactiq](https://tactiq.io/transcribe/urdu-transcription). None of these pages advertises Roman Urdu output. [VENDOR]
- A Hugging Face demo space produces "AI-Powered Meeting Notes in Urdu", which shows hobby/academic interest but is not a product — [HF space](https://itmis007-zmeetingurdu.static.hf.space/index.html)
- CLE (Center for Language Engineering, UET Lahore) lists research on multilingual meeting datasets, including Roman Urdu, for extracting decisions, action items and summaries. This is a research project, not a shipped product. — [CLE research projects](https://cle.org.pk/research/projects)
- Background, from earlier notes: Fireflies supports Urdu (`ur`) and romanized Hindi (`hi-Latn`) transcription but does not mention Roman Urdu. Roman Urdu is the dominant informal written form, and spelling variation hurts search. — see `competitor_feature_matrix.md` Q2 and `user_pain_points.md` §3.

### Inferences
- Since F2/F3, NeuraMeet has transcribed with Groq Whisper and translated to English, so the English canonical store already exists. Generating the *output* in Roman Urdu or Urdu script with Gemini is a prompt-level change. A RAG chat that detects the query script and answers in it (Roman Urdu in, Roman Urdu out) needs no new provider. Zero-cost feasible.
- On its own it is a weak "signature" (it is essentially a language setting), but it multiplies the value of every other candidate. Best positioned as a cross-cutting enabler rather than the headline.
- Teams Interpreter converts all speech through English text, the same architecture NeuraMeet uses (Urdu to English canonical), which validates the design choice.

### Gaps
- I could not obtain Google's enumerated 63-language list, so Urdu in Meet speech translation remains **unverified**. Check the Meet Help Center language table before claiming "Meet lacks Urdu".
- No independent quality benchmark of Gemini/Groq-generated Roman Urdu output was found.
- Not verified: whether Otter, Read.ai, Fathom, tl;dv or Granola let a user choose Urdu or Roman Urdu as the summary language. **[ABSENCE]**

---

## Q2. Outages and low bandwidth: does any product offer "what you missed while disconnected" recaps tied to the actual dropout window, or an audio-only/low-data AI mode? Evidence on Pakistan connectivity and load shedding.

### Takeaway
Catch-up recaps exist: Webex "what you missed", Teams Copilot "Recap the meeting", and Meet's Gemini Q&A. They work at the meeting level or on a late-join prompt, and nothing found ties the recap to a participant's actual disconnect and reconnect timestamps, nor does any product show "you dropped 3 times; here is each gap". Pakistan's 2026 evidence is fresh and strong: evening load shedding drains telecom-tower batteries, so internet degrades at peak class hours, and regional shutdowns lasted weeks to months.

### Cited Findings
- **Teams:** Copilot "can tell you what you missed, including whether you were mentioned and any action items assigned", via Recap tab, then Copilot, then "Recap the meeting". This is generic, prompt-driven and paid (Copilot). — [Microsoft Support: Recap a Teams meeting](https://support.microsoft.com/en-us/teams/meetings-events/recap-a-teams-meeting) [VERIFIED via search snippet]
- **Zoom:** auto-reconnects after a drop, and the user "only miss[es] a few seconds to a minute". The community answer offers no recap of the gap. — [Zoom Community](https://community.zoom.com/t5/Zoom-Meetings/What-happens-if-my-Internet-pauses/m-p/30837)
- **Webex:** in-meeting "catch-up" exists (earlier notes) — [Webex Help](https://help.webex.com/en-us/article/ne2xaqq/Cisco-AI-Assistant-for-Webex-Suite)
- **Pakistan load shedding and internet, April 2026 [PRESS, trade]:** towers' backup batteries need "three to four hours of continuous electricity to fully recharge". When evening load shedding returns before that, towers run partly depleted, which causes persistent degradation on Zong and Jazz, worst in evenings. Combined with subsea-cable maintenance, this leads to "students missing online classes" and disrupted meetings for freelancers. Rural and semi-urban areas are worse off. — [CW Pakistan, 25 Apr 2026](https://cwpakistan.com/pakistan-internet-disruptions-worsen-as-evening-loadshedding-compounds-submarine-cable-maintenance-challenges/)
- Nationwide internet degradation persisted for more than 48 hours in early 2026 — [CW Pakistan](https://cwpakistan.com/nationwide-internet-degradation-persists-for-over-48-hours-across-pakistan-in-early-2026/)
- Mobile internet was suspended for nearly two months in Lower South Waziristan (reported June 2026), and students could not attend virtual classes or prepare for exams — [IANS](https://ianslive.in/pakistan-lower-south-waziristan-residents-facing-hardships-due-to-prolonged-internet-suspension--20260617115906). An Azad Kashmir blackout entered its eighth day, with students crossing into KP for access — [CW Pakistan](https://cwpakistan.com/azad-kashmir-internet-blackout-enters-eighth-day-as-students-cross-into-kp-for-access/). Balochistan disruption hurt students and freelancers — [Aaj News](https://english.aaj.tv/news/amp/330428253)
- Older but foundational: in 2020, students were arrested for demanding internet before online exams — [The Diplomat 2020](https://manage.thediplomat.com/2020/07/pakistan-arrests-students-for-demanding-internet-before-online-exams) (OLDER)

### Inferences
- **Candidate 1 (Dropout-aware recap)** is the strongest fit for NeuraMeet. B2 already writes join/leave events per participant to `attendance_events`, and F3 produces timestamped, speaker-labeled transcripts. Intersecting each participant's leave→rejoin gaps with transcript segments gives a personal recap per gap: "You were disconnected 19:42–19:51. In that time: Sir Ahmed explained X; a deadline was set for Friday; you were mentioned once." It can be in Roman Urdu (Q1), and it can be delivered as light text via the existing Resend email path (A2), which suits a user on a degraded 2G/3G link. No new provider is needed; the pieces are Gemini plus existing data.
- Panel demo: drop a participant's Wi-Fi mid-call, rejoin, and the post-meeting page shows "Your 2 gaps" with targeted recaps. The demo is visual, local and easy to understand.
- Limits: post-meeting only, unless a live per-gap recap is built (which would need live transcription, out of current scope). The claim must stay narrow: "not found in Zoom/Meet/Teams/Webex or the notetakers we reviewed".

### Gaps
- Could not verify whether Webex's catch-up or Meet's Gemini side panel automatically scope to a reconnecting user's disconnect window. Docs describe "catch up" for late joiners. **[ABSENCE, moderate confidence]**
- Did not verify Stream Video SDK's audio-only / low-bandwidth mode capabilities in this pass. Check the `stream-react` skill (VIDEO.md) before proposing an "audio-only AI mode".
- No 2025-26 PTA/PBS statistic quantifying the share of online classes lost to outages was found. The evidence is press and anecdote.

---

## Q3. Education: proxy attendance, engagement-weighted attendance, viva integrity, auto quizzes/study notes, per-student participation reports. What exists and what's missing?

### Takeaway
Engagement-weighted attendance and per-student participation are already **FULL** in education platforms (Class, Engageli). Quiz-from-meeting is **PARTIAL to FULL** via Copilot plus Microsoft Forms (paid, multi-step). The open space is **viva/oral-exam and FYP-panel structure**: proctoring vendors sell webcam and voice-biometric anti-cheating for written exams, but no meeting tool turns a viva into a per-question, evidence-linked record with a carried-forward "required changes" list. Proxy detection exists only in proctoring suites, not in meeting apps. **[ABSENCE]**

### Cited Findings
- **Class (Class Technologies, built on Zoom/Teams):** gives "a detailed, real-time view of each learner's engagement, with talk time, focus, attendance, chats, reactions... synthesized into an engagement score". Its participation view shows colour-coded gauges on each video tile, and attendance/participation are recorded automatically. — [Class](https://www.class.com/?p=56807); [1EdTech product sheet](https://www.1edtech.org/sites/default/files/media/docs/2024/Class.pdf) [VENDOR]
- **Engageli:** captures learner engagement and attendance data, flags at-risk students early, and supports "reporting or compliance needs" — [Engageli data](https://www.engageli.com/product/data) [VENDOR]
- **Microsoft:** a quiz draft can be generated from AI meeting notes via Copilot in Forms ("New Quiz" with Copilot, then post it to the Teams meeting/channel). Copilot in Forms for Education generates quizzes from files or pasted text. Paid Copilot. — [HubSite365 tutorial](https://www.hubsite365.com/en-ww/crm-pages/instant-quiz-in-teams-meetings-and-training-sessions-using-copilot-and-forms.htm) [AGGREGATOR]; [Microsoft Education blog, June 2024](https://www.microsoft.com/en-us/education/blog/?p=5882); [THE Journal](https://thejournal.com/Articles/2024/06/18/Microsoft-Beefs-up-Copilot-Education-Features-Expands-Khanmigo-for-Teachers.aspx)
- **Zoom AI Companion in universities:** summaries are used to review previous sessions, and in-meeting questions help latecomers catch up. I found no dedicated quiz-generation feature in university KB articles. — [USU Teach](https://www.usu.edu/teach/help-topics/zoom/ai-companion); [New School KB](https://services.newschool.edu/TDClient/32/Portal/KB/ArticleDet?ID=1387)
- **Proctoring and oral exams:** vendors claim voice biometrics give "96-98% accuracy in detecting impersonation", plus multi-modal face/eye/audio monitoring. They report fraud attempts in proctored corporate assessments rising from 16% (2024) to 35% (2025). **[AGGREGATOR/WEAK: vendor blogs with no linked study; do not cite the numbers as fact]** — [Eklavvya](https://www.eklavvya.com/blog/prevent-cheating-online-exams/); [ThinkExam](https://thinkexam.com/blog/online-proctoring-technology-trends-2025-what-educators-employers-must-know/)
- Pakistan-specific (from earlier notes, COVID-era): universities used viva to cross-check online objective exams, and fake/proxy attendance complaints are on record — see `user_pain_points.md` §4.

### Inferences
- **Do not pick engagement-weighted attendance as the signature.** Class/Engageli already ship it (and Read.ai covers engagement for business). NeuraMeet's C3 plus B-series attendance already gives parity.
- **Candidate 3, Viva / FYP Panel Mode**, is differentiated and very panel-relevant (the judges *are* a viva panel). From the transcript it would:
  - detect examiner questions and segment each student answer, with timestamps and quotes;
  - show the student's vs. examiner talk share per question;
  - flag "answer read aloud / long silence before answer" heuristics only as soft signals (avoid accusing; integrity claims are risky);
  - output a "Required changes" list that becomes Promise Ledger items, verified at the next supervisor or panel meeting.

  This reuses Ledger, transcripts, speaker labels and pgvector. It is zero-cost. The risk is that it overlaps the Ledger story, so frame it as an "education mode of the Ledger" plus a per-question Q&A record.
- **Candidate 4, Lecture-to-Study-Pack**, is easy to build but only partly novel (Copilot+Forms does quizzes, paid). It becomes distinctive with bilingual (Roman Urdu) output plus a per-student "you missed these topics" pack, which combines with Candidate 1.

### Gaps
- No primary source found for how Pakistani universities currently run online vivas (platform, recording, rubric) in 2025-26.
- Did not verify whether Class or Engageli offer viva-specific or oral-assessment modes. **[ABSENCE]**
- No HEC 2025-26 policy document on online/hybrid assessment was retrieved.

---

## Q4. Accessibility: PSL recognition/avatars, AI sign language in meetings, Urdu captions for deaf users.

### Takeaway
Pakistan Sign Language (PSL) has several research datasets and papers, but no production translation system, and no meeting product offers AI sign language for *any* language at scale. Teams prioritises human interpreters' video. Signapse ships AI signers for BSL/DGS on broadcast and streaming, with ASL on its roadmap. Real-time PSL is not feasible for an FYP. Urdu live captions exist only in standalone apps (Soniox). A strong caveat: many deaf Pakistanis have limited Urdu literacy, so plain-language, easy-read recaps matter more than verbatim captions.

### Cited Findings
- **PSL research and datasets:** PSL-CFRT, a multi-view benchmark dataset for continuous PSL fingerspelling recognition and translation using YOLO — [KFUPM Pure](https://pure.kfupm.edu.sa/en/publications/psl-cfrt-a-benchmark-multi-view-dataset-for-continuous-pakistani-/). PkSLMNM (manual and non-manual gestures dataset) — [Mendeley Data](https://data.mendeley.com/datasets/m3m9924p3v). Colour-glove-assisted recognition of 34 static PSL alphabets (VGG16) — [Khalifa Univ.](https://khazna.ku.ac.ae/en/publications/color-glove-assisted-recognition-of-pakistan-sign-language-alphab/). Word-level PSL video recognition (ResNet-101 spatiotemporal), IEEE Access, Jan 2025 — [DOAJ](https://doaj.org/article/58deb22009bb42919f44def06c46a648). NUML CMR PSL project — [NUML](https://numl.edu.pk/CMR/cmr-projects/6). All are isolated-sign, alphabet or fingerspelling work, not continuous conversational translation.
- An English speech/text to PSL tool with bilingual subtitles was evaluated in focus groups at a Pakistani private university as helpful for teaching deaf students — [Emerald, J. Enabling Technologies](https://www.emerald.com/insight/content/doi/10.1108/JET-06-2021-0033/full/html) (abstract via search snippet)
- **AI signers in products:** Signapse launched a live AI Digital Signer for German Sign Language with G&L (March 2026), with ASL on the roadmap; it targets broadcast and web, not meetings — [National Law Review press release](https://natlawreview.com/press-releases/real-time-accessibility-signapse-launches-ai-digital-signer-german-sign); SyncWords + Signapse offer live automatic sign language for streaming — [finanzen.net/Benzinga](https://www.finanzen.net/nachricht/aktien/syncwords-and-signapse-launch-live-automatic-sign-language-for-streaming-15196460). Sorenson showed AI ASL translation proofs-of-concept (April 2026), for pre-recorded video and text only — [Newsfile](https://www.newsfilecorp.com/release/292818/Sorenson-Communications-Unveils-AI-Sign-Language-Translation-AST-ProofsofConcept?lang=fr)
- **Meeting platforms:** Teams Sign Language Mode boosts video fidelity for signers and interpreters (human interpretation) — [ElevenForum mirror of Teams blog](https://www.elevenforum.com/t/new-sign-language-mode-feature-in-microsoft-teams.38520/latest). A Zoom community thread requests AI sign translation, which shows it is not offered — [Zoom Community](https://community.zoom.com/meetings-2/what-about-adding-sign-language-translation-capabilities-for-video-conference-using-ai-43878)
- **Urdu captions:** the Soniox App markets real-time Urdu captions for deaf and hard-of-hearing users via the phone mic, as a standalone app outside meetings — [Soniox](https://soniox.com/soniox-app/use-cases/urdu-hearing-accessibility) [VENDOR]
- **Exclusion of Urdu and regional languages from tech:** Dawn op-ed (22 Dec 2025, Khansa Maria, disability-rights activist). Pakistan has about 27 million people with disabilities who depend on tech. Windows Urdu TTS is "robotic and unclear", iPhones lack built-in Urdu TTS, and Punjabi, Pashto, Sindhi, Balochi and Saraiki are underserved. **[PRESS opinion; 27M figure unsourced in the article, so treat as weak]** — [Dawn](https://www.dawn.com/news/1960708)
- **Literacy caveat:** a 2023 study built an Urdu Reading Test (Cronbach's α 0.93) for 100 Grade-3 deaf students in government special-education institutions. Results were not visible on the abstract page — [JDSS](https://ojs.jdss.org.pk/journal/article/view/526). From earlier notes: fewer than 5% of deaf children are in school (Express Tribune).
- KICS UET Lahore runs an HEC-NRPU project on Urdu voice-enabled assistive tech for the print-disabled — [KICS](https://kics.edu.pk/web/kics-uet-works-for-disabled-community/amp/)

### Inferences
- **Reject real-time PSL** for this FYP: the datasets cover alphabets and isolated words, there is no continuous model, and it would need training (not zero-cost and not reliable). At most, PSL could be a "future work" slide citing PSL-CFRT/PkSLMNM.
- **Candidate 5 (Accessible recap)** is feasible: post-meeting Urdu-script and Roman-Urdu captions or transcript, plus an "easy-read" summary (short sentences, simple vocabulary, key points first, who said what). It serves deaf users with limited literacy and non-native English speakers. Its novelty is moderate. Live captions in Urdu inside the meeting would need streaming ASR (Groq Whisper is batch), so this is best kept post-meeting.

### Gaps
- No Pakistan Bureau of Statistics disability prevalence figure was retrieved, so the 10M deaf and 27M disabled figures are press estimates.
- Did not find whether Google Meet or Teams live captions support Urdu as a *spoken* caption language (as opposed to translation). **Unverified.**
- JDSS results (actual reading levels) were not retrieved.

---

## Q5. Which has the strongest FYP-panel demo and genuine Pakistan market potential?

### Takeaway
**Rank 1: the Dropout-aware "While You Were Gone" recap**, rendered in Roman Urdu or English. It rests on the strongest and freshest local evidence (2026 load-shedding degradation, regional blackouts), the clearest absence among competitors, it reuses data NeuraMeet already captures, and it gives a vivid live demo. **Rank 2: Viva / FYP Panel Mode**, which the judges personally relate to and which is an education extension of the Promise Ledger. Roman Urdu output should be a cross-cutting layer, not the headline.

### Cited Findings (summary matrix; sources in Q1 to Q4)
| Candidate | Evidence of need | Ships elsewhere? | Zero-cost reuse | Demo strength | Novelty claim confidence |
|---|---|---|---|---|---|
| 1. Dropout-aware recap (per-gap, per-person) | Strong, 2026 press: [CW Pakistan](https://cwpakistan.com/pakistan-internet-disruptions-worsen-as-evening-loadshedding-compounds-submarine-cable-maintenance-challenges/), [IANS](https://ianslive.in/pakistan-lower-south-waziristan-residents-facing-hardships-due-to-prolonged-internet-suspension--20260617115906) | Generic catch-up only: [Teams recap](https://support.microsoft.com/en-us/teams/meetings-events/recap-a-teams-meeting), Webex catch-up; gap-scoped recap not found | attendance_events + transcript timestamps + Gemini + Resend | High (pull the Wi-Fi live) | Medium-high **[ABSENCE]** |
| 2. Roman Urdu / Urdu output and chat | Medium (Urdu missing from [Teams Interpreter](https://learn.microsoft.com/en-us/microsoftteams/interpreter-agent-teams); Roman Urdu is common) | Urdu summaries: HappyScribe/JotMe; Roman Urdu not found | Gemini prompt only | Medium | Medium (easy to copy) |
| 3. Viva / FYP Panel Mode | Medium (COVID-era viva use, proxy complaints) | Proctoring suites only; viva record not found | Ledger + transcripts + speaker labels | High (panel relates directly) | Medium **[ABSENCE]** |
| 4. Lecture-to-Study-Pack | Medium | Partial: [Copilot+Forms quiz](https://www.hubsite365.com/en-ww/crm-pages/instant-quiz-in-teams-meetings-and-training-sessions-using-copilot-and-forms.htm) (paid) | Gemini | Medium | Low-medium |
| 5. Accessible Urdu / easy-read recap | Strong need, weak data: [Dawn](https://www.dawn.com/news/1960708) | Standalone Urdu captions: [Soniox](https://soniox.com/soniox-app/use-cases/urdu-hearing-accessibility) | Groq Whisper + Gemini | Medium | Low-medium |
| (rejected) Real-time PSL | Strong social need | No product; research only ([PSL-CFRT](https://pure.kfupm.edu.sa/en/publications/psl-cfrt-a-benchmark-multi-view-dataset-for-continuous-pakistani-/)) | Would need model training | Very high if it worked | Not feasible |
| (rejected) Engagement-weighted attendance | Real | **FULL**: [Class](https://www.class.com/?p=56807), [Engageli](https://www.engageli.com/product/data) | Already in C3/B | Low | Low |

### Inferences
- The best combined pitch is "NeuraMeet is built for Pakistani reality: connections drop and people speak Urlish." Candidate 1 is the headline, with Candidate 2 as its delivery language. Example: after a 9-minute drop at 8 pm load shedding, the student gets "Aap 8:02–8:11 disconnected thay. Is dauran: ..." That is one coherent story and is technically small.
- Market: universities (online and hybrid classes, evening programmes), freelancers on client calls during load shedding, and remote teams in KP, Balochistan and AJK during blackouts. All are users the incumbents' paid AI tiers (Copilot, Gemini AI Pro, Zoom add-on) price out.
- Claim discipline: say "none of the major platforms or notetakers we reviewed scope a recap to a participant's own disconnect window". Do not say "no product anywhere".

### Gaps
- No user survey of Pakistani students or teachers was found that measures demand for a dropout recap specifically. The FYP could run a small survey (n≈30 classmates) as primary evidence.
- Competitor absence claims rest on docs and search, not hands-on testing of Webex/Meet catch-up after a forced disconnect. A hands-on check would harden the claim.
