import { expect, test, type Page } from "@playwright/test";
import {
  addMember,
  api,
  createProject,
  person,
  prepare,
  scheduleInProject,
  signIn,
} from "./helpers";

// W8 second pass: notification bell and page, task drawer and comments, viewer
// redaction, and Raise hand in a project call. Run against `next start`.
test.use({ actionTimeout: 30000, navigationTimeout: 60000 });

const A = person("a");
const B = person("b");
const C = person("c");

const inRoom = (page: Page) =>
  page.getByRole("button", { name: /(Mute|Unmute) microphone/ });

test("W8 notifications, task drawer, viewer, raise hand", async ({
  browser,
}) => {
  test.setTimeout(480000);
  await prepare([A, B, C]);
  const a = await signIn(browser, A, "/dashboard");
  const b = await signIn(browser, B, "/dashboard");
  const c = await signIn(browser, C, "/dashboard");
  const projectId = await createProject(a.page, "W8b", "WEB");
  await addMember(a.page, b, projectId, "developer");
  await addMember(a.page, c, projectId, "viewer");

  const members = await api<{ members?: { userId: string; email?: string }[] }>(
    a.page,
    `/api/projects/${projectId}/members`,
  );
  const bId = members.body.members?.find((m) => m.email === B.email)?.userId;
  const created = await api<{ task?: { id: string }; id?: string }>(
    a.page,
    `/api/projects/${projectId}/tasks`,
    "POST",
    { title: "E2E W8 drawer task", assigneeId: bId },
  );
  const taskId = created.body.task?.id ?? created.body.id;
  expect(taskId, `task create ${created.status}`).toBeTruthy();

  await test.step("1 bell shows unread, Mark all read clears it", async () => {
    await b.page.goto("/dashboard");
    const bell = b.page.getByRole("button", {
      name: /^Notifications, \d+ unread$/,
    });
    await expect
      .soft(bell, "bell with unread count")
      .toBeVisible({ timeout: 30000 });
    await bell.click();
    await b.page.getByRole("button", { name: "Mark all read" }).click();
    await expect
      .soft(
        b.page.getByRole("button", { name: "Notifications", exact: true }),
        "bell cleared",
      )
      .toBeVisible({ timeout: 20000 });
    const counts = await api<{ unread?: number }>(b.page, "/api/my-counts");
    console.log(
      `step 1: my-counts unread after mark all: ${counts.body.unread}`,
    );
    expect.soft(counts.body.unread).toBe(0);
  });

  await test.step("2 notifications page: filter, mark unread, mark read", async () => {
    await b.page.goto("/notifications");
    await expect
      .soft(b.page.getByRole("heading", { name: "Notifications", level: 1 }))
      .toBeVisible();
    const filters = b.page.getByRole("group", { name: "Filters" });
    await filters.getByRole("button", { name: "Tasks" }).click();
    await expect
      .soft(
        b.page.getByText(/E2E W8 drawer task|assigned/i).first(),
        "task notice under Tasks",
      )
      .toBeVisible({
        timeout: 20000,
      });
    await filters.getByRole("button", { name: "All" }).click();
    const markUnread = b.page
      .getByRole("button", { name: "Mark as unread" })
      .first();
    await markUnread.click();
    await expect
      .soft(
        b.page.getByRole("button", { name: "Mark as read" }).first(),
        "row flipped to unread",
      )
      .toBeVisible({ timeout: 20000 });
    await b.page.getByRole("button", { name: "Mark as read" }).first().click();
    await expect
      .soft(
        b.page.getByRole("button", { name: "Mark as unread" }).first(),
        "row flipped back",
      )
      .toBeVisible({ timeout: 20000 });
  });

  await test.step("3 task drawer from My Tasks, add and delete a comment", async () => {
    await b.page.goto("/my-tasks");
    await b.page.getByText("E2E W8 drawer task").first().click();
    const drawer = b.page.getByRole("dialog", { name: "Task details" });
    await expect
      .soft(
        drawer.getByRole("heading", { name: "E2E W8 drawer task" }),
        "drawer opened",
      )
      .toBeVisible({
        timeout: 30000,
      });
    await drawer.getByLabel("Add a comment").fill("E2E W8 comment from B");
    await drawer.getByRole("button", { name: "Comment", exact: true }).click();
    await expect
      .soft(drawer.getByText("E2E W8 comment from B"), "comment shown")
      .toBeVisible({ timeout: 20000 });
    const detail = await api<{ comments?: { body: string }[] }>(
      b.page,
      `/api/tasks/${taskId}`,
    );
    expect
      .soft(
        detail.body.comments?.some((x) => x.body === "E2E W8 comment from B"),
        "comment stored",
      )
      .toBe(true);
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect.soft(drawer).toBeHidden();
  });

  await test.step("4 Viewer sees no comments, no quotes", async () => {
    const detail = await api<{ comments?: unknown[]; prLinks?: unknown[] }>(
      c.page,
      `/api/tasks/${taskId}`,
    );
    console.log(
      `step 4: viewer task status ${detail.status}, comments field ${JSON.stringify(detail.body.comments)}`,
    );
    expect.soft(detail.status).toBe(200);
    expect
      .soft(
        detail.body.comments === undefined || detail.body.comments.length === 0,
        "no comments for Viewer",
      )
      .toBe(true);
    const post = await api(c.page, `/api/tasks/${taskId}/comments`, "POST", {
      body: "viewer try",
    });
    expect
      .soft(post.status, "Viewer cannot comment")
      .toBeGreaterThanOrEqual(400);
    await c.page.goto(`/projects/${projectId}`);
    await expect
      .soft(c.page.getByRole("tab", { name: "Settings", exact: true }))
      .toHaveCount(0);
    await expect
      .soft(c.page.getByRole("tab", { name: "AI Assistant", exact: true }))
      .toHaveCount(0);
    await expect
      .soft(c.page.getByRole("tab", { name: "GitHub", exact: true }))
      .toHaveCount(0);
  });

  await test.step("5 Raise hand works for a member in a project call", async () => {
    const callId = await scheduleInProject(
      a.page,
      projectId,
      "E2E W8 raise hand",
    );
    for (const s of [a, b]) {
      await s.page.goto(`/meeting/${callId}`);
      const tick = s.page.getByRole("checkbox", {
        name: "I understand and want to join",
      });
      await tick
        .waitFor({ timeout: 40000 })
        .then(() => tick.check())
        .catch(() => {});
      await s.page.getByRole("button", { name: "Join Meeting" }).click();
      await expect(inRoom(s.page)).toBeVisible({ timeout: 60000 });
    }
    const errors: string[] = [];
    b.page.on("pageerror", (e) => errors.push(e.message));
    await b.page.getByRole("button", { name: "Raise hand" }).click();
    await a.page.waitForTimeout(4000);
    const seenByOwner = await a.page.locator(".str-video__reaction").count();
    console.log(
      `step 5: reaction elements on owner page ${seenByOwner}, page errors on B ${errors.length}`,
    );
    expect.soft(errors, "no page error after Raise hand").toEqual([]);
    expect.soft(seenByOwner, "owner sees the raised hand").toBeGreaterThan(0);
  });
});
