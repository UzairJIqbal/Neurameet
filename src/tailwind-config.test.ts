// @vitest-environment node
/**
 * P13.10 regression guard: the shared ui/dropdown-menu.tsx references Tailwind's
 * shadcn semantic utilities (bg-popover, text-popover-foreground, bg-accent,
 * text-accent-foreground, bg-muted). Those utility classes are only generated
 * when the corresponding color keys exist in tailwind.config.ts. If they're
 * missing, dropdowns render unstyled across Settings, MeetingSetup, and the
 * intelligence tabs. Lock the keys in so the gap can't silently regress.
 *
 * We assert against the parsed theme.extend.colors entries, so a key that is
 * pruned or pointed at the wrong CSS variable fails fast.
 */
import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

const colors = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;

function expectToken(key: string) {
  expect(colors[key]).toBe(`hsl(var(--${key}))`);
}

describe("tailwind.config.ts — shadcn token keys (P13.10)", () => {
  it("defines the popover semantic color keys", () => {
    expectToken("popover");
    expectToken("popover-foreground");
  });

  it("defines the accent semantic color keys", () => {
    expectToken("accent");
    expectToken("accent-foreground");
  });

  it("defines the muted semantic color keys", () => {
    expectToken("muted");
    expectToken("muted-foreground");
  });
});
