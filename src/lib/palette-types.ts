export type PaletteRow = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type PaletteGroups = {
  projects: PaletteRow[];
  tasks: PaletteRow[];
  meetings: PaletteRow[];
  decisions: PaletteRow[];
};

export const EMPTY_PALETTE: PaletteGroups = {
  projects: [],
  tasks: [],
  meetings: [],
  decisions: [],
};
