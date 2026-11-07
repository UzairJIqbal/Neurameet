import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { viewerLeaks } from "../../src/test/viewer-walk";
import {
  TAG,
  addMember,
  api,
  createProject,
  meetingIdOf,
  person,
  prepare,
  processMeeting,
  scheduleInProject,
  signIn,
  uploadTranscript,
} from "./helpers";

// W6 manual test steps 1, 4, 5, 6 and 7. Steps 2, 3 and 8 need a real merged PR.
// The fake PR below is a test record in this script's own project, never a real
// repo, and exists only so the Viewer checks have PR details to hide.

test.use({ actionTimeout: 30000, navigationTimeout: 60000, viewport: { width: 1600, height: 1000 } });

const FAKE_REPO = "e2e-wtest/fake-repo";
const FAKE_TITLE = "E2E W-test secret PR title";
const FAKE_URL = "https://github.com/e2e-wtest/fake-repo/pull/9001";
const FAKE_REPO_ID = 990000000000 + (Date.now() % 1000000);

type Outcome = {
  said: { state: string; quote?: string; speaker?: string; meetingId?: string; meetingTitle?: string };
  task: { state: string; key?: string; taskId?: string };
  kept: { state: string };
};
type Item = {
  id: string;
  kind: string;
  statement: string;
  quote: string | null;
  derivedStatus: string;
  dueDate: string | null;
  meeting: { id: string; title: string };
  outcome: Outcome;
};
type ReviewRow = { id: string; evidenceKind: string; item: { id: string; statement: string }; meeting: { id: string } };
type LedgerBody = { items?: Item[]; canReview?: boolean; needsReview?: ReviewRow[]; reviewCount?: number; nextCursor?: string | null };
type Proposal = { id: string; title: string; meetingId: string; quoteVerified: boolean };

const karachiDay = (offsetDays = 0): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(Date.now() + offsetDays * 86400000));

const FIRST = [
  "Wtest a: Thanks for joining the planning call.",
  "Wtest b: I will write the reporting export query by Friday.",
  "Wtest a: I will update the pricing page copy by Monday.",
  "Wtest b: I will add the invoice retry job next week.",
  "Wtest a: We decided to keep the current billing provider for this year.",
].join("\n");
const SECOND = [
  "Wtest a: Quick follow up on last week's promises.",
  "Wtest b: I finished the reporting export query, it is live now.",
  "Wtest a: The pricing page copy is updated, I pushed that change yesterday.",
].join("\n");

const retryPost = async (page: Page, url: string, body: unknown, tries = 6) => {
  let last = await api(page, url, "POST", body, 170000);
  for (let i = 2; i <= tries && (last.status === 500 || last.status === 0); i += 1) {
    console.log(`RETRY ${url}: ${last.status} ${JSON.stringify(last.body).slice(0, 160)}`);
    await page.waitForTimeout(45000);
    last = await api(page, url, "POST", body, 170000);
  }
  return last;
};

// Keeps every real response a page receives from the four W6 routes.
const watchProofRoutes = (page: Page) => {
  const seen: { path: string; text: string }[] = [];
  const pending: Promise<unknown>[] = [];
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (!/^\/api\/(projects\/[^/]+\/(ledger|activity)|tasks\/[^/]+|ledger)$/.test(url.pathname)) return;
    pending.push(
      res
        .text()
        .then((text) => seen.push({ path: url.pathname, text }))
        .catch(() => {}),
    );
  });
  return async () => {
    await Promise.all(pending);
    return seen;
  };
};

test("W6 Proof Chain, steps 1, 4, 5, 6 and 7", async ({ browser }) => {
  test.setTimeout(2400000);
  const [a, b, c, d, e] = [person("a"), person("b"), person("c"), person("d"), person("e")];
  await prepare([a, b, c, d, e]);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  });

  const owner = await signIn(browser, a);
  const dev = await signIn(browser, b);
  const other = await signIn(browser, c);
  const viewer = await signIn(browser, d);
  const admin = await signIn(browser, e);

  const projectId = await createProject(owner.page, "W6", "WSX");
  const emptyProjectId = await createProject(owner.page, "W6 empty", "WSY");
  await addMember(owner.page, dev, projectId, "developer");
  await addMember(owner.page, viewer, projectId, "viewer");
  await addMember(owner.page, admin, projectId, "admin");
  console.log(`project ${projectId}`);

  const promisesTab = `/projects/${projectId}?tab=promises`;
  const activityTab = `/projects/${projectId}?tab=activity`;
  const ledgerUrl = `/api/projects/${projectId}/ledger`;
  const cards = (page: Page) => page.locator("li").filter({ has: page.locator('section[aria-label="Outcome"]') });
  const cardOf = (page: Page, statement: string) => cards(page).filter({ hasText: statement });
  const allItems = async (query = ""): Promise<Item[]> =>
    (await api<LedgerBody>(owner.page, `${ledgerUrl}${query}`)).body.items ?? [];

  let meetingOne = "";
  let meetingTwo = "";
  let taskId = "";
  let dueToday: Item | undefined;
  let overdue: Item | undefined;
  let meetingSuggested = 0;

  await test.step("setup: promises, a task, later evidence, 55 Activity rows, a fake PR", async () => {
    const callOne = await scheduleInProject(owner.page, projectId, `${TAG} W6 first`);
    meetingOne = await meetingIdOf(owner.page, callOne);
    await uploadTranscript(owner.page, { title: `${TAG} W6 first`, meetingId: meetingOne, rawText: FIRST });
    expect((await processMeeting(owner.page, meetingOne)).status, "process first").toBe(200);
    const embedOne = await retryPost(owner.page, "/api/ai/embed", { meetingId: meetingOne });
    // The app runs match after embed on every meeting. That is what embeds this
    // meeting's items, so a later meeting can find them.
    const matchOne = await retryPost(owner.page, "/api/ledger/match", { meetingId: meetingOne });
    console.log(`setup: embed first ${embedOne.status}, match first ${matchOne.status}`);

    const proposals =
      (await api<{ proposals?: Proposal[] }>(owner.page, `/api/projects/${projectId}/proposals`)).body.proposals ?? [];
    const pick = proposals.find((p) => p.quoteVerified) ?? proposals[0];
    expect(pick, "a proposal to confirm").toBeTruthy();
    const confirmed = await api(owner.page, `/api/proposals/${pick.id}/review`, "POST", {
      decision: "confirm",
      title: pick.title,
      confirmWithoutQuote: !pick.quoteVerified,
    });
    console.log(`setup: ${proposals.length} proposals, confirm ${confirmed.status}, verified ${pick.quoteVerified}`);

    const items = await allItems();
    console.log(`setup: items ${JSON.stringify(items.map((i) => [i.kind, i.statement, i.dueDate]))}`);
    const backed = items.find((i) => i.outcome.task.taskId);
    taskId = backed?.outcome.task.taskId ?? "";
    expect(taskId, "an item tied to a task").toBeTruthy();

    // Fixed dates, so "due today reads open" does not depend on what the AI read.
    const free = items.filter((i) => i.kind === "promise" && i.id !== backed?.id);
    dueToday = free[0];
    overdue = free[1];
    if (dueToday) await db.from("ledger_items").update({ due_date: karachiDay() }).eq("id", dueToday.id);
    if (overdue) await db.from("ledger_items").update({ due_date: karachiDay(-1) }).eq("id", overdue.id);

    const callTwo = await scheduleInProject(owner.page, projectId, `${TAG} W6 second`);
    meetingTwo = await meetingIdOf(owner.page, callTwo);
    await uploadTranscript(owner.page, { title: `${TAG} W6 second`, meetingId: meetingTwo, rawText: SECOND });
    expect((await processMeeting(owner.page, meetingTwo)).status, "process second").toBe(200);
    const embedTwo = await retryPost(owner.page, "/api/ai/embed", { meetingId: meetingTwo });
    const match = await retryPost(owner.page, "/api/ledger/match", { meetingId: meetingTwo });
    console.log(`setup: embed second ${embedTwo.status}, match ${match.status} ${JSON.stringify(match.body).slice(0, 200)}`);
    const before = await api<LedgerBody>(owner.page, ledgerUrl);
    meetingSuggested = (before.body.needsReview ?? []).filter((r) => r.evidenceKind === "meeting").length;
    console.log(`setup: suggested meeting links ${meetingSuggested}`);

    const { data: link, error: linkError } = await db
      .from("task_links")
      .insert({
        task_id: taskId,
        repo_id: FAKE_REPO_ID,
        repo_full_name: FAKE_REPO,
        pr_number: 9001,
        pr_title: FAKE_TITLE,
        pr_url: FAKE_URL,
        state: "merged",
        base_ref: "main",
        merged_at: new Date().toISOString(),
        pr_updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    console.log(`setup: fake PR ${linkError ? `failed ${linkError.message}` : "added"}`);
    expect(linkError, "fake PR row").toBeNull();
    const { error: codeError } = await db.from("ledger_links").insert({
      item_id: backed?.id,
      evidence_kind: "code",
      evidence_task_link_id: link?.id,
      relation: "kept",
      state: "suggested",
      confidence: 1,
      quote: FAKE_TITLE,
    });
    console.log(`setup: fake code link ${codeError ? `failed ${codeError.message}` : "added"}`);
    expect(codeError, "fake code link row").toBeNull();

    for (let i = 1; i <= 55; i += 1) {
      const made = await api(owner.page, `/api/projects/${projectId}/tasks`, "POST", { title: `${TAG} row ${i}` });
      expect(made.status, `task ${i}`).toBeLessThan(300);
    }
  });

  await test.step("1 Owner sees status, quote, speaker, meeting, task key, and filters work", async () => {
    const items = await allItems();
    await owner.page.goto(promisesTab);
    await cards(owner.page).first().waitFor({ timeout: 40000 });
    expect.soft(await cards(owner.page).count(), "every item shows").toBe(items.length);

    const quoted = items.find((i) => i.outcome.said.quote && i.outcome.task.key);
    expect.soft(quoted, "an item with a quote and a task key").toBeTruthy();
    if (quoted) {
      const card = cardOf(owner.page, quoted.statement).first();
      const text = await card.innerText();
      console.log(`step 1 card: ${text.replace(/\n/g, " | ").slice(0, 400)}`);
      expect.soft(text, "quote").toContain(quoted.outcome.said.quote as string);
      if (quoted.outcome.said.speaker) expect.soft(text, "speaker").toContain(quoted.outcome.said.speaker);
      expect.soft(text, "meeting").toContain(quoted.meeting.title);
      expect.soft(text, "task key").toContain(quoted.outcome.task.key as string);
      expect.soft(text.toLowerCase(), "status badge").toContain(quoted.derivedStatus);
    }

    const today = items.find((i) => i.id === dueToday?.id);
    const late = items.find((i) => i.id === overdue?.id);
    console.log(`step 1 dates: today ${today?.dueDate} ${today?.derivedStatus}, late ${late?.dueDate} ${late?.derivedStatus}`);
    expect.soft(today?.derivedStatus, "due today reads open").toBe("open");
    expect.soft(late?.derivedStatus, "due yesterday reads overdue").toBe("overdue");

    const narrow = async (label: string, value: string, query: string) => {
      const expected = await allItems(query);
      const answer = owner.page.waitForResponse((r) => new URL(r.url()).pathname === ledgerUrl && r.request().method() === "GET");
      await owner.page.getByLabel(label).selectOption(value);
      await answer;
      await expect.soft(cards(owner.page), `${query} count in the UI`).toHaveCount(expected.length, { timeout: 15000 });
      console.log(`step 1 filter ${query}: ${expected.length} of ${items.length}`);
      return expected;
    };
    const decisions = await narrow("Filter by kind", "decision", "?kind=decision");
    expect.soft(decisions.every((i) => i.kind === "decision"), "decisions only").toBe(true);
    await narrow("Filter by kind", "", "");
    const late2 = await narrow("Filter by status", "overdue", "?status=overdue");
    expect.soft(late2.some((i) => i.id === overdue?.id), "overdue filter has yesterday").toBe(true);
    expect.soft(late2.some((i) => i.id === dueToday?.id), "overdue filter lacks today").toBe(false);
    const open = await narrow("Filter by status", "open", "?status=open");
    expect.soft(open.some((i) => i.id === dueToday?.id), "open filter has today").toBe(true);

    const group = await api<LedgerBody>(owner.page, ledgerUrl);
    const empty = await api<LedgerBody>(owner.page, `/api/projects/${emptyProjectId}/ledger`);
    console.log(`step 1 review: this project ${group.body.reviewCount}, empty project ${empty.body.reviewCount}`);
    expect.soft(group.body.reviewCount, "this project has suggested links").toBeGreaterThan(0);
    expect.soft(empty.body.reviewCount, "another project of yours has none").toBe(0);
    const here = new Set([meetingOne, meetingTwo]);
    expect.soft((group.body.needsReview ?? []).every((r) => here.has(r.meeting.id)), "group stays in the project").toBe(true);
    await owner.page.goto(promisesTab);
    await expect.soft(owner.page.getByRole("heading", { name: "Needs your review" }), "group shows").toBeVisible({ timeout: 30000 });
  });

  await test.step("4 Developer: no group, no buttons, Waiting for review", async () => {
    const res = await api<LedgerBody>(dev.page, ledgerUrl);
    expect.soft(res.body.canReview, "canReview").toBe(false);
    expect.soft(res.body.needsReview, "needsReview").toEqual([]);
    expect.soft(res.body.reviewCount, "reviewCount").toBe(0);
    await dev.page.goto(promisesTab);
    await cards(dev.page).first().waitFor({ timeout: 40000 });
    await expect.soft(dev.page.getByRole("heading", { name: "Needs your review" })).toHaveCount(0);
    await expect.soft(dev.page.getByRole("button", { name: "Confirm" })).toHaveCount(0);
    await expect.soft(dev.page.getByRole("button", { name: "Not a match" })).toHaveCount(0);
    await expect.soft(dev.page.getByText("Waiting for review").first(), "waiting text").toBeVisible();
    const refused = await api(dev.page, "/api/ledger/links/00000000-0000-4000-8000-000000000000/review", "POST", {
      decision: "confirm",
    });
    console.log(`step 4: review of a missing link as Developer ${refused.status}`);
  });

  let confirmedStatement = "";

  await test.step("Owner confirms one meeting link and rejects another in the UI", async () => {
    const body = (await api<LedgerBody>(owner.page, ledgerUrl)).body;
    const rows = (body.needsReview ?? []).filter((r) => r.evidenceKind === "meeting");
    const group = owner.page.locator('section[aria-label="Needs your review"]');
    const first = rows[0] ?? (body.needsReview ?? [])[0];
    expect.soft(first, "something to confirm").toBeTruthy();
    if (!first) return;
    confirmedStatement = first.item.statement;
    await owner.page.goto(promisesTab);
    const row = group.locator("li").filter({ hasText: first.item.statement }).first();
    await row.getByRole("button", { name: "Confirm" }).click();
    await expect.poll(async () => (await api<LedgerBody>(owner.page, ledgerUrl)).body.reviewCount, { timeout: 20000 }).toBeLessThan(
      body.reviewCount ?? 0,
    );
    const after = (await allItems()).find((i) => i.id === first.item.id);
    console.log(`review: ${first.evidenceKind} confirmed, item now ${after?.derivedStatus}, kept step ${after?.outcome.kept.state}`);
    expect.soft(after?.derivedStatus, "confirmed item").toBe("kept");
    const { data: decided } = await db.from("ledger_links").select("decided_by").eq("id", first.id).single();
    expect.soft(decided?.decided_by, "decided_by is set").toBeTruthy();

    const second = rows[1];
    if (!second) {
      console.log("review: no second meeting link to reject");
      return;
    }
    await owner.page.goto(promisesTab);
    await group.locator("li").filter({ hasText: second.item.statement }).first().getByRole("button", { name: "Not a match" }).click();
    await expect.poll(async () => (await api<LedgerBody>(owner.page, ledgerUrl)).body.reviewCount, { timeout: 20000 }).toBeLessThan(
      (body.reviewCount ?? 0) - 1,
    );
    const rejected = (await allItems()).find((i) => i.id === second.item.id);
    console.log(`review: rejected, item now ${rejected?.derivedStatus}`);
    expect.soft(rejected?.derivedStatus, "rejected item stays open").not.toBe("kept");
  });

  await test.step("5 Viewer: hidden quotes and no PR details on every surface, JSON too", async () => {
    const ownerTask = await api<Record<string, unknown>>(owner.page, `/api/tasks/${taskId}`);
    expect.soft(JSON.stringify(ownerTask.body), "control: Owner does get the PR title").toContain(FAKE_TITLE);

    const seen = watchProofRoutes(viewer.page);
    await viewer.page.goto(promisesTab);
    await cards(viewer.page).first().waitFor({ timeout: 40000 });
    await expect.soft(viewer.page.getByText("Hidden for viewers").first(), "tab").toBeVisible();
    await expect.soft(viewer.page.getByRole("heading", { name: "Needs your review" })).toHaveCount(0);
    await expect.soft(viewer.page.getByRole("button", { name: "Confirm" })).toHaveCount(0);

    const taskButton = viewer.page.locator('section[aria-label="Outcome"] button').first();
    await taskButton.click();
    const drawer = viewer.page.getByRole("dialog", { name: "Task details" });
    await drawer.waitFor({ timeout: 30000 });
    // Without this the checks below would pass on the loading spinner's empty text.
    await drawer.getByRole("heading", { name: "Pull requests" }).waitFor({ timeout: 30000 });
    const drawerText = await drawer.innerText();
    console.log(`step 5 drawer: ${drawerText.replace(/\n/g, " | ").slice(0, 400)}`);
    expect.soft(drawerText, "drawer hides the quote").toContain("Hidden for viewers");
    for (const secret of [FAKE_TITLE, FAKE_REPO, "#9001"]) expect.soft(drawerText, `drawer has no ${secret}`).not.toContain(secret);
    await expect.soft(drawer.locator(`a[href*="github.com"]`), "drawer has no PR link").toHaveCount(0);

    for (const meetingId of [meetingOne, meetingTwo]) {
      await viewer.page.goto(`/meeting-intelligence/${meetingId}`);
      const tab = viewer.page.getByRole("button", { name: /^Ledger/ });
      await tab.waitFor({ timeout: 40000 });
      await tab.click();
      await viewer.page.getByText("Hidden for viewers").first().waitFor({ timeout: 30000 }).catch(() => {});
      const text = await viewer.page.locator("body").innerText();
      console.log(`step 5 ledger tab ${meetingId === meetingOne ? "first" : "second"}: hidden ${text.includes("Hidden for viewers")}`);
      expect.soft(text, "ledger tab hides the quote").toContain("Hidden for viewers");
      for (const secret of [FAKE_TITLE, FAKE_REPO]) expect.soft(text, `ledger tab has no ${secret}`).not.toContain(secret);
      await expect.soft(viewer.page.getByRole("button", { name: "Check again" })).toHaveCount(0);
    }

    await viewer.page.goto(activityTab);
    await viewer.page.locator("time").first().waitFor({ timeout: 40000 });
    const activityText = await viewer.page.locator("body").innerText();
    for (const secret of [FAKE_TITLE, FAKE_REPO]) expect.soft(activityText, `activity has no ${secret}`).not.toContain(secret);

    const direct = [
      await api(viewer.page, `/api/tasks/${taskId}`),
      await api(viewer.page, `/api/ledger?meetingId=${meetingOne}&today=${karachiDay()}`),
      await api(viewer.page, `/api/ledger?meetingId=${meetingTwo}&today=${karachiDay()}`),
      await api(viewer.page, ledgerUrl),
      await api(viewer.page, `/api/projects/${projectId}/activity`),
    ];
    for (const res of direct) {
      expect.soft(res.status, "viewer may read").toBe(200);
      expect.soft(viewerLeaks(res.body), "no forbidden keys").toEqual([]);
    }
    const captured = await seen();
    console.log(`step 5: ${captured.length} responses captured from ${[...new Set(captured.map((r) => r.path.replace(/[0-9a-f-]{36}/g, "[id]")))].join(", ")}`);
    for (const res of captured) {
      const parsed = JSON.parse(res.text) as unknown;
      expect.soft(viewerLeaks(parsed), `forbidden keys in ${res.path}`).toEqual([]);
      for (const secret of [FAKE_TITLE, FAKE_REPO, FAKE_URL]) expect.soft(res.text, `${secret} in ${res.path}`).not.toContain(secret);
    }
  });

  await test.step("6 Admin who did not create the meeting gets the tab and controls, a personal meeting stays closed", async () => {
    await admin.page.goto(`/meeting-intelligence/${meetingOne}`);
    const tab = admin.page.getByRole("button", { name: /^Ledger/ });
    await tab.waitFor({ timeout: 40000 });
    await tab.click();
    await expect.soft(admin.page.getByRole("button", { name: "Check again" }), "Admin has Check again").toBeVisible({ timeout: 30000 });
    const adminRead = await api<LedgerBody>(admin.page, ledgerUrl);
    expect.soft(adminRead.body.canReview, "Admin can review").toBe(true);

    await dev.page.goto(`/meeting-intelligence/${meetingOne}`);
    const devTab = dev.page.getByRole("button", { name: /^Ledger/ });
    await devTab.waitFor({ timeout: 40000 });
    await devTab.click();
    await dev.page.waitForTimeout(4000);
    await expect.soft(dev.page.getByRole("button", { name: "Check again" }), "Developer has no Check again").toHaveCount(0);

    // Someone else's personal meeting, opened as a recorded participant so the page renders.
    await owner.page.goto("/dashboard");
    await owner.page.getByText("Schedule Meeting", { exact: true }).first().click();
    const title = `${TAG} W6 personal ${Date.now()}`;
    await owner.page.getByPlaceholder("e.g. Weekly product sync").fill(title);
    await owner.page.getByRole("button", { name: "Schedule", exact: true }).click();
    await expect(owner.page.getByText("Your meeting is scheduled")).toBeVisible({ timeout: 40000 });
    const link = await owner.page.locator("input[readonly]").last().inputValue();
    const callId = link.split("/meeting/")[1];
    const personalId = await meetingIdOf(owner.page, callId);
    await owner.page.goto(`/meeting-intelligence/${personalId}`);
    await expect.soft(owner.page.getByRole("button", { name: /^Ledger/ }), "creator has the tab").toBeVisible({ timeout: 40000 });

    const joined = await api(other.page, "/api/attendance/event", "POST", { stream_call_id: callId, event_type: "join" });
    console.log(`step 6: attendance as someone else ${joined.status}`);
    await other.page.goto(`/meeting-intelligence/${personalId}`);
    await other.page.getByRole("button", { name: "Overview" }).waitFor({ timeout: 40000 }).catch(() => {});
    const opened = await other.page.getByRole("button", { name: "Overview" }).count();
    console.log(`step 6: page rendered for the participant ${opened > 0}`);
    expect.soft(opened, "page rendered, so the hidden tab means something").toBeGreaterThan(0);
    await expect.soft(other.page.getByRole("button", { name: /^Ledger/ }), "someone else has no tab").toHaveCount(0);
    const blocked = await api(other.page, `/api/ledger?meetingId=${personalId}&today=${karachiDay()}`);
    console.log(`step 6: ledger API for someone else ${blocked.status}`);
    expect.soft([403, 404], "ledger API refuses").toContain(blocked.status);
    const outsider = await api(other.page, ledgerUrl);
    expect.soft(outsider.status, "non member of the project").toBe(404);
  });

  await test.step("7 Activity: sentences, newest first, scroll loads more, names the person, no invites", async () => {
    const res = await api<{ rows?: Record<string, unknown>[]; nextBefore?: string | null }>(owner.page, `/api/projects/${projectId}/activity`);
    const rows = res.body.rows ?? [];
    console.log(`step 7: first page ${rows.length}, has next ${Boolean(res.body.nextBefore)}, kinds ${[...new Set(rows.map((r) => r.kind))].join(", ")}`);
    expect.soft(rows.length, "page size").toBe(50);
    expect.soft(rows.some((r) => "detail" in r), "no raw detail").toBe(false);

    await owner.page.goto(activityTab);
    const times = owner.page.locator("time");
    await times.first().waitFor({ timeout: 40000 });
    await expect.soft(times).toHaveCount(50, { timeout: 15000 }).catch(() => {});
    const order = async () => times.evaluateAll((els) => els.map((el) => el.getAttribute("datetime") ?? ""));
    const initial = await order();
    const nextPage = owner.page.waitForResponse((r) => r.url().includes("/activity?before="), { timeout: 30000 }).catch(() => null);
    await times.last().scrollIntoViewIfNeeded();
    await owner.page.mouse.wheel(0, 6000);
    const loaded = await nextPage;
    console.log(`step 7: scroll request ${loaded ? loaded.status() : "none"}, rows before ${initial.length}`);
    expect.soft(loaded?.status(), "scroll loads the next page").toBe(200);
    await expect.poll(async () => times.count(), { timeout: 20000 }).toBeGreaterThan(50);
    const all = await order();
    const sorted = [...all].sort((x, y) => Date.parse(y) - Date.parse(x));
    expect.soft(all.map((t) => Date.parse(t)), "newest first").toEqual(sorted.map((t) => Date.parse(t)));
    expect.soft(new Set(all).size > 1, "more than one time to compare").toBe(true);

    // Only the rows: the sidebar always shows your own email.
    const text = (await owner.page.locator("li").filter({ has: owner.page.locator("time") }).allInnerTexts()).join("\n");
    console.log(`step 7 top rows: ${text.split("\n").filter((l) => /Wtest|WSX|Someone|Unknown/.test(l)).slice(0, 6).join(" | ")}`);
    expect.soft(/invit/i.test(text), "no invite rows").toBe(false);
    expect.soft(text, "no email addresses").not.toContain("clerk_test@example.com");
    expect.soft(text, "no unknown wording").not.toContain("Something changed");
    if (confirmedStatement) {
      await expect.soft(owner.page.getByText(`${a.name} confirmed a promise as kept`).first(), "confirmation names you").toBeVisible();
    }
    await expect.soft(owner.page.getByText(`${a.name} created the project`).first(), "creation names you").toBeVisible({ timeout: 20000 }).catch(() => {});
    console.log(`step 7: final rows ${all.length}`);
  });

  for (const s of [owner, dev, other, viewer, admin]) await s.context.close();
});
