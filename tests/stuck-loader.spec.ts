import { test, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");

// P0 stuck-loader regression (src/components/DashboardContent.tsx +
// src/hooks/useLoadingTimeout.ts + src/components/ui/load-error.tsx).
//
// Every data-loading site resets isLoading in a `finally` on REJECT, so a
// promise that *rejects* is already handled. The real trap is a promise that
// NEVER settles (network black hole, dead socket, hung fetch). Only a
// timer catches that. This test simulates exactly that: it leaves
// /api/meetings and /api/follow-ups pending forever, so the dashboard's
// Promise.all never resolves. After the 12s bounded timeout the page must
// render <LoadError> with a Retry button and a Back to Dashboard button,
// instead of spinning forever.
//
// Run it with the dedicated project that matches this file:
//   npx playwright test --project=chromium-stuck-loader
test.describe("Stuck loader falls back to LoadError (P0)", () => {
  test.use({ storageState: authFile, viewport: { width: 1280, height: 720 } });

  test("a hanging /api/meetings fetch shows Retry + Back to Dashboard", async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Leave BOTH dashboard data fetches pending so the loader can never settle.
    const hang = async () => {
      // Never resolve the route — the underlying fetch stays in-flight.
      await new Promise<void>(() => {});
    };
    await page.route("**/api/meetings", hang);
    await page.route("**/api/follow-ups", hang);

    await page.goto("/dashboard");

    // The infinite spinner must NOT persist. After the bounded timeout the
    // <LoadError> fallback appears with both escape hatches visible.
    const loadError = page.getByText(/We couldn't load your meetings/i);
    await expect(loadError).toBeVisible({ timeout: 20000 });

    // Both /api/meetings and /api/follow-ups are hung, so each section
    // renders its own <LoadError>. There are therefore two Retry / Back
    // buttons on the page; assert the first of each is visible.
    await expect(
      page.getByRole("button", { name: "Retry" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Back to Dashboard" }).first(),
    ).toBeVisible();
  });
});
