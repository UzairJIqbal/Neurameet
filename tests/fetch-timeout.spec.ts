import { test, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");

// Sibling-sweep regression for the P0 app-wide-gate fix: PrepPage (/api/prep)
// and SearchPage (/api/search) are user-triggered fetches with a never-settling
// trap (a hung request spins the inline spinner forever). They now reuse the
// same useLoadingTimeout + LoadError primitive as the dashboard, so a hung
// request must fall back to Retry instead of spinning.
//
// Run with the dedicated project that matches this file:
//   npx playwright test --project=chromium-fetch-timeout
test.describe("Hung fetch falls back to LoadError (P0 siblings)", () => {
  test.use({ storageState: authFile, viewport: { width: 1280, height: 720 } });

  test("a hanging /api/prep shows Retry on the Prep page", async ({ page }) => {
    test.setTimeout(45000);

    // Never resolve the route — the underlying fetch stays in-flight.
    await page.route("**/api/prep", async () => {
      await new Promise<void>(() => {});
    });

    await page.goto("/prep");
    await page.getByLabel("Upcoming meeting title").fill("Q3 Roadmap Sync");
    await page.getByRole("button", { name: "Generate prep" }).click();

    // After the bounded timeout the <LoadError> fallback appears with Retry.
    await expect(
      page.getByText(/Prep couldn't be generated/i),
    ).toBeVisible({ timeout: 25000 });
    await expect(
      page.getByRole("button", { name: "Retry" }),
    ).toBeVisible();
  });

  test("a hanging /api/search shows Retry on the Search page", async ({
    page,
  }) => {
    test.setTimeout(45000);

    await page.route("**/api/search", async () => {
      await new Promise<void>(() => {});
    });

    await page.goto("/search");
    await page
      .getByLabel("Search across your meetings")
      .fill("launch date decision");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(
      page.getByText(/Search couldn't run/i),
    ).toBeVisible({ timeout: 25000 });
    await expect(
      page.getByRole("button", { name: "Retry" }),
    ).toBeVisible();
  });
});
