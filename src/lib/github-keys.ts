// Pure parsing of task keys and revert lines in pull request text (spec 0004,
// W5). Only the branch ignores case, and the branch never closes a task.

export type TaskKeyRef = { prefix: string; number: number };

const KEY_SOURCE = "\\b([A-Z]{2,5})-(\\d{1,6})\\b";

// Case insensitive on the word only, so "closes nm-1" names no key.
const CLOSING_RE =
  /\b([Cc][Ll][Oo][Ss][Ee][SsDd]?|[Ff][Ii][Xx](?:[Ee][SsDd])?|[Rr][Ee][Ss][Oo][Ll][Vv][Ee][SsDd]?)\b:?\s+([A-Z]{2,5})-(\d{1,6})\b/g;

const REVERT_RE = /^Reverts ([\w.-]+\/[\w.-]+)#(\d+)/;

export const keyId = (ref: TaskKeyRef): string => `${ref.prefix}-${ref.number}`;

/** Unique keys in order of appearance, with the prefix upper cased. */
export function findKeys(
  text: string,
  opts?: { ignoreCase?: boolean },
): TaskKeyRef[] {
  const re = new RegExp(KEY_SOURCE, opts?.ignoreCase ? "gi" : "g");
  const seen = new Set<string>();
  const keys: TaskKeyRef[] = [];
  for (const match of text.matchAll(re)) {
    const ref = { prefix: match[1].toUpperCase(), number: Number(match[2]) };
    if (seen.has(keyId(ref))) continue;
    seen.add(keyId(ref));
    keys.push(ref);
  }
  return keys;
}

/** One closing word covers one key: "Closes NM-1, NM-2" closes only NM-1. */
export function closingKeys(text: string): TaskKeyRef[] {
  const seen = new Set<string>();
  const keys: TaskKeyRef[] = [];
  for (const match of text.matchAll(CLOSING_RE)) {
    const ref = { prefix: match[2], number: Number(match[3]) };
    if (seen.has(keyId(ref))) continue;
    seen.add(keyId(ref));
    keys.push(ref);
  }
  return keys;
}

/** The PR that GitHub's Revert button names on the body's first line. */
export function revertTarget(
  body: string | null,
): { repo: string; number: number } | null {
  if (!body) return null;
  const firstLine = body.split(/\r?\n/, 1)[0];
  const match = REVERT_RE.exec(firstLine);
  return match ? { repo: match[1], number: Number(match[2]) } : null;
}

export function isRevert(title: string, body: string | null): boolean {
  return title.startsWith('Revert "') || revertTarget(body) !== null;
}
