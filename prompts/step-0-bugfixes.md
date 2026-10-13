# Step 0 — Bug Fixes

## Fix 1: Token timestamp in `stream.actions.ts`
**File:** `src/actions/stream.actions.ts`

**Bug:** Line 18 uses `Math.round(new Date().getDate() / 1000)`. `getDate()` returns day-of-month (1-31), not epoch seconds.

**Fix:** Replace with `Math.floor(Date.now() / 1000) - 60`.

---

## Fix 2: Remove sonner
**File:** `src/components/ui/sonner.tsx`

**Bug:** Sonner component exists but is never imported anywhere in the project. Codebase uses `react-hot-toast` exclusively. Dead code that violates the "no sonner" rule.

**Fix:** Delete `src/components/ui/sonner.tsx`. Check `package.json` for `sonner` dependency — remove if present.

---

## Fix 3: Mic switch fallthrough in `MeetingSetup.tsx`
**File:** `src/components/MeetingSetup.tsx`

**Bug:** The microphone switching `useEffect` (line 130-158) does not re-run when `audioType` changes from the dropdown. The effect's dependency array includes `audioType`, but the ternary chain at lines 144-149 has no explicit "voice calls" case — it falls through to `VOICE_STANDARD_UNSPECIFIED`. While the fallback value is correct, the effect may not properly re-trigger on every audioType change due to stale closure capture.

**Fix:** Restructure the ternary chain to an explicit if/else-if with explicit handling for all three cases (`voice calls`, `podcasts`, `music calls`). This makes the intent clear and eliminates any ambiguity about fallthrough behavior.
