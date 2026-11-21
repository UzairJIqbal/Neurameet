// Quote matching against a transcript, shared by proposal review (W4).

// Shortest normalised quote we accept, so a one word "ok" can't match anywhere.
const MIN_QUOTE_CHARS = 3;
// "Ali: ..." / "Sara Khan: ..." — a short label containing a letter, then a colon.
const SPEAKER_PREFIX = /^\s*([^:\n]{1,60}?)\s*:\s*/u;

export function normalizeForMatch(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function speakerLabel(line: string): string | null {
  const match = SPEAKER_PREFIX.exec(line);
  if (!match) return null;
  const label = match[1].trim();
  return /\p{L}/u.test(label) ? label : null;
}

export function stripSpeakerPrefix(quote: string): string {
  const label = speakerLabel(quote);
  return label ? quote.replace(SPEAKER_PREFIX, "") : quote;
}

export interface QuoteLocation {
  lineNumber: number;
  speaker: string | null;
}

/** 1 based line of `rawText` containing `quote` (case and whitespace insensitive). */
export function findQuoteLine(
  rawText: string,
  quote: string,
): QuoteLocation | null {
  const needle = normalizeForMatch(stripSpeakerPrefix(quote));
  if (needle.length < MIN_QUOTE_CHARS) return null;

  const lines = rawText.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i++) {
    if (normalizeForMatch(lines[i]).includes(needle)) {
      return { lineNumber: i + 1, speaker: speakerLabel(lines[i]) };
    }
  }
  return null;
}

/** Every 1 based line of `rawText` containing `quote`, in order. */
export function findQuoteLines(
  rawText: string,
  quote: string,
): QuoteLocation[] {
  const needle = normalizeForMatch(stripSpeakerPrefix(quote));
  if (needle.length < MIN_QUOTE_CHARS) return [];

  const matches: QuoteLocation[] = [];
  const lines = rawText.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i++) {
    if (normalizeForMatch(lines[i]).includes(needle)) {
      matches.push({ lineNumber: i + 1, speaker: speakerLabel(lines[i]) });
    }
  }
  return matches;
}
