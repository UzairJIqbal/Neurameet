import { describe, it, expect } from "vitest";
import {
  applyCitations,
  readSources,
  stripMarkers,
  type ProjectSource,
} from "./project-citations";

const source = (marker: string, label = `Label ${marker}`): ProjectSource => ({
  marker,
  kind: "chunk",
  label,
  href: `/meeting-intelligence/${marker}`,
});

describe("applyCitations", () => {
  it("drops a marker that is not in the source list", () => {
    const result = applyCitations("Ships Friday [S1] and Monday [S9].", [
      source("S1"),
    ]);
    expect(result.text).toBe("Ships Friday [S1] and Monday.");
    expect(result.cited.map((s) => s.marker)).toEqual(["S1"]);
  });

  it("gives an uncited source no chip", () => {
    const result = applyCitations("Ships Friday [S2].", [
      source("S1"),
      source("S2"),
    ]);
    expect(result.cited.map((s) => s.marker)).toEqual(["S2"]);
  });

  it("gives two sources with one label two chips, in marker order", () => {
    const sources = [source("S1", "Planning"), source("S2", "Planning")];
    const { cited } = applyCitations("B [S2]. A [S1].", sources);
    expect(cited.map((s) => s.marker)).toEqual(["S1", "S2"]);
  });

  it("handles a comma list and lower case, keeping only known markers", () => {
    const { text, cited } = applyCitations("Done [s1, S9, S2].", [
      source("S1"),
      source("S2"),
    ]);
    expect(text).toBe("Done [S1][S2].");
    expect(cited).toHaveLength(2);
  });

  it("leaves text that only looks like a marker alone", () => {
    const { text, cited } = applyCitations("See [Sprint 3] and [S1a].", [
      source("S1"),
    ]);
    expect(text).toBe("See [Sprint 3] and [S1a].");
    expect(cited).toEqual([]);
  });

  it("has no chips when the source list is empty", () => {
    const { text, cited } = applyCitations("Made up [S1].", []);
    expect(text).toBe("Made up.");
    expect(cited).toEqual([]);
  });
});

describe("stripMarkers", () => {
  it("removes every marker", () => {
    expect(stripMarkers("Friday [S1], Monday [S2, S3].")).toBe(
      "Friday, Monday.",
    );
  });
});

describe("readSources", () => {
  it("keeps well formed app paths only", () => {
    const list = readSources({
      sources: [
        source("S1"),
        { ...source("S2"), href: "https://evil.example" },
        { ...source("S3"), href: "//evil.example" },
        { ...source("S4"), href: "/\\evil.example" },
        { marker: "S5" },
        null,
      ],
    });
    expect(list.map((s) => s.marker)).toEqual(["S1"]);
  });

  it("returns nothing for missing or odd metadata", () => {
    expect(readSources(undefined)).toEqual([]);
    expect(readSources(null)).toEqual([]);
    expect(readSources({ sources: "nope" })).toEqual([]);
  });
});
