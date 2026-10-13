import { test, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");
const BASE = "http://localhost:3000";

// Speaker Engagement Insights (Step C3) — regression for the new `Engagement`
// tab and `POST /api/engagement`. Reuses the shared signed-in Clerk session
// from auth.setup.ts so `page.request` carries the session cookie.
test.describe.serial("Speaker Engagement Insights (Step C3)", () => {
  test.use({ storageState: authFile });

  // Meeting created in Test 1, reused by Tests 2 & 3.
  let meetingId: string | null = null;

  test("1 — upload transcript, then Engagement API returns per-speaker data", async ({
    page,
  }) => {
    test.setTimeout(180000);

    const title = `E2E Engagement Upload ${Date.now()}`;
    const sampleTranscript = `Weekly product sync.

    Dana: Let's review the launch checklist. The big risk is the analytics pipeline not being ready.
    Evan: I'll own the analytics pipeline. Target is end of next week.
    Dana: Agreed. Priya, can you handle the customer comms?
    Priya: Yes, I'll draft the comms by Friday.
    Evan: One more thing — we should lock the date before we brief the team.`;

    await page.goto("/dashboard");
    await page.getByRole("button", { name: /upload transcript/i }).click();
    await expect(
      page.getByRole("heading", { name: "Upload Transcript" }),
    ).toBeVisible();

    await page.getByPlaceholder("e.g. Q3 Planning Review").fill(title);
    await page
      .getByPlaceholder("Paste your transcript here...")
      .fill(sampleTranscript);
    await page.getByRole("button", { name: /upload & process/i }).click();

    await page.waitForURL(/\/meeting-intelligence\/.+/, { timeout: 120000 });
    const url = page.url();
    meetingId = url.split("/meeting-intelligence/")[1] ?? null;
    expect(meetingId, "meeting id captured from redirect URL").toBeTruthy();

    // Engagement API: transcript-only meeting (no one joined) → 200, hasTranscript
    // true, hasAttendance false, valid speakers array + overallSummary string.
    const res = await page.request.post(`${BASE}/api/engagement`, {
      data: { meetingId },
    });
    expect(res.ok(), "engagement endpoint returns 200").toBeTruthy();

    const json = await res.json();
    expect(typeof json.hasTranscript).toBe("boolean");
    expect(json.hasTranscript, "uploaded meeting has a transcript").toBe(true);
    expect(json.hasAttendance, "no one joined, so no attendance").toBe(false);
    expect(Array.isArray(json.speakers), "speakers is an array").toBe(true);
    expect(typeof json.overallSummary, "overallSummary is a string").toBe(
      "string",
    );
  });

  test("2 — Engagement tab renders in the meeting detail page", async ({
    page,
  }) => {
    test.setTimeout(90000);
    expect(meetingId, "Test 1 must create the meeting first").toBeTruthy();

    await page.goto(`/meeting-intelligence/${meetingId}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Open the Engagement tab (scoped to the tab strip to avoid nav collisions).
    await page
      .locator("div.border-b.border-surface-variant")
      .getByRole("button", { name: "Engagement" })
      .click();

    // The overview heading renders (the call succeeded and the tab is not stuck
    // on the loader or the error card).
    await expect(
      page.getByRole("heading", { name: "Engagement overview" }),
    ).toBeVisible({ timeout: 60000 });
  });

  test("3 — Engagement API validation + 404 paths", async ({ page }) => {
    test.setTimeout(60000);

    // Missing meetingId → 400.
    const missing = await page.request.post(`${BASE}/api/engagement`, {
      data: {},
    });
    expect(missing.status(), "missing meetingId → 400").toBe(400);

    // Unknown meetingId (not owned by this user) → 404.
    const unknown = await page.request.post(`${BASE}/api/engagement`, {
      data: { meetingId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(unknown.status(), "unknown meetingId → 404").toBe(404);
  });
});
