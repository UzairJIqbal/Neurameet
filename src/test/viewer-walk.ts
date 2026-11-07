// Test helper: walks a whole JSON response and returns the path of every field a
// Viewer must never receive with a value (spec 0004 AC-62).

const FORBIDDEN = new Set([
  "quote",
  "speaker",
  "lineNumber",
  "line_number",
  "quoteSpeaker",
  "quoteLine",
  "prTitle",
  "repoFullName",
  "prNumber",
  "prUrl",
  "completionEvidence",
  "pr",
]);

export function viewerLeaks(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, i) => viewerLeaks(entry, `${path}[${i}]`));
  }
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const here = `${path}.${key}`;
    if (FORBIDDEN.has(key) && entry !== null && entry !== undefined)
      return [here];
    return viewerLeaks(entry, here);
  });
}

/** True when a select list asks for one of the hidden columns. */
export const HIDDEN_COLUMNS =
  /\b(quote|quote_language|speaker|line_number|quote_speaker|quote_line|pr_title|repo_full_name|pr_number|pr_url|completion_evidence)\b/;
