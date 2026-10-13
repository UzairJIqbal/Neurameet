# Verify: F9 · Multilingual → Always-English Output · updated 2026-08-26
_Steps derived from the F9 acceptance criteria (`prompts/step-F9-multilingual-translate-to-english.md`). `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Run a live EN+UR meeting → owner clicks Record → speak Urdu + English → stop → end call → recap "Generate Transcript" → the downloaded `.txt` shows Urdu as clean English (e.g. "Uzair: My name is Uzair Javaid and this product was built by me and two friends…"), with NO "My name is Zayajawir", NO Devanagari. → F9
- [ ] Take that `.txt` → Dashboard → Upload Transcript → Summary / Action Items / Category / RAG are correct. → F9
- [ ] Regression: a Punjabi- or German-spoken meeting also yields clean English (no force-English needed). → F9 (prior edge case)

## Commands
- [ ] `npm run test:unit` → 35/35 (includes F9 translation-prompt + non-English→English tests). → F9 unit
- [ ] `npx tsc --noEmit` clean; `npm run build` exit 0. → build

## Acceptance-criteria coverage
- F9 (always-English output, no garbage, no Devanagari) → manual bilingual step + Upload Transcript step.
- F9 (translation logic) → `npm run test:unit` translation-prompt + non-English→English `cleanupTranscript` tests.
- F9 (Punjabi/German edge case) → regression step.
- Build integrity → `tsc` + `build` step.
