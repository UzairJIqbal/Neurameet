import type { MeetingInsights } from "@/lib/meeting-types";

const section = (heading: string, lines: string[]) =>
  lines.length > 0 ? [heading, ...lines.map((line) => `- ${line}`), ""] : [];

/** The plain text behind Export summary (AC-70v). No route, client side only. */
export function meetingSummaryText(
  title: string,
  date: string | null,
  insights: MeetingInsights,
): string {
  return [
    title,
    ...(date ? [new Date(date).toLocaleDateString()] : []),
    "",
    "Summary",
    insights.summary ?? "",
    "",
    ...section("Key points", insights.keyPoints),
    ...section("Decisions", insights.decisions),
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
}

/** A title reduced to characters every file system accepts. */
export function summaryFileName(title: string): string {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${safe || "meeting"}-summary.txt`;
}
