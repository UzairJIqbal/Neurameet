import { test, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");

// Regression for the Stream connection fix (src/Providers/StreamClientProvider.tsx).
//
// Root cause: queryCalls is a REST call that waits on connectionIdPromise before
// sending. That promise only resolves after connectUser opens the WebSocket. On
// dashboard pages (no active call) the user was never connected, so the request
// never left the client and axios aborted at its 5s timeout
// ("timeout of 5000ms exceeded"). useGetCall swallowed it via console.error.
//
// The fix connects the user on provider mount, so connectionIdPromise resolves
// for every consumer. This test locks that in: with the fix, navigating to
// /previous spins up a connected client, queryCalls resolves, and NO 5s timeout
// error is logged. Revert the provider fix and this test fails.
test.describe("Stream client connects on mount (queryCalls no timeout)", () => {
  test.use({ storageState: authFile });

  test("call list loads without a 5000ms timeout", async ({ page }) => {
    test.setTimeout(30000);

    const timeoutErrors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/timeout of 5000ms exceeded|Error loading calls/i.test(text)) {
        timeoutErrors.push(text);
      }
    });

    await page.goto("/previous");

    // The list header renders once queryCalls settles (success OR catch path).
    // This confirms the hook finished; the console listener is the real check.
    await expect(
      page.getByRole("heading", { name: "Previous Meetings" }),
    ).toBeVisible({ timeout: 15000 });

    // Flush any late console error before asserting.
    await page.waitForTimeout(2000);

    expect(
      timeoutErrors,
      `queryCalls should resolve once the user is connected on mount; ` +
        `captured timeout/console errors: ${JSON.stringify(timeoutErrors)}`,
    ).toHaveLength(0);
  });
});
