import { describe, it, expect } from "vitest";
import {
  columnCards,
  dropPosition,
  isIsoDate,
  midpointPosition,
  needsRenumber,
  parseTaskKeyQuery,
} from "./tasks";

describe("parseTaskKeyQuery", () => {
  it("reads this project's key in any case, or a bare number", () => {
    expect(parseTaskKeyQuery("NM-12", "NM")).toBe(12);
    expect(parseTaskKeyQuery(" nm-7 ", "NM")).toBe(7);
    expect(parseTaskKeyQuery("42", "NM")).toBe(42);
  });

  it("ignores another prefix, zero, and plain text", () => {
    expect(parseTaskKeyQuery("AB-12", "NM")).toBeNull();
    expect(parseTaskKeyQuery("0", "NM")).toBeNull();
    expect(parseTaskKeyQuery("fix login", "NM")).toBeNull();
  });
});

describe("midpointPosition and needsRenumber", () => {
  it("splits neighbours and steps past the edges", () => {
    expect(midpointPosition(null, null)).toBe(1);
    expect(midpointPosition(null, 3)).toBe(2);
    expect(midpointPosition(3, null)).toBe(4);
    expect(midpointPosition(1, 2)).toBe(1.5);
  });

  it("flags neighbours closer than the minimum gap", () => {
    expect(needsRenumber(1, 1 + 1e-7)).toBe(true);
    expect(needsRenumber(1, 1.5)).toBe(false);
  });
});

describe("isIsoDate", () => {
  it("accepts real dates only", () => {
    expect(isIsoDate("2026-11-03")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("03/11/2026")).toBe(false);
    expect(isIsoDate(20261103)).toBe(false);
  });
});

describe("columnCards and dropPosition", () => {
  const cards = [
    { id: "a", status: "todo", position: 2 },
    { id: "b", status: "todo", position: 1 },
    { id: "c", status: "todo", position: 3 },
    { id: "d", status: "blocked", position: 1 },
  ];

  it("returns one column in position order", () => {
    expect(columnCards(cards, "todo").map((c) => c.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("places a card between its new neighbours, ignoring itself", () => {
    // Move c to the top of todo.
    expect(dropPosition(cards, "c", "todo", 0)).toBe(0);
    // Move b between a and c.
    expect(dropPosition(cards, "b", "todo", 1)).toBe(2.5);
    // Drop d at the end of todo.
    expect(dropPosition(cards, "d", "todo", 3)).toBe(4);
    // Drop into an empty column.
    expect(dropPosition(cards, "a", "in_review", 0)).toBe(1);
  });
});
