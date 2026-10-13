// @vitest-environment node
/**
 * P13.10 regression guard: the shared ui/dropdown-menu.tsx references Tailwind's
 * shadcn semantic utilities (bg-popover, text-popover-foreground, bg-accent,
 * text-accent-foreground, bg-muted). Those utility classes are only generated
 * when the corresponding color keys exist in tailwind.config.ts. If they're
 * missing, dropdowns render unstyled across Settings, MeetingSetup, and the
 * intelligence tabs. Lock the keys in so the gap can't silently regress.
 *
 * We assert against the raw source text (not the resolved config object) so the
 * test stays environment-agnostic and still fails fast if a key is pruned.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(process.cwd(), "tailwind.config.ts"), "utf8");

describe("tailwind.config.ts — shadcn token keys (P13.10)", () => {
  it("defines the popover semantic color keys", () => {
    expect(src).toContain('"popover"');
    expect(src).toContain('"popover-foreground"');
  });

  it("defines the accent semantic color keys", () => {
    expect(src).toContain('"accent"');
    expect(src).toContain('"accent-foreground"');
  });

  it("defines the muted semantic color keys", () => {
    expect(src).toContain('"muted"');
    expect(src).toContain('"muted-foreground"');
  });
});
