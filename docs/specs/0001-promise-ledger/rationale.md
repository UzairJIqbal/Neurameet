# 0001. Promise Ledger: rationale

## Context

NeuraMeet already turns a transcript into a summary, action items, a category, and pgvector chunks for chat. Each meeting stands alone. Nothing tells you, three meetings later, that a promise was never kept or that a decision was quietly undone.

The Promise Ledger was chosen on 2026-10-30 from `reports/NeuraMeet unique FYP feature.md` as the signature feature. It must stay zero cost (Gemini, Groq, Supabase pgvector), work on bilingual Urdu English speech, and be measurable for the FYP.

Constraints found in the code:
- Transcripts are plain `Speaker: text` lines with no timestamps.
- `/api/ai/process` caps input at 16000 characters and already does one structured extraction call with a Gemini to Groq fallback.
- Embeddings are Gemini only, 768 dims. Groq has no embedding fallback.
- The client chains process, then embed.
- New uploads set `started_at` to now, which would break relative due dates for older meetings.

**Premise note.** The research report proposed timestamps as evidence. Transcripts carry none, so this spec uses the exact quote plus speaker plus a server computed line number instead.

## Options considered

**Where extraction runs**
- *Extend the existing process call* (chosen). One LLM call, one place that owns extraction, no duplicate prompt.
- *A separate ledger extraction call.* Cleaner output, but doubles the quota use and duplicates the transcript load.

**How matching works**
- *Transcript against top open items* (chosen). Proof of completion ("survey bhej diya tha") is not itself a promise, so it would never be extracted as an item. Comparing the whole new transcript to earlier items catches it.
- *Item to item matching.* Simpler, but misses the most common kind of evidence.

**When matching runs**
- *A new route chained after embed* (chosen). It needs this meeting's chunks to rank candidates, and its failure stays isolated from process and embed.
- *Inside process.* Chunks do not exist yet at that point, and a failure would mix with the summary result.

**Who decides the status**
- *AI suggests, owner confirms* (chosen). Keeps false positives visible and correctable, and gives clean labelled data.
- *AI decides.* Faster, but one wrong "reversed" would damage trust in the whole feature.

**Overdue**
- *Computed on read from the client date* (chosen). No cron job, no time zone drift.
- *Stored and updated by a job.* Needs a scheduler the free stack does not have.

**Evidence**
- *Exact quote, speaker, line number* (chosen), verified by the server so a hallucinated quote never reaches the screen.
- *Timestamps.* Not available in stored transcripts.

## Rationale

Extending what exists keeps the feature small, cheap, and consistent with the Extend build approach. The quote check plus the confidence threshold plus owner review give three layers against false positives, which matters most for a feature whose whole value is trust. Splitting matching into its own owner only route keeps failures isolated and lets you rerun it with "Check again". Computing overdue on read avoids any background job. The eval script reuses the production judge, so the numbers you report at the viva describe the code that actually runs.
