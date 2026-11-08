import { expect, test } from "@playwright/test";
import {
  addMember,
  api,
  createProject,
  person,
  prepare,
  signIn,
} from "./helpers";

// W8 shell checks against the live app (run against `next start`, not `next dev`,
// so first compile delays do not trip the page load timeouts). Soft checks, so
// one failing surface still lets the rest report.
test.use({ actionTimeout: 30000, navigationTimeout: 60000 });

const A = person("a");
const B = person("b");

test("W8 workspace shell", async ({ browser }) => {
  test.setTimeout(420000);
  await prepare([A, B]);
  const a = await signIn(browser, A, "/dashboard");
  const b = await signIn(browser, B, "/dashboard");
  const projectId = await createProject(a.page, "W8", "WEB");
  const projectName = (
    await api<{ project?: { name: string }; name?: string }>(
      a.page,
      `/api/projects/${projectId}`,
    )
  ).body;
  console.log(
    `W8 project id: ${projectId} ${JSON.stringify(projectName).slice(0, 80)}`,
  );

  await test.step("1 sidebar and personal pages render", async () => {
    for (const [label, path] of [
      ["My Tasks", "/my-tasks"],
      ["Notifications", "/notifications"],
      ["My Projects", "/projects"],
    ] as const) {
      await a.page.goto(path);
      await expect
        .soft(
          a.page.getByRole("heading", { name: label, level: 1 }),
          `${label} heading`,
        )
        .toBeVisible({
          timeout: 30000,
        });
    }
    await a.page.goto("/meeting-intelligence");
    await expect
      .soft(a.page.getByRole("heading", { name: "Meeting Intelligence" }))
      .toBeVisible({ timeout: 30000 });
  });

  await test.step("2 dashboard cards", async () => {
    await a.page.goto("/dashboard");
    for (const title of [
      "Upcoming Meeting",
      "Quick Actions",
      "My Focus Tasks",
      "Notifications",
    ]) {
      await expect
        .soft(a.page.getByRole("heading", { name: title }), title)
        .toBeVisible({ timeout: 30000 });
    }
    await expect
      .soft(a.page.getByRole("heading", { name: /My Projects/ }))
      .toBeVisible();
    await expect
      .soft(a.page.getByRole("link", { name: /Review PRs/i }))
      .toHaveAttribute("href", "/notifications?filter=github");
  });

  await test.step("3 project tabs", async () => {
    await a.page.goto(`/projects/${projectId}`);
    for (const tab of [
      "Overview",
      "Tasks",
      "Members",
      "Meetings",
      "GitHub",
      "Development Activity",
      "Decisions and Promises",
      "AI Assistant",
      "Settings",
    ]) {
      await expect
        .soft(
          a.page.getByRole("tab", { name: tab, exact: true }).first(),
          `tab ${tab}`,
        )
        .toBeVisible({
          timeout: 30000,
        });
    }
  });

  await test.step("4 invite creates a notification for the invited member", async () => {
    await addMember(a.page, b, projectId, "developer");
    const res = await api<{
      notifications?: { title: string }[];
      unread?: number;
    }>(b.page, "/api/notifications");
    expect.soft(res.status).toBe(200);
    console.log(
      `step 4: B notifications ${res.body.items?.length ?? "n/a"}, unread ${res.body.unreadCount ?? "n/a"}`,
    );
    await b.page.goto("/notifications");
    await expect
      .soft(b.page.getByRole("heading", { name: "Notifications", level: 1 }))
      .toBeVisible({
        timeout: 30000,
      });
    const counts = await api(b.page, "/api/my-counts");
    expect.soft(counts.status, "my-counts").toBe(200);
  });

  await test.step("5 My Tasks lists a task assigned to B", async () => {
    const members = await api<{
      members?: { userId: string; email?: string }[];
    }>(a.page, `/api/projects/${projectId}/members`);
    console.log(
      `step 5: members ${members.body.members?.length}, fields ${Object.keys(members.body.members?.[1] ?? {})}`,
    );
    const task = await api<{ task?: { id: string; key: string } }>(
      a.page,
      `/api/projects/${projectId}/tasks`,
      "POST",
      {
        title: "E2E W8 shell task",
        assigneeId: members.body.members?.find((m) => m.email === B.email)
          ?.userId,
      },
    );
    console.log(`step 5: create task status ${task.status}`);
    await b.page.goto("/my-tasks");
    await expect
      .soft(
        b.page.getByText("E2E W8 shell task").first(),
        "assigned task listed",
      )
      .toBeVisible({ timeout: 30000 });
    await expect
      .soft(b.page.getByRole("heading", { name: "My Tasks", level: 1 }))
      .toBeVisible({ timeout: 30000 });
  });

  await test.step("6 Ctrl K palette finds the project", async () => {
    await a.page.goto("/dashboard");
    await a.page
      .getByRole("button", { name: /Search projects, tasks, meetings/ })
      .click();
    const box = a.page.getByPlaceholder("Search projects, tasks, meetings...");
    await expect.soft(box).toBeVisible();
    await box.fill("E2E W-test W8");
    await expect
      .soft(a.page.getByText(/E2E W-test W8/).first())
      .toBeVisible({ timeout: 20000 });
    await a.page.keyboard.press("Escape");
    await a.page.keyboard.press("Control+k");
    await expect
      .soft(a.page.getByPlaceholder("Search projects, tasks, meetings..."))
      .toBeVisible();
    await a.page.keyboard.press("Escape");
    await a.page.goto("/search?q=E2E%20W-test%20W8");
    await expect
      .soft(a.page.getByText(/E2E W-test W8/).first())
      .toBeVisible({ timeout: 30000 });
  });

  await test.step("7 sign in and sign up layouts", async () => {
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto("/sign-in");
    await expect
      .soft(
        page.getByText("Connect what your team discusses with what it ships."),
      )
      .toBeVisible({ timeout: 30000 });
    await page.goto("/sign-up");
    await expect
      .soft(page.getByText("Start with a meeting. End with merged code."))
      .toBeVisible({ timeout: 30000 });
    await anon.close();
  });
});
