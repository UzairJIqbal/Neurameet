# Tasdeeq evaluation (spec 0003, AC-21)

Use this sheet to measure whether Verified Minutes catches more errors than the host checking alone. Fill one copy per run. No LLM call is part of the scoring.

## Run details

| Field | Value |
|---|---|
| Date | |
| Meeting id | |
| Transcript source (upload or recording) | |
| Languages in the transcript | |
| Attesters (M, owner included) | |
| Errors planted (K) | |
| Seed answer key file | `reports/tasdeeq-seed-<meetingId>.json` |

## How to run it

1. Hold a short demo meeting with you plus at least two signed in attendees, then upload a bilingual (English and Urdu) transcript and process it.
2. Open the review in the Minutes tab (3 day deadline).
3. Run a dry run first: `npx tsx scripts/tasdeeq-seed.ts <meetingId> 3`. Check the plan, then run it again with `--write`.
4. **Host alone pass.** Before anyone else answers, the host reads the minutes alone and notes every line they think is wrong. Write the time taken. Do not answer in the app yet.
5. **Tasdeeq pass.** Each attendee (host included) claims their speaker name, then answers their lines (Confirm, Correct, or Record my view) and presses Finish my review. Note each person's start and finish time.
6. Score both passes against the answer key below.

## 1. Catch rate

A planted error counts as caught when someone corrects that line, or records a view on it that names the problem.

| # | Line | Kind | Caught by host alone? | Caught in Tasdeeq? | By whom |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

| Measure | Host alone | Tasdeeq |
|---|---|---|
| Errors caught (of K) | | |
| Catch rate (caught ÷ K) | | |
| False alarms (lines flagged that were not planted and were right) | | |

## 2. Time to confirm

| Attester | Lines attributed | Start | Finished | Minutes taken |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |

Median minutes per attester: ____. Time from open review to seal: ____.

## 3. Dissent suggestion precision

For every dissent suggestion shown, two people (raters) decide on their own whether the transcript really shows that person objecting. Then compare.

| Suggestion | Speaker | Rater A (real objection: yes/no) | Rater B (yes/no) | Attendee adopted it? |
|---|---|---|---|---|
| | | | | |
| | | | | |

**Precision** = suggestions both raters marked yes ÷ all suggestions shown = ____.

**Cohen's kappa** for the two raters:

* a = both yes, b = A yes and B no, c = A no and B yes, d = both no, n = a + b + c + d
* Observed agreement p_o = (a + d) ÷ n
* Chance agreement p_e = ((a + b)(a + c) + (c + d)(b + d)) ÷ n²
* κ = (p_o − p_e) ÷ (1 − p_e)

| a | b | c | d | n | p_o | p_e | κ |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

Read κ as: below 0.2 slight, 0.2 to 0.4 fair, 0.4 to 0.6 moderate, 0.6 to 0.8 substantial, above 0.8 near perfect.

## 4. Seal and verify

| Check | Result |
|---|---|
| Status text on the sealed tab | |
| Same status text in the email and PDF | |
| Verify page shows intact | |
| Pasted hash from the email matches | |
| After a manual edit to one `minutes_lines` row in a copy, verify shows altered | |

## 5. Zero cost check (AC-22)

| Check | Result |
|---|---|
| No new dependency besides those already in `package.json` before this feature (pdf-lib, resend) | |
| No new AI provider or extra LLM call | |
| Emails sent through Resend free tier only | |

## Notes

Write anything surprising here (a misattribution from a guest label, an Urdu quote that drew as `?` in the PDF, and so on).

Wording rule: describe the seal as "tamper evident". Never call the minutes "legally binding".
