# 0003. Tasdeeq, Verified Minutes: rationale

## Context

NeuraMeet already writes AI minutes (summary, key points, decisions, action items) from one structured Gemini call with Groq as fallback. Today only the owner sees them, nobody confirms them, and nothing shows which transcript lines a minutes line came from. If the AI puts a promise in the wrong mouth or drops an objection, the record is simply wrong, and the person affected may never notice.

Pakistan's official minutes practice records decisions, records an individual member's view when they ask for it, and has members confirm the minutes (basis: the third research pass, `reports/NeuraMeet third signature feature.md`). The research found that none of the meeting apps or AI notetakers we reviewed let each attendee confirm, correct, or record their own view against the AI minutes and then seal the result. Board portal software and evidence sealing tools such as TrueScreen show that confirmation and sealing are valued, but they are separate from AI minutes.

Forces: the zero cost rule (no new provider, no extra paid service, free tier AI quota), serverless routes with no shared memory and no cron, a single AI call capped at 16000 transcript characters, guests without Clerk accounts, recorded transcripts cleaned to English, the existing reprocess flow that deletes and rewrites insights and action items, and the claim wording rule ("tamper evident", never "legally binding").

If nothing is decided, the AI minutes stay unverified and can be silently overwritten on the next reprocess, which undercuts the Promise Ledger that depends on them.

## Options considered

1. **Extend the one extraction call, locate quotes on the server, attest per line, signed chained seal (chosen).** Pros: no extra AI request, evidence reuses `findQuoteLine` from the Promise Ledger, the seal is plain Node `crypto`. Cons: the extraction output gets bigger, and a quote the model paraphrased is lost (the line shows as unsupported).
2. **A second grounding AI call after extraction.** Pros: cleaner evidence and a chance to recover paraphrased quotes. Cons: doubles quota use on the free tier, adds a second failure point, and the matcher already exists.
3. **Owner only approval (one "Approve minutes" button, then a hash).** Pros: least code, no claims or quorum. Cons: it is what existing tools already do; it misses the attendee's own voice, which is the point of the feature.
4. **Anchor the hash on a public timestamping service or a blockchain.** Pros: verification no longer trusts the server. Cons: a new external service, failure modes outside the project's control, and it pushes the claim toward "legally binding", which the project must not make.

Sub decisions (each confirmed with you, runner up in brackets):
- **Minutes scope:** summary points, key points, decisions, action items [decisions only].
- **Attesters:** owner plus signed in attendees, frozen at open [everyone including guests, which has no reliable identity].
- **Actions:** Confirm, Correct with a note beside the AI text, Record my view [free text edits, which would hide what the AI said].
- **Attribution:** evidence speaker matches your claimed label, or the action item assignee matches [AI assigned owner per line, which is another guess].
- **Speaker claim:** suggested by name, confirmed by you, assigned by the owner otherwise, locked once answered [automatic matching, which is wrong for nicknames and "Speaker 1"].
- **Deadline and quorum:** owner picks 3 or 7 working days, quorum is the owner plus a majority, owner seals by hand [auto seal by cron, which needs a scheduler the free setup does not have].
- **Freeze:** block reprocessing while a review exists, cancel to unfreeze [versioned drafts, which adds a history model nobody asked for].
- **Changes:** latest answer wins until the seal [full answer history].
- **Seal:** SHA-256 plus a chain to the owner's previous seal plus Ed25519 [hash only, which anyone with database access could recompute].
- **Verify:** public by link, result only [signed in only, which blocks outside readers of the PDF].
- **Coverage and Urdu:** an honest banner and honest labels [hiding the 16000 character cap].

## Rationale

The feature's value is the attendee's voice on a record they can later trust, so the design spends its effort there (claims, attribution, answers, views) and keeps the AI side to what already runs. Extending the existing call rather than adding one respects the zero cost rule and the free tier quota, and reusing `findQuoteLine` means evidence is verbatim or absent, never invented. An unsupported flag is more honest than a second call that might make a paraphrase look like proof.

Freezing on review open is the simplest way to make "reprocessing never overwrites minutes" true. Versioning would let the owner reprocess freely, but then attendees would be confirming a moving target. Cancel keeps an escape hatch while nothing is sealed.

The seal stores the full bundle next to the live rows. That lets verify catch two different attacks: editing the bundle (hash and signature fail) and editing the live rows the UI shows (live comparison fails). The chain to the previous seal makes deleting or swapping one seal visible in the owner's history. Ed25519 through Node `crypto` needs no package and no service. The honest limit, that the server holds the key, is written into Consequences so the panel claim stays "tamper evident".

## References

**Project sources**
- `reports/NeuraMeet third signature feature.md` (chosen feature, claim wording, evaluation plan)
- `research_notes/NeuraMeet third signature feature/codebase_feasibility.md`, `competitor_gaps.md`, `research_and_local_needs.md`
- `docs/scope/scope.md`, row 19
- `docs/specs/0001-promise-ledger/index.md` (`findQuoteLine`, extraction inside `/api/ai/process`)
- `docs/specs/0002-live-ledger/index.md` (agreement tallies, route and error shape conventions)
- `src/app/api/ai/process/route.ts`, `src/agent/types.ts`, `src/agent/ledger.ts`
- `src/app/api/attendance/report/route.ts` (pdf-lib pattern), `src/lib/email.ts` (Resend)
- `src/middleware.ts` (why the verify page stays out of `isPublicRoute`)
- `AGENTS.md` (zero cost rule, API contract rule, secret list, loading state rule)

**Practices and standards**
- Content hashing with SHA-256 over a canonical JSON form (sorted keys, fixed array order)
- Hash chaining (each record carries the previous record's hash)
- Ed25519 digital signatures
- Conditional updates on a status column for race safe state changes
- Cohen's kappa for agreement between two raters
