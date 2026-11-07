import { describe, expect, it } from "vitest";
import { breadcrumbsFor } from "./breadcrumbs";

describe("breadcrumbsFor", () => {
  it("names a section page with its sidebar label", () => {
    expect(breadcrumbsFor("/meeting-intelligence")).toEqual([
      { label: "My Meetings" },
    ]);
  });

  it("links back to the section from a deeper page", () => {
    expect(breadcrumbsFor("/projects/abc", "Apollo")).toEqual([
      { label: "My Projects", href: "/projects" },
      { label: "Apollo" },
    ]);
  });

  it("says Details until the page names itself", () => {
    expect(breadcrumbsFor("/projects/abc")[1]).toEqual({ label: "Details" });
  });

  it("never shows an invite token from the path", () => {
    expect(breadcrumbsFor("/invite/secret-token")).toEqual([
      { label: "Invitation" },
    ]);
  });
});
