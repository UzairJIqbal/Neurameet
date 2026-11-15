import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Regression guard: the owner must see guest join requests while still on the
// setup screen, not only after joining the call (MeetingRoom).
describe("guest requests reach the owner before joining", () => {
  const setup = readFileSync(join(__dirname, "MeetingSetup.tsx"), "utf-8");
  const room = readFileSync(join(__dirname, "MeetingRoom.tsx"), "utf-8");

  it("MeetingSetup uses the shared guest request hook for managers", () => {
    expect(setup).toContain(
      "useGuestRequests(call, project?.canManage === true)",
    );
  });

  it("MeetingRoom uses the same hook", () => {
    expect(room).toContain("useGuestRequests(call, isOwner)");
  });
});
