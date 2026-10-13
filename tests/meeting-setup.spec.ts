import { test, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");

// D1 regression for the Meeting Setup lobby (src/components/MeetingSetup.tsx).
// Reuses the shared signed-in Clerk session from tests/auth.setup.ts, then drives
// the same path the authenticated E2E suite uses to reach a live Stream call:
// /personal-room → "start meeting" → /meeting/[id], where MeetingSetup renders.
//
// This file is intentionally NOT matched by any project's testMatch in
// playwright.config.ts. Run it explicitly (see the /test manual steps) with
// `--project=chromium-auth`, which depends on the "setup" project that mints the
// shared Clerk session. Running with an explicit file path bypasses testMatch.
test.describe("Meeting Setup (D1 lobby) renders controls", () => {
  test.use({ storageState: authFile, viewport: { width: 1280, height: 720 } });

  test("camera/mic toggles, audio profile menu, and join button are present", async ({
    page,
  }) => {
    test.setTimeout(90000);

    // Arrange: reach a live call's pre-join lobby.
    await page.goto("/personal-room");
    await page.getByRole("button", { name: /start meeting/i }).click();
    await page.waitForURL(/\/meeting\/.+/, { timeout: 60000 });

    // The pre-join lobby (MeetingSetup) is rendered, not the in-call room.
    const joinButton = page.getByRole("button", { name: /join meeting/i });
    await expect(joinButton).toBeVisible();

    // D1 header: "Set your" + the rotating FlipWords (first word is Microphone).
    await expect(page.getByText("Set your")).toBeVisible();
    await expect(page.getByText("Microphone")).toBeVisible();

    // D1 replaced the old single "join with mic and camera off" checkbox with
    // two explicit toggle buttons that expose their on/off state via aria-pressed.
    const cameraToggle = page.getByRole("button", { name: "Camera", exact: true });
    await expect(cameraToggle).toBeVisible();
    await expect(cameraToggle).toHaveAttribute("aria-pressed", "true");

    const micToggle = page.getByRole("button", { name: "Mic", exact: true });
    await expect(micToggle).toBeVisible();
    await expect(micToggle).toHaveAttribute("aria-pressed", "true");

    // D1 audio profile dropdown: opens to the three Stream bitrate profiles.
    const audioTrigger = page.getByRole("button", { name: /voice calls/i });
    await expect(audioTrigger).toBeVisible();
    await audioTrigger.click();
    await expect(
      page.getByRole("menuitem", { name: /podcasts/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /music calls/i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
