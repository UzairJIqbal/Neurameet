import { expect, test, type Page } from "@playwright/test";
import { addMember, api, createProject, person, prepare, signIn, TAG, type Session } from "./helpers";

// Steps 2 to 7 from prompts/step-W3-project-meetings.md (step 1 is the gate
// script, run on its own). Fake media only, so this proves logic, not call
// quality. Soft checks, so one failing step still lets the rest report.
test.use({ actionTimeout: 30000, navigationTimeout: 60000 });

const OWNER = person("a");
const DEV = person("b");
const VIEWER = person("c");
const STRANGER = person("d");

const scheduleInProject = async (page: Page, projectId: string, title: string): Promise<string> => {
  await page.goto("/dashboard");
  await page.getByText("Schedule Meeting", { exact: true }).first().click();
  await page.getByPlaceholder("e.g. Weekly product sync").fill(title);
  await page.locator("#meeting-project").selectOption(projectId, { timeout: 30000 });
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByText("Your meeting is scheduled")).toBeVisible({ timeout: 40000 });
  const link = await page.locator("input[readonly]").last().inputValue();
  return link.split("/meeting/")[1];
};

const inRoom = (page: Page) => page.getByRole("button", { name: /(Mute|Unmute) microphone/ });

// A non member goes to the guest flow on clicking Join, when consent or members
// answers 404 (MeetingSetup.sendToGuestFlow).
const clickJoinAsOutsider = async (page: Page, callId: string): Promise<void> => {
  await page.goto(`/meeting/${callId}`);
  const join = page.getByRole("button", { name: "Join Meeting" });
  await join.waitFor({ timeout: 40000 });
  const tick = page.getByRole("checkbox", { name: "I understand and want to join" });
  const noticeShown = await tick
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  console.log(`outsider sees the notice: ${noticeShown}`);
  if (noticeShown) await tick.check();
  await join.click();
  await page.waitForURL(/\/guest/, { timeout: 40000 }).catch(() => {});
};

// Accept can answer 409 "still connecting" for a moment, so press again until
// this guest is in the room, like a host would.
const admitUntilIn = async (owner: Page, guest: Page): Promise<void> => {
  const accept = owner.getByRole("button", { name: "Accept" }).first();
  for (let tries = 0; tries < 12; tries += 1) {
    if (await accept.isVisible()) await accept.click().catch(() => {});
    if (await inRoom(guest).isVisible()) return;
    await inRoom(guest).waitFor({ timeout: 6000 }).catch(() => {});
  }
};

const joinAsMember = async (session: Session, callId: string): Promise<void> => {
  await session.page.goto(`/meeting/${callId}`);
  const tick = session.page.getByRole("checkbox", { name: "I understand and want to join" });
  await tick.waitFor({ timeout: 40000 });
  await tick.check();
  await session.page.getByRole("button", { name: "Join Meeting" }).click();
  await expect(inRoom(session.page)).toBeVisible({ timeout: 60000 });
};

test("W3 project meetings and consent", async ({ browser }) => {
  test.setTimeout(540000);
  await prepare([OWNER, DEV, VIEWER, STRANGER]);
  const owner = await signIn(browser, OWNER);
  const dev = await signIn(browser, DEV);
  const viewer = await signIn(browser, VIEWER);
  const stranger = await signIn(browser, STRANGER);
  const projectId = await createProject(owner.page, "W3", "WTC");
  await addMember(owner.page, dev, projectId, "developer");
  await addMember(owner.page, viewer, projectId, "viewer");
  let callId = "";

  await test.step("2 a Developer schedules in a project, the call type is project", async () => {
    callId = await scheduleInProject(dev.page, projectId, `${TAG} W3 scheduled`);
    const row = await api<{ callType?: string; meetingId?: string }>(dev.page, `/api/meetings/by-call/${callId}`);
    expect.soft(row.body.callType, "call type").toBe("project");
    const detail = await api<{ projectId?: string; meeting?: { projectId?: string } }>(
      dev.page,
      `/api/meetings/${row.body.meetingId}`,
    );
    expect.soft(detail.body.projectId ?? detail.body.meeting?.projectId, "project id on the row").toBe(projectId);
    console.log(`call id: ${callId}, meeting id: ${row.body.meetingId}`);
  });

  await test.step("3 a Viewer sees the notice, Join stays off until ticked, then joins", async () => {
    await viewer.page.goto(`/meeting/${callId}`);
    const tick = viewer.page.getByRole("checkbox", { name: "I understand and want to join" });
    await tick.waitFor({ timeout: 40000 });
    const join = viewer.page.getByRole("button", { name: "Join Meeting" });
    await expect.soft(join).toBeDisabled();
    await tick.check();
    await expect.soft(join).toBeEnabled();
    await join.click();
    await expect.soft(inRoom(viewer.page)).toBeVisible({ timeout: 60000 });
  });

  await test.step("4 a signed in non member lands on the guest flow, members refuses", async () => {
    await clickJoinAsOutsider(stranger.page, callId);
    console.log(`step 4: stranger url ends ${stranger.page.url().split(callId)[1] ?? stranger.page.url()}`);
    expect.soft(stranger.page.url(), "guest flow").toContain("/guest");
    const members = await api(stranger.page, `/api/meetings/${callId}/members`, "POST");
    expect.soft(members.status, "members route refuses a stranger").toBeGreaterThanOrEqual(400);
    console.log(`step 4: members route gave ${members.status}`);
    const consent = await api(stranger.page, `/api/meetings/${callId}/consent`, "POST", { noticeVersion: "w3-v1" });
    console.log(`step 4: consent route gave ${consent.status}`);
  });

  owner.page.on("response", (r) => {
    if (r.url().includes("/api/guest/admit")) {
      void r.text().then((t) => console.log(`owner admit: ${r.status()} ${t.slice(0, 160)}`));
    }
  });

  await test.step("5 a guest without the tick gets 400, with it the Owner admits them", async () => {
    await joinAsMember(owner, callId);
    const context = await browser.newContext({ permissions: ["camera", "microphone"] });
    const guest = await context.newPage();
    guest.on("console", (m) => {
      if (m.type() === "error" || m.text().includes("[guest]")) console.log(`guest console: ${m.text().slice(0, 240)}`);
    });
    guest.on("response", (r) => {
      if (r.url().includes("/api/guest/") || (r.url().includes("stream-io-api") && r.status() >= 400)) {
        console.log(`guest response: ${r.status()} ${r.url().split("?")[0].slice(-70)}`);
      }
    });
    await guest.goto(`/meeting/${callId}/guest`);
    await guest.getByPlaceholder("Your name").waitFor({ timeout: 40000 });
    const noTick = await api<{ code?: string }>(guest, "/api/guest/request-join", "POST", {
      meetingId: callId,
      name: "Wtest guest",
      request_nonce: `wtest-${Date.now()}`,
    });
    expect.soft(noTick.status, "no tick").toBe(400);
    console.log(`step 5: no tick answered ${noTick.status} code ${noTick.body.code}`);
    await guest.getByPlaceholder("Your name").fill("Wtest guest");
    const button = guest.getByRole("button", { name: "Join meeting" });
    // The first ask comes back consent required, which brings up the notice.
    await button.click();
    await guest.getByRole("checkbox", { name: "I understand and want to join" }).waitFor({ timeout: 30000 });
    await expect.soft(button, "button off before the tick").toBeDisabled();
    await guest.getByRole("checkbox", { name: "I understand and want to join" }).check();
    await button.click();
    await expect.soft(owner.page.getByRole("button", { name: "Accept" }).first()).toBeVisible({ timeout: 40000 });
    await admitUntilIn(owner.page, guest);
    await expect.soft(guest.getByRole("button", { name: /(Mute|Unmute) microphone/ })).toBeVisible({ timeout: 60000 });
    const seen = (await guest.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    console.log(`step 5: guest sees: ${seen}`);
    await context.close();
  });

  await test.step("5b the signed in non member from step 4 joins as a guest with consent", async () => {
    stranger.page.on("console", (m) => {
      if (m.type() === "error" || m.text().includes("[guest]")) console.log(`stranger console: ${m.text().slice(0, 240)}`);
    });
    stranger.page.on("response", (r) => {
      if (r.url().includes("/api/guest/") || (r.url().includes("stream-io-api") && r.status() >= 400)) {
        console.log(`stranger response: ${r.status()} ${r.url().split("?")[0].slice(-70)}`);
      }
    });
    expect.soft(stranger.page.url(), "still on the guest flow").toContain("from=setup");
    await stranger.page.getByPlaceholder("Your name").fill("Wtest stranger");
    const button = stranger.page.getByRole("button", { name: "Join meeting" });
    await button.click();
    const tick = stranger.page.getByRole("checkbox", { name: "I understand and want to join" });
    await tick.waitFor({ timeout: 30000 });
    await tick.check();
    await button.click();
    await expect.soft(owner.page.getByRole("button", { name: "Accept" }).first()).toBeVisible({ timeout: 40000 });
    await admitUntilIn(owner.page, stranger.page);
    await expect.soft(inRoom(stranger.page), "stranger in the room").toBeVisible({ timeout: 60000 });
    const seen = (await stranger.page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    console.log(`step 5b: stranger sees: ${seen}`);
    const plain = await stranger.context.newPage();
    await plain.goto(`/meeting/${callId}/guest`);
    await plain.waitForURL(/\/dashboard/, { timeout: 40000 }).catch(() => {});
    expect.soft(plain.url(), "plain guest link signed in still goes to the dashboard").toContain("/dashboard");
    await plain.close();
  });

  await test.step("6 removing a member in a live call kicks them, and they cannot rejoin", async () => {
    const members = await api<{ members?: { userId: string; email?: string; role: string }[] }>(
      owner.page,
      `/api/projects/${projectId}/members`,
    );
    const target = (members.body.members ?? []).find((m) => m.role === "viewer");
    expect.soft(target, "viewer in the member list").toBeTruthy();
    const removed = await api(owner.page, `/api/projects/${projectId}/members/${target?.userId}`, "DELETE");
    expect.soft(removed.status, "remove").toBeLessThan(300);
    await expect.soft(inRoom(viewer.page), "viewer leaves the room").toBeHidden({ timeout: 40000 });
    console.log(`step 6: viewer page after kick ends ${viewer.page.url().slice(-50)}`);
    await clickJoinAsOutsider(viewer.page, callId);
    expect.soft(viewer.page.url(), "rejoin goes to the guest flow").toContain("/guest");
    const after = await api<{ members?: { userId: string }[] }>(owner.page, `/api/projects/${projectId}/members`);
    expect.soft((after.body.members ?? []).some((m) => m.userId === target?.userId), "removal saved").toBe(false);
    const back = await api(viewer.page, `/api/projects/${projectId}`);
    expect.soft(back.status, "removed member cannot open the project").toBe(404);
  });

  await test.step("7 a personal meeting still creates, joins, and lists", async () => {
    await owner.page.goto("/dashboard");
    await owner.page.getByText("Schedule Meeting", { exact: true }).first().click();
    await owner.page.getByPlaceholder("e.g. Weekly product sync").fill(`${TAG} W3 personal`);
    await owner.page.getByRole("button", { name: "Schedule", exact: true }).click();
    await expect.soft(owner.page.getByText("Your meeting is scheduled")).toBeVisible({ timeout: 40000 });
    const link = await owner.page.locator("input[readonly]").last().inputValue();
    const personalId = link.split("/meeting/")[1];
    await owner.page.goto(`/meeting/${personalId}`);
    await expect
      .soft(owner.page.getByRole("checkbox", { name: "I understand and want to join" }), "no notice")
      .toBeHidden({ timeout: 15000 });
    await owner.page.getByRole("button", { name: "Join Meeting" }).click();
    await expect.soft(inRoom(owner.page)).toBeVisible({ timeout: 60000 });
    // A personal meeting gets its row on join, not on schedule.
    const row = await api<{ callType?: string }>(owner.page, `/api/meetings/by-call/${personalId}`);
    expect.soft(row.body.callType, "personal call type").toBe("default");
    const list = await api<{ meetings?: { title?: string }[] }>(owner.page, "/api/meetings");
    expect.soft((list.body.meetings ?? []).some((m) => m.title === `${TAG} W3 personal`), "in the list").toBe(true);
    console.log(`personal call id: ${personalId}`);
  });

  console.log(`W3 project id: ${projectId}`);
});
