// Pure, server-free helper for collapsing accidentally duplicated adjacent
// name tokens in a speaker/participant display name. Lives in `lib/` (not in
// the agent module) so client code (e.g. the attendance tracking hook) can
// import it without pulling in the server-only Supabase/Stream dependencies
// that the agent module transitively imports.

// Collapse accidentally duplicated adjacent name tokens so the transcript
// speaker label reads cleanly. A Clerk/Stream display name can repeat a
// middle/last name (e.g. "Uzair Javaid Javaid Iqbal") when first/last name
// fields overlap; we strip the duplicate so it renders as "Uzair Javaid Iqbal".
// Only collapses EXACT adjacent repeats (case-sensitive), so legitimate
// distinct tokens like "Uzair Javaid Iqbal" are untouched.
export function normalizeSpeakerName(raw: string | null | undefined): string {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  const tokens = cleaned.split(" ");
  const deduped: string[] = [];
  for (const t of tokens) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== t) {
      deduped.push(t);
    }
  }
  return deduped.join(" ");
}
