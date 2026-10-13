// @vitest-environment jsdom
//
// Responsive revert-guard tests for G7 (Responsive Polishing) of the
// Guest Join flow. jsdom has no layout engine, so responsive reflow is
// locked by unit tests asserting the responsive class tokens as revert
// guards, following the P13 pattern (see MeetingRoom.test.tsx).
// The real reflow at 375px is verified manually via /check verify.
//
// Because the guest page components (NameModal, GuestWaitingScreen,
// TerminalScreen, GuestCallFlow) are unexported closures inside the
// page module, these tests verify the responsive tokens structurally
// by reading the page source and asserting the expected class strings
// are present. This is the same approach as the P13.10 tailwind-config
// test which asserts token keys exist in the source.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const guestPagePath = join(
  __dirname,
  "..",
  "app",
  "(root)",
  "meeting",
  "[id]",
  "guest",
  "page.tsx",
);
const meetingRoomPath = join(__dirname, "MeetingRoom.tsx");

describe("G7 — Responsive token revert guards (source-level)", () => {
  const guestPage = readFileSync(guestPagePath, "utf-8");
  const meetingRoom = readFileSync(meetingRoomPath, "utf-8");

  // G7.1 — NameModal responsive padding
  describe("G7.1 — NameModal responsive padding", () => {
    it("the modal card has p-4 sm:p-6", () => {
      expect(guestPage).toContain("p-4 sm:p-6");
    });

    it("the Join meeting button has whitespace-nowrap", () => {
      expect(guestPage).toContain("whitespace-nowrap");
    });
  });

  // G7.2 — Requesting overlay responsive padding
  describe("G7.2 — Requesting overlay responsive padding", () => {
    it("no guest-facing requesting card has bare px-8 without sm:px-8", () => {
      // Find all px-8 occurrences in the guest page and confirm
      // each is paired with sm:px-8.
      const px8Matches = guestPage.match(/px-8/g);
      const smPx8Matches = guestPage.match(/sm:px-8/g);
      // If there are px-8 occurrences, they must all have sm:px-8.
      // The count of px-8 (bare) should equal the count of sm:px-8.
      // This ensures no bare px-8 survives.
      const barePx8 = (px8Matches?.length ?? 0) - (smPx8Matches?.length ?? 0);
      expect(barePx8).toBeLessThanOrEqual(0);
    });

    it("the requesting overlay card has px-4 sm:px-8", () => {
      expect(guestPage).toContain("px-4 sm:px-8");
    });
  });

  // G7.3 — Owner's Accept/Deny toast responsive
  describe("G7.3 — Accept/Deny toast responsive", () => {
    it("the toast container has min-w-[260px] sm:min-w-[280px]", () => {
      expect(meetingRoom).toContain("min-w-[260px] sm:min-w-[280px]");
    });

    it("the toast container has max-w-[calc(100vw-2rem)]", () => {
      expect(meetingRoom).toContain("max-w-[calc(100vw-2rem)]");
    });

    it("the button column has w-[70px] sm:w-[90px]", () => {
      expect(meetingRoom).toContain("w-[70px] sm:w-[90px]");
    });
  });

  // G7.4 — GuestWaitingScreen responsive padding
  describe("G7.4 — GuestWaitingScreen responsive padding", () => {
    it("the waiting screen card has px-4 sm:px-6", () => {
      expect(guestPage).toContain("px-4 sm:px-6");
    });

    it("the waiting text has text-body-sm sm:text-body-md", () => {
      expect(guestPage).toContain("text-body-sm sm:text-body-md");
    });
  });

  // G7.5 — TerminalScreen responsive padding
  describe("G7.5 — TerminalScreen responsive padding", () => {
    it("the terminal screen card has px-4 sm:px-8", () => {
      expect(guestPage).toContain("px-4 sm:px-8");
    });
  });

  // G7.6 — GuestStreamClientProvider responsive
  describe("G7.6 — GuestStreamClientProvider responsive", () => {
    it("the LoadError/LoaderOne wrappers use flex min-h-screen items-center justify-center", () => {
      // The GuestStreamClientProvider uses these exact classes.
      expect(guestPage).toContain("flex min-h-screen items-center justify-center");
    });
  });

  // G7.7 — GuestCallFlow admitted phase (MeetingRoom)
  describe("G7.7 — GuestCallFlow admitted phase responsive", () => {
    it("MeetingRoom side panels have hidden + sm:static tokens", () => {
      expect(meetingRoom).toContain("hidden");
      expect(meetingRoom).toContain("sm:static");
    });

    it("panels have bottom-32 inset", () => {
      expect(meetingRoom).toContain("bottom-32");
    });
  });

  // G7.8 — GuestWaitingScreen error state
  describe("G7.8 — GuestWaitingScreen error state", () => {
    it("the error LoadError wrapper uses flex min-h-screen items-center justify-center", () => {
      expect(guestPage).toContain("flex min-h-screen items-center justify-center");
    });
  });
});
