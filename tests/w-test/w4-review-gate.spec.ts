import { expect, test, type Page } from "@playwright/test";
import {
  addMember,
  api,
  createProject,
  meetingIdOf,
  person,
  prepare,
  processMeeting,
  scheduleInProject,
  signIn,
  TAG,
  uploadTranscript,
} from "./helpers";

// The eight test steps from prompts/step-W4-review-gate-tasks.md, plus the two
// confirms race. Soft checks, so one failing step still lets the rest report.
test.use({
  actionTimeout: 30000,
  navigationTimeout: 60000,
  viewport: { width: 1600, height: 1000 },
});

const OWNER = person("a");
const DEV = person("b");
const OTHER = person("c");
const VIEWER = person("d");

type Proposal = {
  id: string;
  meetingId: string;
  title: string;
  quote: string | null;
  quoteVerified: boolean;
  duplicate: { taskId: string; key: string; title: string } | null;
};
type Task = {
  id: string;
  key: string;
  title: string;
  status: string;
  version: number;
  assigneeId: string | null;
};
type Member = { userId: string; role: string };

const COLUMNS = ["To Do", "In Progress", "In Review", "Completed", "Blocked"];

// The drag library's keyboard mode: lift, move across columns, drop.
const moveCard = async (
  page: Page,
  key: string,
  from: string,
  to: string,
): Promise<void> => {
  const card = page.getByRole("button", { name: `Open ${key}` });
  await card.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  const steps = COLUMNS.indexOf(to) - COLUMNS.indexOf(from);
  for (let i = 0; i < Math.abs(steps); i += 1) {
    await page.keyboard.press(steps > 0 ? "ArrowRight" : "ArrowLeft");
    await page.waitForTimeout(400);
  }
  await page.keyboard.press("Space");
  await page.waitForTimeout(800);
};

const inColumn = (page: Page, column: string, key: string) =>
  page
    .getByRole("region", { name: column, exact: true })
    .getByRole("button", { name: `Open ${key}` });

test("W4 review gate and tasks", async ({ browser }) => {
  test.setTimeout(2400000);
  await prepare([OWNER, DEV, OTHER, VIEWER]);
  const owner = await signIn(browser, OWNER);
  const dev = await signIn(browser, DEV);
  const other = await signIn(browser, OTHER);
  const viewer = await signIn(browser, VIEWER);
  const projectId = await createProject(owner.page, "W4", "WTD");
  await addMember(owner.page, dev, projectId, "developer");
  await addMember(owner.page, other, projectId, "developer");
  await addMember(owner.page, viewer, projectId, "viewer");
  const board = `/projects/${projectId}?tab=tasks`;
  const proposalsUrl = `/api/projects/${projectId}/proposals`;
  const tasksUrl = `/api/projects/${projectId}/tasks`;

  const proposals = async (meetingId?: string): Promise<Proposal[]> => {
    const res = await api<{ proposals?: Proposal[] }>(owner.page, proposalsUrl);
    return (res.body.proposals ?? []).filter(
      (p) => !meetingId || p.meetingId === meetingId,
    );
  };
  const tasks = async (): Promise<Task[]> => {
    const res = await api<{ tasks?: Task[] }>(owner.page, tasksUrl);
    return res.body.tasks ?? [];
  };
  const members = await api<{ members?: Member[] }>(
    owner.page,
    `/api/projects/${projectId}/members`,
  );
  const me = async (page: Page): Promise<string> =>
    page.evaluate(
      () =>
        (window as unknown as { Clerk: { user: { id: string } } }).Clerk.user
          .id,
    );
  const devId = await me(dev.page);
  const otherId = await me(other.page);
  console.log(`members: ${members.body.members?.length}`);

  let firstMeeting = "";
  let quotedKey = "";

  await test.step("1 a project transcript becomes proposals, no follow ups", async () => {
    const callId = await scheduleInProject(
      owner.page,
      projectId,
      `${TAG} W4 first`,
    );
    firstMeeting = await meetingIdOf(owner.page, callId);
    await uploadTranscript(owner.page, {
      title: `${TAG} W4 first`,
      meetingId: firstMeeting,
      rawText: [
        "Wtest a: Thanks for joining the planning call.",
        "Wtest b: I will write the reporting export query by Friday.",
        "Wtest a: I will update the pricing page copy by Monday.",
        "Wtest c: I will add the invoice retry job next week.",
      ].join("\n"),
    });
    const done = await processMeeting(owner.page, firstMeeting);
    expect
      .soft(done.status, `process: ${JSON.stringify(done.body).slice(0, 200)}`)
      .toBe(200);
    const list = await proposals(firstMeeting);
    console.log(
      `step 1: ${list.length} proposals, verified quotes ${list.filter((p) => p.quoteVerified).length}`,
    );
    expect.soft(list.length, "proposals exist").toBeGreaterThan(0);
    await owner.page.goto(`/projects/${projectId}?tab=proposals`);
    await owner.page
      .getByRole("button", { name: "Confirm" })
      .first()
      .waitFor({ timeout: 30000 });
    const rows = owner.page
      .locator("li")
      .filter({ has: owner.page.getByRole("button", { name: "Confirm" }) });
    expect.soft(await rows.count(), "panel lists them").toBe(list.length);
    for (const row of await rows.all()) {
      const quoted = await row.locator("blockquote").count();
      const none = await row.getByText("No matching transcript line").count();
      expect.soft(quoted + none, "each shows a line or the fallback").toBe(1);
    }
    const followUps = await api<{ followUps?: { meetingId: string }[] }>(
      owner.page,
      "/api/follow-ups",
    );
    expect
      .soft(
        (followUps.body.followUps ?? []).filter(
          (f) => f.meetingId === firstMeeting,
        ).length,
        "no follow ups",
      )
      .toBe(0);
  });

  await test.step("2 confirming makes a keyed task in To Do, reprocess gives 409", async () => {
    const list = await proposals(firstMeeting);
    const pick = list.find((p) => p.quoteVerified) ?? list[0];
    const row = owner.page
      .locator("li")
      .filter({ has: owner.page.locator(`input[value="${pick.title}"]`) });
    await row.getByRole("button", { name: "Confirm" }).click();
    await expect
      .soft(owner.page.getByText(/^WTD-1 created$/))
      .toBeVisible({ timeout: 20000 });
    const made = (await tasks()).find((t) => t.key === "WTD-1");
    expect.soft(made?.status, "status").toBe("todo");
    quotedKey = pick.quoteVerified ? "WTD-1" : "";
    await owner.page.goto(board);
    await expect
      .soft(inColumn(owner.page, "To Do", "WTD-1"))
      .toBeVisible({ timeout: 30000 });
    const again = await processMeeting(owner.page, firstMeeting, 1);
    expect.soft(again.status, "reprocess").toBe(409);
    expect
      .soft(again.body.error, "reprocess message")
      .toBe("Proposals were already reviewed");
  });

  await test.step("race: two confirms at once make one task", async () => {
    const pick = (await proposals(firstMeeting))[0];
    if (!pick) {
      console.log("race: skipped, no proposal left");
      return;
    }
    const url = `/api/proposals/${pick.id}/review`;
    const before = (await tasks()).length;
    const both = await Promise.all([
      api(owner.page, url, "POST", {
        decision: "confirm",
        title: pick.title,
        confirmWithoutQuote: true,
      }),
      api(owner.page, url, "POST", {
        decision: "confirm",
        title: pick.title,
        confirmWithoutQuote: true,
      }),
    ]);
    console.log(`race: answers ${both.map((b) => b.status).join(", ")}`);
    expect
      .soft(both.map((b) => b.status).sort(), "one wins, one 409")
      .toEqual([200, 409]);
    expect.soft((await tasks()).length, "one new task").toBe(before + 1);
  });

  let loginKey = "";

  await test.step("3 a new task, a later meeting proposes a duplicate, Merge adds an event", async () => {
    await owner.page.goto(board);
    await owner.page.getByRole("button", { name: "Add Task" }).click();
    await owner.page
      .getByRole("dialog")
      .getByLabel("Title")
      .fill("Fix the login bug");
    await owner.page
      .getByRole("dialog")
      .getByRole("button", { name: /create/i })
      .click();
    await expect
      .soft(owner.page.getByRole("dialog"))
      .toBeHidden({ timeout: 20000 });
    const made = (await tasks()).find((t) => t.title === "Fix the login bug");
    loginKey = made?.key ?? "";
    expect.soft(loginKey, "task key").toMatch(/^WTD-\d+$/);
    const callId = await scheduleInProject(
      owner.page,
      projectId,
      `${TAG} W4 second`,
    );
    const meetingId = await meetingIdOf(owner.page, callId);
    await uploadTranscript(owner.page, {
      title: `${TAG} W4 second`,
      meetingId,
      rawText: [
        "Wtest a: Sign in is broken for some people.",
        "Wtest b: I will fix login bug this week.",
      ].join("\n"),
    });
    const done = await processMeeting(owner.page, meetingId);
    expect.soft(done.status, "process").toBe(200);
    const list = await proposals(meetingId);
    console.log(
      `step 3: ${JSON.stringify(list.map((p) => [p.title, p.duplicate?.key ?? null]))}`,
    );
    const dup = list.find((p) => p.duplicate?.key === loginKey);
    expect.soft(dup, "a proposal says it looks like the task").toBeTruthy();
    await owner.page.goto(`/projects/${projectId}?tab=proposals`);
    await expect
      .soft(owner.page.getByText("Looks like").first())
      .toBeVisible({ timeout: 30000 });
    await owner.page
      .getByRole("button", { name: `Merge into ${loginKey}` })
      .first()
      .click();
    await expect
      .soft(owner.page.getByText(`${loginKey} updated`))
      .toBeVisible({ timeout: 20000 });
    const detail = await api<{
      events?: { type?: string; eventType?: string; kind?: string }[];
    }>(owner.page, `/api/tasks/${made?.id}`);
    const names = (detail.body.events ?? []).map(
      (e) => e.type ?? e.eventType ?? e.kind,
    );
    console.log(`step 3: events ${names.join(", ")}`);
    expect.soft(names, "merge event").toContain("proposal_merged");
  });

  await test.step("4 a Developer moves their own card, not someone else's, and completes with evidence", async () => {
    const add = async (title: string, assigneeId: string): Promise<Task> => {
      const res = await api<{ task: Task }>(owner.page, tasksUrl, "POST", {
        title,
        assigneeId,
      });
      expect(res.status, `create ${title}`).toBeLessThan(300);
      return res.body.task;
    };
    const mine = await add(`${TAG} mine`, devId);
    const theirs = await add(`${TAG} theirs`, otherId);
    await dev.page.goto(board);
    await inColumn(dev.page, "To Do", mine.key).waitFor({ timeout: 30000 });

    await moveCard(dev.page, mine.key, "To Do", "In Progress");
    await expect
      .soft(inColumn(dev.page, "In Progress", mine.key), "own card moved")
      .toBeVisible({ timeout: 15000 });

    await moveCard(dev.page, theirs.key, "To Do", "In Progress");
    await expect
      .soft(inColumn(dev.page, "To Do", theirs.key), "other card snaps back")
      .toBeVisible({ timeout: 15000 });
    const denied = await dev.page
      .locator('[role="status"], [role="alert"]')
      .allInnerTexts();
    console.log(
      `step 4: toast text ${JSON.stringify(denied.filter(Boolean)).slice(0, 200)}`,
    );
    const refused = await api(dev.page, `/api/tasks/${theirs.id}`, "PATCH", {
      status: "in_progress",
      ifVersion: theirs.version,
    });
    expect.soft(refused.status, "server refuses too").toBe(403);

    await moveCard(dev.page, mine.key, "In Progress", "Completed");
    const dialog = dev.page.getByRole("dialog");
    await expect
      .soft(dialog, "evidence asked for")
      .toBeVisible({ timeout: 15000 });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect
      .soft(inColumn(dev.page, "In Progress", mine.key), "cancel goes back")
      .toBeVisible({ timeout: 15000 });

    await moveCard(dev.page, mine.key, "In Progress", "Completed");
    await dialog.getByLabel(/Evidence/).fill("Checked by hand in the test run");
    await dialog.getByRole("button", { name: "Mark completed" }).click();
    await expect
      .soft(inColumn(dev.page, "Completed", mine.key), "completed")
      .toBeVisible({ timeout: 20000 });
    expect
      .soft((await tasks()).find((t) => t.id === mine.id)?.status, "saved")
      .toBe("completed");
  });

  await test.step("5 two tabs move one card, the second gets the conflict toast", async () => {
    const res = await api<{ task: Task }>(owner.page, tasksUrl, "POST", {
      title: `${TAG} two tabs`,
      assigneeId: devId,
    });
    const key = res.body.task.key;
    const tabA = await owner.context.newPage();
    const tabB = await owner.context.newPage();
    await tabA.goto(board);
    await tabB.goto(board);
    await inColumn(tabA, "To Do", key).waitFor({ timeout: 30000 });
    await inColumn(tabB, "To Do", key).waitFor({ timeout: 30000 });
    await moveCard(tabA, key, "To Do", "In Progress");
    await moveCard(tabB, key, "To Do", "In Review");
    await expect
      .soft(
        tabB.getByText(
          "Someone else changed this task. The board was refreshed.",
        ),
      )
      .toBeVisible({
        timeout: 15000,
      });
    await expect
      .soft(inColumn(tabB, "In Progress", key), "second tab refreshed")
      .toBeVisible({ timeout: 20000 });
    await tabA.close();
    await tabB.close();
  });

  await test.step("6 a Viewer gets no quote chip, no Proposals tab, and a 403", async () => {
    console.log(`step 6: quoted task ${quotedKey || "none"}`);
    await owner.page.goto(board);
    await inColumn(owner.page, "To Do", "WTD-1").waitFor({ timeout: 30000 });
    const ownerChips = await owner.page
      .locator('[aria-label^="Quote:"]')
      .count();
    console.log(`step 6: Owner sees ${ownerChips} quote chips`);
    await viewer.page.goto(board);
    await inColumn(viewer.page, "To Do", "WTD-1").waitFor({ timeout: 30000 });
    expect
      .soft(
        await viewer.page.locator('[aria-label^="Quote:"]').count(),
        "viewer chips",
      )
      .toBe(0);
    await expect
      .soft(viewer.page.getByRole("link", { name: "Proposals" }))
      .toHaveCount(0);
    await expect
      .soft(viewer.page.getByRole("tab", { name: "Proposals" }))
      .toHaveCount(0);
    await expect
      .soft(viewer.page.getByRole("button", { name: "Proposals" }))
      .toHaveCount(0);
    const res = await api(viewer.page, proposalsUrl);
    expect.soft(res.status, "proposals route").toBe(403);
  });

  await test.step("8 then 7 a personal meeting makes follow ups, moving it makes proposals and a completed task", async () => {
    const meetingId = await uploadTranscript(owner.page, {
      title: `${TAG} W4 personal`,
      rawText: [
        "Wtest a: Quick personal planning note.",
        "Wtest a: I will renew the staging certificate by Friday.",
        "Wtest a: I will archive the old design files by Monday.",
      ].join("\n"),
    });
    const done = await processMeeting(owner.page, meetingId);
    expect.soft(done.status, "personal process").toBe(200);
    const listFollowUps = async () => {
      const res = await api<{
        followUps?: { id: string; meetingId: string }[];
      }>(owner.page, "/api/follow-ups");
      return (res.body.followUps ?? []).filter(
        (f) => f.meetingId === meetingId,
      );
    };
    const followUps = await listFollowUps();
    console.log(`step 8: ${followUps.length} follow ups`);
    expect
      .soft(followUps.length, "personal meeting makes follow ups")
      .toBeGreaterThan(1);

    await owner.page.goto(`/follow-ups/${followUps[0].id}`);
    await owner.page.getByRole("button", { name: "Completed" }).click();
    await owner.page.waitForTimeout(2500);

    const moved = await api(
      owner.page,
      `/api/meetings/${meetingId}/project`,
      "POST",
      { projectId },
    );
    expect
      .soft(moved.status, `move: ${JSON.stringify(moved.body).slice(0, 160)}`)
      .toBeLessThan(300);
    expect.soft((await listFollowUps()).length, "follow ups gone").toBe(0);
    const left = await proposals(meetingId);
    console.log(`step 7: ${left.length} proposals from the move`);
    expect
      .soft(left.length, "open follow ups became proposals")
      .toBe(followUps.length - 1);
    const after = await tasks();
    const completed = after.filter(
      (t) => t.status === "completed" && !t.title.startsWith(TAG),
    );
    console.log(
      `step 7: completed tasks ${JSON.stringify(completed.map((t) => t.title))}`,
    );
    expect.soft(completed.length, "one completed task").toBe(1);
    const again = await processMeeting(owner.page, meetingId, 1);
    expect.soft(again.status, "reprocess after the move").toBe(409);
  });

  console.log(`W4 project id: ${projectId}`);
});
