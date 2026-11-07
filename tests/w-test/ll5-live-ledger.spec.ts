import { chromium, expect, test, type Page } from "@playwright/test";
import { api, meetingIdOf, person, prepare, processMeeting, signIn, TAG, uploadTranscript } from "./helpers";

// LL5, docs/specs/0002-live-ledger/index.md: one signed in person and one guest
// raise, mark, agree, end, generate a transcript, run the match, check the Ledger
// tab. Chrome plays synthetic speech as each person's mic (WAV files from macOS
// say), so this proves logic and the pipeline, not real voices or call quality.
const AUDIO = process.env.LL5_AUDIO_DIR as string;
const fakeArgs = (wav: string) => [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  `--use-file-for-fake-audio-capture=${AUDIO}/${wav}`,
];

test.use({
  actionTimeout: 30000,
  navigationTimeout: 60000,
  viewport: { width: 1600, height: 1000 },
  launchOptions: { args: fakeArgs("owner.wav") },
});

const OWNER = person("a");
const inRoom = (page: Page) => page.getByRole("button", { name: /(Mute|Unmute) microphone/ });
const today = new Date().toISOString().slice(0, 10);

test("LL5 live ledger, two person", async ({ browser, baseURL }) => {
  test.setTimeout(2400000);
  await prepare([OWNER]);
  const owner = await signIn(browser, OWNER);
  const problems: string[] = [];
  owner.page.on("console", (m) => {
    if (/Maximum update depth|sfuClient|Too many re-renders/.test(m.text())) problems.push(m.text().slice(0, 200));
  });

  const stamp = Date.now();
  const budget = `budget report ${stamp}`;
  await test.step("0 an earlier meeting holds the promises", async () => {
    const earlier = await uploadTranscript(owner.page, {
      title: `${TAG} LL5 earlier`,
      rawText: [
        "Wtest a: Thanks for joining the review.",
        "Wtest a: I will send the budget report to the finance team by Friday.",
        "Wtest a: I will start the office network upgrade this month.",
      ].join("\n"),
    });
    const done = await processMeeting(owner.page, earlier);
    expect(done.status, "earlier process").toBe(200);
    const embed = await api(owner.page, "/api/ai/embed", "POST", { meetingId: earlier }, 170000);
    expect.soft(embed.status, "earlier embed").toBe(200);
    const ledger = await api<{ items?: { statement: string; status?: string }[] }>(
      owner.page,
      `/api/ledger?meetingId=${earlier}&today=${today}`,
    );
    console.log(`step 0: ${earlier} items ${JSON.stringify(ledger.body.items?.map((i) => i.statement))}`);
  });

  let callId = "";
  await test.step("1 the owner starts a personal call, records, opens the panel", async () => {
    await owner.page.goto("/dashboard");
    await owner.page.getByText("Schedule Meeting", { exact: true }).first().click();
    await owner.page.getByPlaceholder("e.g. Weekly product sync").fill(`${TAG} LL5 live`);
    await owner.page.getByRole("button", { name: "Schedule", exact: true }).click();
    await expect(owner.page.getByText("Your meeting is scheduled")).toBeVisible({ timeout: 40000 });
    const link = await owner.page.locator("input[readonly]").last().inputValue();
    callId = link.split("/meeting/")[1];
    await owner.page.goto(`/meeting/${callId}`);
    await owner.page.getByRole("button", { name: "Join Meeting" }).click();
    await expect(inRoom(owner.page)).toBeVisible({ timeout: 60000 });
    await owner.page.getByRole("button", { name: "Record", exact: true }).click();
    await expect.soft(owner.page.getByRole("button", { name: "Stop", exact: true }), "recording on").toBeVisible({
      timeout: 20000,
    });
    await owner.page.getByRole("button", { name: "Open Live Ledger" }).click();
    await expect.soft(owner.page.getByRole("region", { name: "Live Ledger" })).toBeVisible({ timeout: 15000 });
  });
  const panel = owner.page.getByRole("region", { name: "Live Ledger" });
  const pick = async (word: string): Promise<void> => {
    await panel.getByLabel("Search promises").fill(word);
    await panel.locator("li button").first().click();
  };

  await test.step("2 a card raised before the guest joins reaches them on joining", async () => {
    await pick("budget");
    await panel.getByRole("button", { name: "Show to everyone" }).click();
    await expect.soft(panel.getByTestId("live-card-controls")).toBeVisible({ timeout: 20000 });
  });

  const guestBrowser = await chromium.launch({ args: fakeArgs("guest.wav") });
  const guestContext = await guestBrowser.newContext({
    baseURL,
    permissions: ["camera", "microphone"],
    viewport: { width: 1600, height: 1000 },
  });
  const guest = await guestContext.newPage();
  guest.on("response", (r) => {
    if (r.url().includes("/api/ledger/live") && r.status() >= 400) console.log(`guest ledger ${r.status()} ${r.url().slice(-60)}`);
  });

  await test.step("3 the guest joins, sees the card, has no owner control", async () => {
    await guest.goto(`/meeting/${callId}/guest`);
    await guest.getByPlaceholder("Your name").fill("Wtest guest");
    await guest.getByRole("button", { name: "Join meeting" }).click();
    await owner.page.getByRole("button", { name: "Accept" }).first().click({ timeout: 40000 });
    await expect(inRoom(guest), "guest in room").toBeVisible({ timeout: 90000 });
    await expect.soft(guest.getByText(/budget/i).first(), "late joiner sees the card").toBeVisible({ timeout: 20000 });
    await expect.soft(guest.getByRole("button", { name: "Open Live Ledger" }), "no owner control").toHaveCount(0);
    const refused = await api(guest, "/api/ledger/live/card", "POST", { callId, itemId: "x", action: "close" });
    console.log(`step 3: guest card route gave ${refused.status}`);
    expect.soft(refused.status, "guest refused").toBeGreaterThanOrEqual(400);
    expect.soft(refused.status, "guest refused").toBeLessThan(500);
  });

  await test.step("4 the mark reaches the guest, close removes the card", async () => {
    await panel.getByRole("group", { name: "Mark this promise" }).getByRole("button", { name: "Kept" }).click();
    await expect.soft(guest.getByText("Kept").first(), "guest sees the mark").toBeVisible({ timeout: 20000 });
    await panel.getByRole("button", { name: "Close card" }).click();
    await expect.soft(guest.getByText(/budget/i), "card leaves the guest").toHaveCount(0, { timeout: 20000 });
  });

  await test.step("5 a preview stays private, then a second card is marked Still open", async () => {
    await pick("network");
    await owner.page.waitForTimeout(3000);
    await expect.soft(panel.getByText("Only you can see this preview.")).toBeVisible();
    await expect.soft(guest.getByText(/network/i), "preview hidden from guest").toHaveCount(0);
    await panel.getByRole("button", { name: "Show to everyone" }).click();
    await expect.soft(guest.getByText(/network/i).first(), "guest sees card two").toBeVisible({ timeout: 20000 });
    await panel.getByRole("group", { name: "Mark this promise" }).getByRole("button", { name: "Still open" }).click();
    await owner.page.waitForTimeout(1500);
    await panel.getByRole("button", { name: "Close card" }).click();
    await panel.getByLabel("Search promises").fill("");
  });

  const decision = `We launch the beta on the fifteenth ${stamp}`;
  await test.step("6 Agreement Check, the tally moves, close saves agreed by 2 of 2", async () => {
    await panel.getByLabel("Decision to agree on").fill(decision);
    await panel.getByRole("button", { name: "Ask everyone" }).click();
    const prompt = guest.getByRole("region", { name: "Agreement check" }).or(guest.locator('[aria-label="Agreement check"]'));
    await expect.soft(prompt.getByText(decision), "guest sees the decision").toBeVisible({ timeout: 20000 });
    await prompt.getByRole("button", { name: "Not yet" }).click();
    await expect.soft(panel.getByText("0 agree · 1 not yet"), "not yet tallied").toBeVisible({ timeout: 20000 });
    await prompt.getByRole("button", { name: "Agree", exact: true }).click();
    await expect.soft(panel.getByText("1 agree · 0 not yet"), "changing a vote keeps one vote").toBeVisible({ timeout: 20000 });
    const mine = owner.page.locator('[aria-label="Agreement check"]');
    // The open panel's backdrop covers the owner's own prompt (finding), so the
    // panel has to close before the owner can vote.
    await panel.getByRole("button", { name: "Close Live Ledger" }).click();
    await mine.getByRole("button", { name: "Agree", exact: true }).click();
    await owner.page.getByRole("button", { name: "Open Live Ledger" }).click();
    await expect.soft(panel.getByText("2 agree · 0 not yet"), "owner vote").toBeVisible({ timeout: 20000 });
    await panel.getByRole("button", { name: "Close and save" }).click();
    await expect.soft(panel.getByText(/Saved: agreed by 2 of 2/), "saved").toBeVisible({ timeout: 20000 });
    await expect.soft(guest.getByText("Agreement saved"), "guest sees it saved").toBeVisible({ timeout: 20000 });
  });

  await test.step("7 AC-17 the room stays stable with the panel open while people talk", async () => {
    await owner.page.waitForTimeout(90000);
    await expect.soft(inRoom(owner.page), "owner still in").toBeVisible();
    await expect.soft(inRoom(guest), "guest still in").toBeVisible();
    console.log(`step 7: loop or SFU errors seen ${problems.length} ${JSON.stringify(problems.slice(0, 3))}`);
    expect.soft(problems.length, "no render loop").toBe(0);
  });

  await test.step("8 the owner ends the call for everyone", async () => {
    await owner.page.getByRole("button", { name: "End call for everyone" }).click();
    await expect.soft(inRoom(guest), "guest removed").toBeHidden({ timeout: 40000 });
    await guestBrowser.close();
  });

  let meetingId = "";
  await test.step("9 generate the transcript from the recordings, then run the pipeline", async () => {
    await owner.page.goto("/dashboard");
    meetingId = await meetingIdOf(owner.page, callId);
    let transcript = "";
    for (let i = 1; i <= 16 && !transcript; i += 1) {
      const res = await api<{ status?: string; transcript?: string; message?: string }>(
        owner.page,
        "/api/transcript/download",
        "POST",
        { meetingId, streamCallId: callId },
        170000,
      );
      console.log(`step 9: generate try ${i} http ${res.status} ${res.body.status} ${res.body.message ?? ""}`.slice(0, 200));
      if (res.body.status === "ok") transcript = res.body.transcript ?? "";
      else if (res.body.status !== "no_recording" && res.status !== 0) break;
      else await owner.page.waitForTimeout(30000);
    }
    console.log(`step 9: transcript ${transcript.length} chars\n${transcript.slice(0, 900)}`);
    expect.soft(transcript.length, "real transcript from the call").toBeGreaterThan(0);
    const rawText =
      transcript ||
      [
        "Wtest a: I sent the budget report to the finance team yesterday, so that promise is done.",
        "Wtest a: The office network upgrade has not started, it is still open.",
        "Wtest guest: I will prepare the launch checklist by next Tuesday.",
      ].join("\n");
    if (!transcript) console.log("step 9: FALLBACK, scripted transcript used for the rest of the run");
    await uploadTranscript(owner.page, { title: `${TAG} LL5 live`, rawText, meetingId });
    const done = await processMeeting(owner.page, meetingId);
    expect.soft(done.status, "process").toBe(200);
    const embed = await api(owner.page, "/api/ai/embed", "POST", { meetingId }, 170000);
    expect.soft(embed.status, "embed").toBe(200);
    const match = await api(owner.page, "/api/ledger/match", "POST", { meetingId }, 170000);
    console.log(`step 9: match ${match.status} ${JSON.stringify(match.body).slice(0, 300)}`);
    expect.soft(match.status, "match").toBe(200);
  });

  await test.step("10 the Ledger tab shows the live marks, the agreement, and the links", async () => {
    const ledger = await api<Record<string, unknown>>(owner.page, `/api/ledger?meetingId=${meetingId}&today=${today}`);
    console.log(`step 10: ledger ${JSON.stringify(ledger.body).slice(0, 1800)}`);
    await owner.page.goto(`/meeting-intelligence/${meetingId}`);
    await owner.page.getByRole("button", { name: "Ledger", exact: true }).click();
    await expect.soft(owner.page.getByText("Agreed live by 2 of 2").first(), "agreement badge").toBeVisible({ timeout: 30000 });
    await expect.soft(owner.page.getByText("Marked live").first().or(owner.page.getByText(/Marked live as/).first()), "live mark shown").toBeVisible({ timeout: 15000 });
    const seen = (await owner.page.locator("main").innerText()).replace(/\s+/g, " ");
    console.log(`step 10: tab text ${seen.slice(0, 1400)}`);
  });

  console.log(`LL5 call ${callId} meeting ${meetingId}`);
});
