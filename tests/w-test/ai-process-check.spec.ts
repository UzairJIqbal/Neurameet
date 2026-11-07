import { expect, test } from "@playwright/test";
import { person, prepare, signIn } from "./helpers";

// Counts how often POST /api/ai/process succeeds on one meeting, one try per
// run, no retries. Run before and after a change to compare. Prints no secrets.
const meetingId = process.env.AI_CHECK_MEETING ?? "";
const runs = Number(process.env.AI_CHECK_RUNS ?? "5");

test("AI process success count", async ({ browser }) => {
  test.setTimeout(runs * 240000);
  expect(meetingId, "set AI_CHECK_MEETING").toBeTruthy();
  const owner = person("a");
  await prepare([owner]);
  const { page, context } = await signIn(browser, owner);
  let passed = 0;
  for (let i = 1; i <= runs; i += 1) {
    const started = Date.now();
    const result = await page.evaluate(async (id) => {
      const res = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: id }),
        signal: AbortSignal.timeout(170000),
      }).catch(() => null);
      if (!res) return { status: 0, error: "no response" };
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { status: res.status, error: body.error ?? "" };
    }, meetingId);
    if (result.status === 200) passed += 1;
    console.log(`run ${i}: ${result.status} in ${Math.round((Date.now() - started) / 1000)} s ${result.error.slice(0, 90)}`);
    if (i < runs) await page.waitForTimeout(30000);
  }
  console.log(`RESULT ${passed} of ${runs} passed`);
  await context.close();
});
