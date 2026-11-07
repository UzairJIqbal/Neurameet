// Citation rules for the project assistant (spec 0004, AC-66). Shared by the
// route and the panel, so it carries no server only imports.

export type ProjectSourceKind = "chunk" | "task" | "item";

export type ProjectSource = {
  marker: string;
  kind: ProjectSourceKind;
  label: string;
  href: string;
};

// One marker or a comma list: [S1], [s1], [S1, S2]. "[Sprint 3]" is left alone.
const MARKER_GROUP = /[ \t]*\[\s*S\d+(?:\s*[,;]\s*S\d+)*\s*\]/gi;

/** Removes every marker, for old answers whose numbers no longer apply. */
export function stripMarkers(text: string): string {
  return text.replace(MARKER_GROUP, "");
}

/**
 * Keeps the markers that exist in the source list and drops all others. The
 * cited list holds one entry per source in marker order, even when two sources
 * share a label.
 */
export function applyCitations(
  text: string,
  sources: ProjectSource[],
): { text: string; cited: ProjectSource[] } {
  const known = new Set(sources.map((source) => source.marker));
  const seen = new Set<string>();

  const cleaned = text.replace(MARKER_GROUP, (group) => {
    const kept = (group.match(/S\d+/gi) ?? [])
      .map((marker) => marker.toUpperCase())
      .filter((marker) => known.has(marker));
    kept.forEach((marker) => seen.add(marker));
    if (kept.length === 0) return "";
    const lead = group.match(/^[ \t]*/)?.[0] ?? "";
    return `${lead}${kept.map((marker) => `[${marker}]`).join("")}`;
  });

  return {
    text: cleaned,
    cited: sources.filter((source) => seen.has(source.marker)),
  };
}

const isAppPath = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("/") && !/^\/[/\\]/.test(value);

/** Reads `{ sources }` from message metadata, which arrives untyped. */
export function readSources(metadata: unknown): ProjectSource[] {
  const list = (metadata as { sources?: unknown } | null | undefined)?.sources;
  if (!Array.isArray(list)) return [];
  return list.filter((entry): entry is ProjectSource => {
    const source = entry as Partial<ProjectSource> | null;
    return (
      typeof source?.marker === "string" &&
      typeof source.label === "string" &&
      isAppPath(source.href)
    );
  });
}
