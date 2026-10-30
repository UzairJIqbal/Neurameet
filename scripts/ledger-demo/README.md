# Promise Ledger demo seed

Three short Roman Urdu plus English meetings that tell one story across time:

- The team decides to host on **Vercel**, then reverses it a week later by moving to **AWS**.
- Ali says "Main Friday tak survey bhej dunga". He misses it (the promise goes overdue), then sends it in the third meeting (kept).

You upload them through the normal Upload Transcript modal, oldest first, with backdated meeting dates. Matching only looks at items from meetings dated earlier, so the order and the dates matter.

## Before you start

- We recommend a fresh account or one with no other meetings about hosting or surveys, so the matches stay clean.
- Each upload runs process, embed, and match, so give each one a minute before the next. If Gemini is busy, the app falls back to Groq on its own.

## Steps

1. **Upload `01-launch-planning.txt`.** Title "Launch planning", Meeting date **2026-10-01** (a Thursday).
   Open its Ledger tab. You should see the Vercel decision, Ali's survey promise (due **2026-10-02**, the Friday after the meeting date), Hina's landing page promise (due Monday 2026-10-05), and Bilal's monitoring promise. Because today is past 2026-10-02, Ali's promise already shows **Overdue**.
2. **Upload `02-infra-review.txt`.** Title "Infra review", Meeting date **2026-10-08**.
   Its Ledger tab shows a red reversal card and a count badge on the tab label: the Vercel decision was **reversed**, with the quote "Vercel drop kar rahe hain, hum AWS pe shift karenge". Hina's landing page and Bilal's dashboard should come up as **kept**. Ali's survey gets no match (he said it is not sent yet), so on meeting 1 it stays Overdue. Confirm the matches you agree with.
3. **Upload `03-launch-check.txt`.** Title "Launch check", Meeting date **2026-10-15**.
   Its Ledger tab suggests **kept** for Ali's survey, with the quote "Survey bhej diya hai, 52 responses aa chuke hain". Confirm it. Back on meeting 1, the survey promise now shows Kept instead of Overdue.
4. **Optional, prep hook.** Open Meeting Prep with a title like "Launch retro" and the note "survey results and hosting". Any item still open (for example the AWS migration plan from meeting 2) appears under "Open promises and decisions".

## If a match is missing

The judge only stores verdicts at confidence 0.7 or above, with a quote it can find in the transcript. Use **Check again** on the Ledger tab to rerun matching. A missed match is a real data point for the eval, not something to hide.
