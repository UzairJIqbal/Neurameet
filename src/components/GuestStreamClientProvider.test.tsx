// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const providerPath = join(__dirname, "GuestStreamClientProvider.tsx");

describe("GuestStreamClientProvider guest identity", () => {
  const providerSource = readFileSync(providerPath, "utf-8");

  it("connects the server minted guest through the token path", () => {
    expect(providerSource).toContain(
      "c.connectUser(\n\t\t\t\t{ id: guestUserId, name: guestDisplayName },\n\t\t\t\taccessToken,",
    );
  });

  it("does not ask the SDK to mint or rewrap another guest", () => {
    expect(providerSource).not.toMatch(/type:\s*["']guest["']/);
  });
});
