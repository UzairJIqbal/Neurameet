import { test, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");

// D3.4 /debug regression for the recording-page auto-refresh
// (src/components/RecordingPage.tsx). Before the fix the page fetched
// /api/recordings exactly once on mount and never re-fetched, so a composite
// recording that finished processing after the page loaded stayed invisible
// until the user manually reloaded. The fix keeps polling (10s) until a
// recording appears or a 15 minute bound passes.
//
// This spec proves the regression: /api/recordings returns empty on the first
// couple of calls (simulating "still processing"), then returns a recording.
// We never call page.reload(); if the row appears, auto-refresh works.
//
// Run it with the dedicated project that matches this file and depends on the
// "setup" project that mints the shared Clerk session:
//   npx playwright test --project=chromium-recording-poll
// (A CLI file argument does not override a project's testMatch, so run by
// project name rather than by file path.)
test.describe("Recording page auto-refresh (D3.4 /debug)", () => {
  test.use({ storageState: authFile, viewport: { width: 1280, height: 720 } });

  test("a finished recording appears without a manual reload", async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Stub the meetings endpoint so the optional "View insights" link logic
    // resolves deterministically and stays out of the way.
    await page.route("**/api/meetings", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ meetings: [] }),
      });
    });

    // Stub recordings: empty for the first two calls, then a finished recording.
    // The page fetches once immediately, then every 10s.
    let recCallCount = 0;
    await page.route("**/api/recordings", async (route) => {
      recCallCount += 1;
      const recordings =
        recCallCount <= 2
          ? []
          : [
              {
                id: "rec_poll_regression",
                filename: "Poll Regression Recording",
                start_time: new Date().toISOString(),
                url: "https://example.com/rec.mp4",
                call_id: "call_poll_regression",
              },
            ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ recordings }),
      });
    });

    await page.goto("/recording");

    // No manual reload happens anywhere in this test. The row must surface via
    // the polling interval. This is the assertion that fails without the fix.
    const row = page.getByText("Poll Regression Recording");
    await expect(row).toBeVisible({ timeout: 35000 });
  });

  test("a finished recording appears even if earlier fetches error", async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Meetings endpoint stays healthy so only the recordings endpoint is exercised.
    await page.route("**/api/meetings", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ meetings: [] }),
      });
    });

    // Regression for the fix in src/components/RecordingPage.tsx: a transient
    // 500 must NOT stop the auto-refresh. The original code cleared the poll
    // interval on the first error, so a recording that finished later never
    // appeared without a manual reload. Here the first two calls fail, then a
    // recording is returned. We never reload; the row must still surface.
    let recCallCount = 0;
    await page.route("**/api/recordings", async (route) => {
      recCallCount += 1;
      if (recCallCount <= 2) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "transient boom" }),
        });
        return;
      }
      const recordings = [
        {
          id: "rec_poll_error",
          filename: "Error Resilience Recording",
          start_time: new Date().toISOString(),
          url: "https://example.com/rec.mp4",
          call_id: "call_poll_error",
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ recordings }),
      });
    });

    await page.goto("/recording");

    const row = page.getByText("Error Resilience Recording");
    await expect(row).toBeVisible({ timeout: 35000 });
  });
});
