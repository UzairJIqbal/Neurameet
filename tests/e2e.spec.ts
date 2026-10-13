import { test, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");

// All four tests run sequentially against ONE signed-in Clerk test user.
// `test.describe.serial()` forces order; the chromium-auth project loads the
// shared `storageState` (saved by tests/auth.setup.ts) so Test 1's uploaded
// meeting — and the follow_ups it auto-generates — are visible to Tests 2 & 3.
test.describe.serial("NeuraMeet authenticated E2E", () => {
  test.use({ storageState: authFile });

  // Shared across the serial tests: the meeting id created in Test 1.
  let createdMeetingId: string | null = null;

  test("1 — upload transcript → insights appear", async ({ page }) => {
    test.setTimeout(120000);

    const title = `E2E Regression Upload ${Date.now()}`;
    const sampleTranscript = `Team sync on the Q4 launch plan.

    Alice: Thanks everyone for joining. The main decision today is whether we ship the new onboarding flow in November or push to January.
    Bob: I think we should ship in November. The engineering work is mostly done and we have a fallback if metrics dip.
    Alice: Agreed. Decision: we ship the onboarding flow in November. Bob, can you own the rollout checklist?
    Bob: Sure, I'll have the rollout checklist ready by next Friday.
    Carol: Marketing needs the launch assets two weeks before. I'll draft the email sequence.
    Alice: Action item — Carol to deliver launch email sequence by October 20th. And Bob to finalize the rollout checklist by next Friday.`;

    await page.goto("/dashboard");

    // Open the Upload Transcript quick action.
    await page.getByRole("button", { name: /upload transcript/i }).click();

    // Modal renders.
    await expect(
      page.getByRole("heading", { name: "Upload Transcript" }),
    ).toBeVisible();

    // Fill title + transcript, then process.
    await page.getByPlaceholder("e.g. Q3 Planning Review").fill(title);
    await page
      .getByPlaceholder("Paste your transcript here...")
      .fill(sampleTranscript);
    await page.getByRole("button", { name: /upload & process/i }).click();

    // Redirect to the new meeting's insight page.
    await page.waitForURL(/\/meeting-intelligence\/.+/, { timeout: 120000 });

    const url = page.url();
    createdMeetingId = url.split("/meeting-intelligence/")[1] ?? null;
    expect(createdMeetingId, "meeting id captured from redirect URL").toBeTruthy();

    // Insights page rendered: the meeting title + the tab strip (incl. AI Chat).
    await expect(page.getByText(title)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "AI Chat" }),
    ).toBeVisible();
  });

  test("2 — AI Chat question → streamed answer", async ({ page }) => {
    test.setTimeout(120000);
    expect(
      createdMeetingId,
      "Test 1 must run first to create the meeting",
    ).toBeTruthy();

    await page.goto(`/meeting-intelligence/${createdMeetingId}`);

    // Guard: we must be on the meeting page (not bounced to /dashboard) before
    // interacting — under load the meeting fetch can momentarily redirect.
    await page.waitForURL(/\/meeting-intelligence\/.+/, { timeout: 30000 });

    // Open the AI Chat tab (scoped to the tabs strip to avoid any nav-item
    // collision). We wait for network idle so the insights page is fully mounted.
    await page.waitForLoadState("networkidle").catch(() => {});
    await page
      .locator("div.border-b.border-surface-variant")
      .getByRole("button", { name: "AI Chat" })
      .click();

    const chatInput = page.getByPlaceholder("Ask about this meeting…");
    await expect(chatInput).toBeVisible();

    const question = "What decisions were made in this meeting?";
    await chatInput.fill(question);
    await page.getByRole("button", { name: /^send$/i }).click();

    // User bubble shows the question.
    await expect(
      page.getByText(question, { exact: true }),
    ).toBeVisible();

    // A streamed assistant bubble appears (user + assistant = 2 chat bubbles).
    const bubbles = page.locator("div.rounded-lg.px-4.py-3");
    await expect(bubbles).toHaveCount(2, { timeout: 120000 });
  });

  test("3 — mark a follow-up complete", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/follow-ups");

    // Open the first follow-up (auto-generated from the upload in Test 1).
    await page.getByRole("link", { name: /open/i }).first().click();
    await expect(page).toHaveURL(/\/follow-ups\/.+/);

    const completedBtn = page.getByRole("button", { name: /^completed$/i });
    await completedBtn.click();

    // Status control flips to the active (completed) state.
    await expect(completedBtn).toHaveClass(/bg-primary-container/, {
      timeout: 30000,
    });
  });

  test("4 — join meeting room renders", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/personal-room");

    // Start the personal-room call → routes to /meeting/[id].
    await page.getByRole("button", { name: /start meeting/i }).click();
    await page.waitForURL(/\/meeting\/.+/, { timeout: 60000 });

    // The in-call Meeting Setup UI renders (we do NOT assert a live WebRTC
    // connection — that is flaky in headless).
    await expect(
      page.getByRole("button", { name: /join meeting/i }),
    ).toBeVisible();
  });
});
