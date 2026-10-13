/**
 * Coerce a model supplied due date into a Postgres `date` safe `YYYY-MM-DD`
 * string, or `null` when it cannot be parsed into a plausible date.
 *
 * Groq's free tier occasionally emits malformed values (e.g. "October Friday")
 * that would fail the `action_items.due_date` insert. We never throw here so a
 * single bad date cannot block the whole action items / follow ups pipeline.
 */
export function normalizeDueDate(
  raw: string | null | undefined,
): string | null {
  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    console.warn(
      `normalizeDueDate: unparseable date "${raw}", storing null`,
    );
    return null;
  }

  const year = parsed.getFullYear();
  if (year < 2000 || year > 2100) {
    console.warn(
      `normalizeDueDate: out of range year ${year} for "${raw}", storing null`,
    );
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}
