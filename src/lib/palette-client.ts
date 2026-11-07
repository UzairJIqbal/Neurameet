import { EMPTY_PALETTE, type PaletteGroups } from "@/lib/palette-types";

// The header search box and the Ctrl K listener both open the one palette.
export const OPEN_PALETTE_EVENT = "neurameet:open-palette";

export const GO_TO_LINKS = [
  { label: "Recordings", href: "/recording" },
  { label: "Previous Meetings", href: "/previous" },
  { label: "Upcoming Meetings", href: "/upcoming" },
  { label: "Prep", href: "/prep" },
  { label: "Search", href: "/search" },
];

export const searchHref = (q: string): string =>
  `/search?q=${encodeURIComponent(q)}`;

/** One title and key search, no embeddings. A failed call reads as "nothing found" to the caller via a throw. */
export async function fetchPalette(
  q: string,
  signal: AbortSignal,
): Promise<PaletteGroups> {
  const res = await fetch(`/api/projects/search?q=${encodeURIComponent(q)}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Palette search failed: ${res.status}`);
  const data = (await res.json()) as Partial<PaletteGroups>;
  return { ...EMPTY_PALETTE, ...data };
}
