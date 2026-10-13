import { test, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");

// F7b /debug regression for the owner Recording tab duplicate-key warning
// (src/components/meeting-intelligence/RecordingTab.tsx). The tab filters
// recordings by `call_id === meeting.streamCallId`, so every row in that list
// shares one call_id. Before the fix the row was keyed `rec.call_id`, so when a
// call had more than one recording (individual per-participant tracks) every
// row collided on the same key and React logged
// "Encountered two children with the same key, <call_id>". The fix appends the
// index to the key. This spec stubs two recordings that share a call_id and
// asserts that duplicate-key warning never reaches the console.
//
// Run it with the dedicated project that matches this file and depends on the
// "setup" project that mints the shared Clerk session:
//   npx playwright test --project=chromium-recording-tab
// (A CLI file argument does not override a project's testMatch, so run by
// project name rather than by file path.)
test.describe("Owner Recording tab duplicate-key regression (F7b /debug)", () => {
  test.use({ storageState: authFile, viewport: { width: 1280, height: 720 } });

  test("two recordings sharing a call_id render without a duplicate-key warning", async ({
    page,
  }) => {
    test.setTimeout(60000);

    const CALL_ID = "call_dup_regression";
    const MEETING_ID = "dup-regression-meeting";
    let ownerId = "";

    // Stub the meeting detail so the owner check passes (user_id matches the
    // signed-in Clerk session, set below) and streamCallId is wired to CALL_ID.
    await page.route("**/api/meetings/*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          meeting: {
            id: MEETING_ID,
            title: "Dup Regression Meeting",
            status: "ended",
            streamCallId: CALL_ID,
            startedAt: null,
            endedAt: null,
            createdAt: new Date().toISOString(),
            user_id: ownerId,
          },
          insights: null,
          actionItems: [],
          attendanceCount: 0,
        }),
      });
    });

    // Stub recordings with TWO entries that share the same call_id. This is the
    // exact shape that triggered the duplicate-key warning before the fix.
    await page.route("**/api/recordings", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recordings: [
            { filename: "Track A", call_id: CALL_ID, url: "https://example.com/a.mp4" },
            { filename: "Track B", call_id: CALL_ID, url: "https://example.com/b.mp4" },
          ],
        }),
      });
    });

    // Capture React's duplicate-key console errors, if any are emitted.
    const duplicateKeyErrors: string[] = [];
    page.on("console", (msg) => {
      if (
        msg.type() === "error" &&
        /Encountered two children with the same key/i.test(msg.text())
      ) {
        duplicateKeyErrors.push(msg.text());
      }
    });

    // Load a signed-in page first so we can read the Clerk user id that the
    // owner check (MeetingDetail.isOwner) compares meeting.user_id against.
    await page.goto("/meeting-intelligence");
    await page.waitForFunction(
      () => (window as unknown as { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id,
      undefined,
      { timeout: 15000 },
    );
    ownerId = await page.evaluate(
      () =>
        (window as unknown as { Clerk: { user: { id: string } } }).Clerk.user.id,
    );

    // Open the detail page. Its fetch is stubbed with the matching owner id, so
    // the owner-only Recording tab becomes visible.
    await page.goto(`/meeting-intelligence/${MEETING_ID}`);

    // The meeting title confirms MeetingDetail loaded with the stubbed data.
    await expect(page.getByText("Dup Regression Meeting")).toBeVisible({
      timeout: 15000,
    });

    // Open the Recording tab (owner-only).
    await page.getByRole("button", { name: "Recording" }).click();

    // Both tracks must render (clean labels, raw filename kept in the tooltip).
    await expect(page.getByTitle("Track A")).toBeVisible();
    await expect(page.getByTitle("Track B")).toBeVisible();

    // Give React a tick to flush any key warning.
    await page.waitForTimeout(500);

    expect(
      duplicateKeyErrors,
      `React logged a duplicate-key warning: ${duplicateKeyErrors.join(" | ")}`,
    ).toHaveLength(0);
  });
});
