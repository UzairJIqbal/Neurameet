import { describe, it, expect } from "vitest";
import {
  closingKeys,
  findKeys,
  isRevert,
  keyId,
  revertTarget,
} from "./github-keys";

const ids = (refs: Array<{ prefix: string; number: number }>) =>
  refs.map(keyId);

describe("findKeys", () => {
  it("finds capital keys once each, in order", () => {
    expect(ids(findKeys("NM-2 then NM-1 and NM-2 again"))).toEqual([
      "NM-2",
      "NM-1",
    ]);
  });

  it("ignores lower case unless asked, then upper cases the prefix", () => {
    expect(findKeys("nm-42-fix")).toEqual([]);
    expect(ids(findKeys("nm-42-fix", { ignoreCase: true }))).toEqual(["NM-42"]);
  });

  it("skips a prefix or number outside the allowed length", () => {
    expect(findKeys("A-1 ABCDEF-1 NM-1234567")).toEqual([]);
  });
});

describe("closingKeys", () => {
  it.each([
    "Closes NM-1",
    "closes NM-1",
    "CLOSED NM-1",
    "close NM-1",
    "Fix NM-1",
    "fixes NM-1",
    "Fixed: NM-1",
    "resolve NM-1",
    "Resolves NM-1",
    "resolved NM-1",
  ])("closes on %s", (text) => {
    expect(ids(closingKeys(text))).toEqual(["NM-1"]);
  });

  it("covers one key per word", () => {
    expect(ids(closingKeys("Closes NM-1, NM-2"))).toEqual(["NM-1"]);
    expect(ids(closingKeys("Closes NM-1, closes NM-2"))).toEqual([
      "NM-1",
      "NM-2",
    ]);
  });

  it("needs a capital key and a closing word", () => {
    expect(closingKeys("closes nm-1")).toEqual([]);
    expect(closingKeys("See NM-1")).toEqual([]);
    expect(closingKeys("Discloses NM-1")).toEqual([]);
  });
});

describe("revert parsing", () => {
  it("reads GitHub's first line only", () => {
    expect(revertTarget("Reverts acme/app.js#7\r\n\r\nbecause")).toEqual({
      repo: "acme/app.js",
      number: 7,
    });
    expect(revertTarget("Because\nReverts acme/app#7")).toBeNull();
    expect(revertTarget(null)).toBeNull();
  });

  it("treats a Revert title or a Reverts body as a revert", () => {
    expect(isRevert('Revert "Closes NM-1"', null)).toBe(true);
    expect(isRevert("Fix", "Reverts acme/app#7")).toBe(true);
    expect(isRevert("Revert the header change", "Closes NM-1")).toBe(false);
  });
});
