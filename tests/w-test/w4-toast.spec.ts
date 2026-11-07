import { expect, test } from "@playwright/test";
import { api, person, prepare, signIn } from "./helpers";

// W4 step 4 follow up: the toast shown when a Developer moves someone else's card.
test.use({ actionTimeout: 30000, navigationTimeout: 60000, viewport: { width: 1600, height: 1000 } });

const PROJECT = "f5799125-09dd-497a-80c3-c11559703582";

test("W4 snap back toast", async ({ browser }) => {
  test.setTimeout(180000);
  const DEV = person("b");
  await prepare([DEV]);
  const dev = await signIn(browser, DEV);
  const res = await api<{ tasks?: { key: string; title: string; status: string }[] }>(dev.page, `/api/projects/${PROJECT}/tasks`);
  const theirs = res.body.tasks?.find((t) => t.title === "E2E W-test theirs");
  expect(theirs?.status).toBe("todo");
  await dev.page.goto(`/projects/${PROJECT}?tab=tasks`);
  const card = dev.page.getByRole("button", { name: `Open ${theirs?.key}` });
  await card.waitFor({ timeout: 30000 });
  await card.focus();
  await dev.page.keyboard.press("Space");
  await dev.page.waitForTimeout(400);
  await dev.page.keyboard.press("ArrowRight");
  await dev.page.waitForTimeout(500);
  await dev.page.keyboard.press("Space");
  await expect(dev.page.getByText("You can only change your own or unassigned tasks")).toBeVisible({ timeout: 8000 });
  await expect(dev.page.getByRole("region", { name: "To do", exact: true }).getByRole("button", { name: `Open ${theirs?.key}` })).toBeVisible();
});
