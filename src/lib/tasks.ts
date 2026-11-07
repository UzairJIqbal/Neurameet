// Shared task constants and small pure helpers (spec 0004, W4). Browser safe.

export const DUPLICATE_THRESHOLD = 0.85;
export const BOARD_REFETCH_MS = 30_000;
export const BOARD_COLUMN_LIMIT = 200;
export const PROPOSALS_LIMIT = 200;
export const MAX_PROPOSALS_PER_MEETING = 50;
export const QUOTE_MAX_CHARS = 500;
export const EVIDENCE_MAX_CHARS = 2000;
export const EMBED_TIMEOUT_MS = 10_000;

export const TASK_TITLE_MAX = 200;
export const TASK_DESCRIPTION_MAX = 5000;
export const TASK_COMMENT_MAX = 2000;
/** A drop gap smaller than this makes the server renumber the column. */
export const POSITION_MIN_GAP = 1e-6;

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "completed",
  "blocked",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  completed: "Completed",
  blocked: "Blocked",
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" && TASK_STATUSES.includes(value as TaskStatus)
  );
}

// AC-70o: a person sets priority. The AI never guesses one.
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function isTaskPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === "string" && TASK_PRIORITIES.includes(value as TaskPriority)
  );
}

export function taskKey(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

/** "NM-12" (this project's prefix, any case) or "12" → 12; anything else → null. */
export function parseTaskKeyQuery(q: string, prefix: string): number | null {
  const trimmed = q.trim();
  const match = /^(?:([A-Za-z]{2,5})-)?(\d{1,9})$/.exec(trimmed);
  if (!match) return null;
  if (match[1] && match[1].toUpperCase() !== prefix.toUpperCase()) return null;
  const n = Number(match[2]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Position for a card dropped between two neighbours (null = column edge). */
export function midpointPosition(
  before: number | null,
  after: number | null,
): number {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/** True when two neighbouring positions are too close to split again. */
export function needsRenumber(a: number, b: number): boolean {
  return Math.abs(a - b) < POSITION_MIN_GAP;
}

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export type BoardCard = { id: string; status: string; position: number };

/** One column's cards in board order (position, then the caller's order). */
export function columnCards<T extends BoardCard>(
  cards: T[],
  status: string,
): T[] {
  return cards
    .filter((c) => c.status === status)
    .sort((a, b) => a.position - b.position);
}

/**
 * The position a card gets when dropped at `index` of `status`, computed
 * against that column without the card itself.
 */
export function dropPosition(
  cards: BoardCard[],
  cardId: string,
  status: string,
  index: number,
): number {
  const column = columnCards(cards, status).filter((c) => c.id !== cardId);
  const before = column[index - 1]?.position ?? null;
  const after = column[index]?.position ?? null;
  return midpointPosition(before, after);
}
