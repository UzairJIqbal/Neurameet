import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { api, person, prepare, processMeeting, signIn, TAG, uploadTranscript, type Session } from "./helpers";

// Tasdeeq, spec 0003 T6: owner plus two signed in attendees, one uploaded
// bilingual transcript. Attesters come from real attendance rows, so all three
// join a short call with fake media. This proves the review and seal logic; the
// catch rate study in reports/tasdeeq-evaluation-template.md needs real people.
test.use({ actionTimeout: 30000, navigationTimeout: 60000, viewport: { width: 1600, height: 1000 } });

const OWNER = person("a");
const B = person("b");
const C = person("c");
const OUTSIDER = person("d");
const LL5_MEETING = "c27cca89-5b0e-4e6b-91e1-f8901390496a";

type Line = { id: string; text: string; mine: boolean; canView: boolean; supported: boolean; myAnswer: unknown; speakerLabels: string[]; answers: unknown[] };
type State = {
  state: string;
  coverageText?: string;
  lines: Line[];
  speakers: { label: string; holderId: string | null; suggested: boolean }[];
  attesters: { displayName: string; isOwner: boolean; done: boolean }[];
  mySuggestions: { id: string; speakerLabel: string; quote: string; relatedLineId: string | null; status: string }[];
  sealBlocker: string | null;
  seal: { id: string; hash: string; statusText: string; verifyPath: string } | null;
  error?: string;
};

const inRoom = (page: Page) => page.getByRole("button", { name: /(Mute|Unmute) microphone/ });

test("Tasdeeq verified minutes, three people", async ({ browser }) => {
  test.setTimeout(1500000);
  await prepare([OWNER, B, C, OUTSIDER]);
  const owner = await signIn(browser, OWNER);
  const b = await signIn(browser, B);
  const c = await signIn(browser, C);
  const outsider = await signIn(browser, OUTSIDER);
  const stateOf = async (s: Session, id: string) => (await api<State>(s.page, `/api/minutes?meetingId=${id}`)).body;
  const post = (s: Session, path: string, body: unknown) => api<{ error?: string }>(s.page, `/api/minutes/${path}`, "POST", body);

  await test.step("LL5 leftover: is the guest's speech in the merged transcript", async () => {
    const res = await api(owner.page, `/api/meetings/${LL5_MEETING}`);
    const text = JSON.stringify(res.body);
    const count = (name: string) => text.split(`${name}:`).length - 1;
    console.log(`LL5 transcript http ${res.status}: "Wtest a:" ${count("Wtest a")}, "Wtest guest:" ${count("Wtest guest")}`);
  });

  // Set both to resume on a meeting that already has its call and transcript.
  const resumeCall = process.env.TASDEEQ_CALL ?? "";
  let callId = resumeCall;
  if (!resumeCall) await test.step("1 three signed in people join a short real call", async () => {
    await owner.page.goto("/dashboard");
    await owner.page.getByText("Schedule Meeting", { exact: true }).first().click();
    await owner.page.getByPlaceholder("e.g. Weekly product sync").fill(`${TAG} Tasdeeq`);
    await owner.page.getByRole("button", { name: "Schedule", exact: true }).click();
    await expect(owner.page.getByText("Your meeting is scheduled")).toBeVisible({ timeout: 40000 });
    callId = (await owner.page.locator("input[readonly]").last().inputValue()).split("/meeting/")[1];
    for (const s of [owner, b, c]) {
      await s.page.goto(`/meeting/${callId}`);
      await s.page.getByRole("button", { name: "Join Meeting" }).click();
      await expect(inRoom(s.page), `${s.who.key} in the room`).toBeVisible({ timeout: 90000 });
    }
    await owner.page.waitForTimeout(15000);
    await owner.page.getByRole("button", { name: "End call for everyone" }).click();
    await expect.soft(inRoom(b.page), "attendee leaves when the call ends").toBeHidden({ timeout: 40000 });
  });
  const row = await api<{ meetingId?: string }>(owner.page, `/api/meetings/by-call/${callId}`);
  const id = row.body.meetingId as string;
  console.log(`Tasdeeq call ${callId} meeting ${id}`);

  await test.step("2 a bilingual transcript is uploaded and processed", async () => {
    // A resumed run may find the review an earlier run opened; cancel it first.
    if (resumeCall) await post(owner, "review", { meetingId: id, action: "cancel" });
    if (!resumeCall) await uploadTranscript(owner.page, {
      title: `${TAG} Tasdeeq`,
      meetingId: id,
      rawText: [
        "Wtest a: Welcome everyone, aaj hum launch plan review karenge.",
        "Wtest a: We decided to launch the beta on the fifteenth.",
        "Wtest b: مجھے لگتا ہے کہ پندرہ تاریخ بہت جلدی ہے، ہمیں مزید ٹیسٹنگ چاہیے۔",
        "Wtest c: I will finish the payment tests by Friday.",
        "Wtest b: Main documentation Monday tak complete kar doon ga.",
        "Wtest a: Theek hai, I will move the support inbox to the new tool next week.",
      ].join("\n"),
    });
    const done = await processMeeting(owner.page, id, Number(process.env.TASDEEQ_TRIES ?? 8));
    expect(done.status, "process").toBe(200);
  });

  await test.step("3 before opening: owner sees the draft, attendee and outsider do not", async () => {
    const mine = await stateOf(owner, id);
    expect.soft(mine.state, "owner draft").toBe("draft");
    expect.soft((await stateOf(b, id)).state, "attendee not open").toBe("not_open");
    const out = await api<{ state?: string }>(outsider.page, `/api/minutes?meetingId=${id}`);
    console.log(`step 3: outsider http ${out.status} state ${out.body.state}`);
    expect.soft(out.body.state === undefined || out.body.state === "not_open", "outsider sees nothing").toBe(true);
    await owner.page.goto(`/meeting-intelligence/${id}`);
    await owner.page.getByRole("button", { name: "Minutes", exact: true }).click();
    await expect.soft(owner.page.getByText(/These minutes cover transcript lines/).first(), "coverage shown").toBeVisible({ timeout: 20000 });
    await expect.soft(owner.page.getByRole("button", { name: "Open review" }), "open button").toBeVisible({ timeout: 20000 });
  });

  await test.step("4 open, cancel, open again; lines freeze", async () => {
    expect.soft((await post(b, "review", { meetingId: id, action: "open", deadlineDays: 3 })).status, "attendee can't open").toBeGreaterThanOrEqual(403);
    expect.soft((await post(owner, "review", { meetingId: id, action: "open", deadlineDays: 3 })).status, "open").toBe(200);
    expect.soft((await post(owner, "review", { meetingId: id, action: "cancel" })).status, "cancel").toBe(200);
    expect.soft((await stateOf(owner, id)).state, "back to draft").toBe("draft");
    expect.soft((await post(owner, "review", { meetingId: id, action: "open", deadlineDays: 3 })).status, "open again").toBe(200);
    const st = await stateOf(owner, id);
    console.log(`step 4: attesters ${JSON.stringify(st.attesters)}`);
    expect.soft(st.attesters?.length, "owner plus two").toBe(3);
    expect.soft((await api(owner.page, "/api/ai/process", "POST", { meetingId: id })).status, "process frozen").toBe(409);
    expect.soft((await api(owner.page, "/api/transcript/upload", "POST", { title: `${TAG} Tasdeeq`, meetingId: id, rawText: "Wtest a: changed" })).status, "upload frozen").toBe(409);
    // A ready transcript is served from cache, which rewrites nothing; only generating is refused.
    const download = await api<{ cached?: boolean }>(owner.page, "/api/transcript/download", "POST", { meetingId: id, streamCallId: callId });
    expect.soft(download.status === 409 || download.body.cached === true, "download frozen or cached").toBe(true);
    expect.soft((await api(owner.page, `/api/minutes/pdf?meetingId=${id}`)).status, "PDF before seal").toBe(409);
    const out = await api<{ state?: string }>(outsider.page, `/api/minutes?meetingId=${id}`);
    expect.soft(out.body.state === undefined || out.body.state === "not_open", "outsider still nothing").toBe(true);
  });

  await test.step("5 the seed tool plants errors in this meeting only", async () => {
    const dry = execFileSync("npx", ["tsx", "scripts/tasdeeq-seed.ts", id, "3"], { encoding: "utf8" });
    console.log(`step 5 dry run:\n${dry}`);
    const real = execFileSync("npx", ["tsx", "scripts/tasdeeq-seed.ts", id, "3", "--write"], { encoding: "utf8" });
    console.log(`step 5 write:\n${real}`);
  });

  await test.step("6 speakers: suggested, claimed in the UI and by API, assigned", async () => {
    const st = await stateOf(b, id);
    console.log(`step 6: speakers for b ${JSON.stringify(st.speakers)}`);
    expect.soft(st.speakers.find((s) => s.label === "Wtest b")?.suggested, "b is suggested").toBe(true);
    await b.page.goto(`/meeting-intelligence/${id}`);
    await b.page.getByRole("button", { name: "Minutes", exact: true }).click();
    await expect.soft(b.page.getByText("This looks like you").first(), "suggestion shown").toBeVisible({ timeout: 20000 });
    const row = b.page.locator("li").filter({ hasText: "This looks like you" });
    await row.getByRole("button", { name: "Claim" }).click();
    await expect.soft(b.page.getByText("Speaker name saved").first(), "claim toast").toBeVisible({ timeout: 15000 });
    expect.soft((await post(c, "claim", { meetingId: id, action: "claim", speakerLabel: "Wtest c" })).status, "c claims").toBe(200);
    expect.soft((await post(owner, "claim", { meetingId: id, action: "claim", speakerLabel: "Wtest a" })).status, "owner claims").toBe(200);
    const stolen = await post(c, "claim", { meetingId: id, action: "claim", speakerLabel: "Wtest b" });
    console.log(`step 6: claiming a held label gave ${stolen.status} ${stolen.body.error}`);
    expect.soft(stolen.status, "held label").toBeGreaterThanOrEqual(400);
    const mineB = (await stateOf(b, id)).lines.filter((l) => l.mine).map((l) => l.text);
    console.log(`step 6: b's lines ${JSON.stringify(mineB)}`);
    expect.soft(mineB.length, "b has lines").toBeGreaterThan(0);
  });

  await test.step("7 answers: Confirm and Record my view in the UI, Correct by API, wrong answers refused", async () => {
    const st = await stateOf(b, id);
    const notMine = st.lines.find((l) => !l.mine && !l.canView) ?? st.lines.find((l) => !l.mine);
    if (notMine) {
      const res = await post(b, "attest", { meetingId: id, action: "confirm", lineId: notMine.id });
      console.log(`step 7: confirm on someone else's line gave ${res.status} ${res.body.error}`);
      expect.soft(res.status, "not attributed").toBe(422);
    }
    const out = await post(outsider, "attest", { meetingId: id, action: "confirm", lineId: st.lines[0].id });
    expect.soft(out.status, "outsider can't answer").toBeGreaterThanOrEqual(403);
    const early = await post(b, "attest", { meetingId: id, action: "finish" });
    console.log(`step 7: early finish gave ${early.status} ${early.body.error}`);
    if (st.lines.some((l) => l.mine)) expect.soft(early.status, "finish with lines left").toBe(409);
    console.log(`step 7: b's suggestions ${JSON.stringify(st.mySuggestions)}`);
    const cSees = (await stateOf(c, id)).mySuggestions;
    expect.soft(cSees.every((s) => s.speakerLabel === "Wtest c"), "suggestions private").toBe(true);

    await b.page.reload();
    await b.page.getByRole("button", { name: "Minutes", exact: true }).click();
    await b.page.getByRole("button", { name: "Record my view" }).first().click();
    await b.page.getByRole("textbox").last().fill("پندرہ تاریخ بہت جلدی ہے، I disagree with this date.");
    await b.page.getByRole("button", { name: "Save" }).first().click();
    await expect.soft(b.page.getByText("Answer saved").first(), "view saved").toBeVisible({ timeout: 15000 });
    await expect.soft(b.page.getByText("Recorded view").first(), "view badge").toBeVisible({ timeout: 15000 });

    await owner.page.reload();
    await owner.page.getByRole("button", { name: "Minutes", exact: true }).click();
    await owner.page.getByRole("button", { name: "Confirm" }).first().click();
    await expect.soft(owner.page.getByText("Answer saved").first(), "confirm saved").toBeVisible({ timeout: 15000 });

    const cLines = (await stateOf(c, id)).lines.filter((l) => l.mine);
    if (cLines[0]) {
      expect.soft((await post(c, "attest", { meetingId: id, action: "correct", lineId: cLines[0].id, note: "The payment tests finish on Friday, not earlier." })).status, "correct").toBe(200);
      expect.soft((await post(c, "attest", { meetingId: id, action: "confirm", lineId: cLines[0].id })).status, "change an answer").toBe(200);
      expect.soft((await post(c, "attest", { meetingId: id, action: "correct", lineId: cLines[0].id, note: "Latest answer wins, Friday." })).status, "change back").toBe(200);
      const after = (await stateOf(c, id)).lines.find((l) => l.id === cLines[0].id);
      expect.soft(after?.answers.length, "one answer per person").toBe(1);
    }
  });

  const finishAll = async (s: Session): Promise<void> => {
    const st = await stateOf(s, id);
    for (const l of st.lines.filter((x) => x.mine && !x.myAnswer)) {
      const res = await post(s, "attest", { meetingId: id, action: "confirm", lineId: l.id });
      expect.soft(res.status, `${s.who.key} confirm`).toBe(200);
    }
    const res = await post(s, "attest", { meetingId: id, action: "finish" });
    expect.soft(res.status, `${s.who.key} finish: ${res.body.error}`).toBe(200);
  };

  let sealId = "";
  let hash = "";
  await test.step("8 seal: refused until the owner and a quorum finish, owner only", async () => {
    const first = await post(owner, "seal", { meetingId: id });
    console.log(`step 8: seal before finishing ${first.status} ${first.body.error}`);
    expect.soft(first.status, "owner not finished").toBe(409);
    await finishAll(owner);
    const second = await post(owner, "seal", { meetingId: id });
    console.log(`step 8: seal with no quorum ${second.status} ${second.body.error}`);
    expect.soft(second.status, "no quorum").toBe(409);
    await finishAll(b);
    const third = await post(owner, "seal", { meetingId: id });
    console.log(`step 8: seal with one of two ${third.status} ${third.body.error}`);
    expect.soft(third.status, "one of two is not more than half").toBe(409);
    await finishAll(c);
    expect.soft((await post(b, "seal", { meetingId: id })).status, "attendee can't seal").toBeGreaterThanOrEqual(403);
    const sealed = await post(owner, "seal", { meetingId: id });
    // A hard stop: step 10's delete check would really delete an unsealed meeting.
    expect(sealed.status, `seal: ${sealed.body.error}`).toBe(200);
    const st = await stateOf(c, id);
    console.log(`step 8: seal ${JSON.stringify(st.seal)}`);
    expect.soft(st.seal?.statusText, "status text").toMatch(/^Confirmed by \d+ of 3\./);
    sealId = st.seal?.id ?? "";
    hash = st.seal?.hash ?? "";
    expect.soft(hash, "a SHA-256").toMatch(/^[0-9a-f]{64}$/);
  });

  await test.step("9 public verify, signed out, without the minutes text", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/minutes/verify/${sealId}`);
    await expect.soft(page.getByText(/intact/i).first(), "verify page").toBeVisible({ timeout: 30000 });
    const good = await api<{ result?: string; hashMatches?: boolean }>(page, `/api/minutes/verify?sealId=${sealId}&hash=${hash}`);
    expect.soft(good.body.result, "intact").toBe("intact");
    expect.soft(good.body.hashMatches, "right hash").toBe(true);
    const bad = await api<{ hashMatches?: boolean }>(page, `/api/minutes/verify?sealId=${sealId}&hash=${"0".repeat(64)}`);
    expect.soft(bad.body.hashMatches, "wrong hash").toBe(false);
    console.log(`step 9: verify ${JSON.stringify(good.body)}`);
    const body = JSON.stringify(good.body);
    const lines = (await stateOf(owner, id)).lines;
    expect.soft(lines.some((l) => body.includes(l.text)), "no minutes text").toBe(false);
    await context.close();
  });

  await test.step("10 after the seal: PDF for attesters, nothing changes, delete refused", async () => {
    const pdf = (s: Session) =>
      s.page.evaluate(async (mid) => {
        const res = await fetch(`/api/minutes/pdf?meetingId=${mid}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        return { status: res.status, type: res.headers.get("content-type"), head: String.fromCharCode(...bytes.slice(0, 4)), size: bytes.length };
      }, id);
    const got = await pdf(c);
    console.log(`step 10: pdf ${JSON.stringify(got)}`);
    expect.soft(got.status, "attester PDF").toBe(200);
    expect.soft(got.head, "a PDF").toBe("%PDF");
    expect.soft((await pdf(outsider)).status, "outsider PDF").toBeGreaterThanOrEqual(403);
    const line = (await stateOf(c, id)).lines[0];
    expect.soft((await post(c, "attest", { meetingId: id, action: "view", lineId: line.id, note: "late" })).status, "answer after seal").toBe(409);
    expect.soft((await post(owner, "review", { meetingId: id, action: "cancel" })).status, "cancel after seal").toBe(409);
    expect.soft((await api(owner.page, "/api/ai/process", "POST", { meetingId: id })).status, "process after seal").toBe(409);
    const del = await api<{ error?: string }>(owner.page, `/api/meetings/${id}`, "DELETE");
    console.log(`step 10: delete ${del.status} ${del.body.error}`);
    expect.soft(del.status, "delete").toBe(409);
    expect.soft(del.body.error, "delete message").toBe("Sealed minutes can't be deleted");
    await owner.page.reload();
    await owner.page.getByRole("button", { name: "Minutes", exact: true }).click();
    await expect.soft(owner.page.getByText("Sealed minutes").first(), "sealed card").toBeVisible({ timeout: 20000 });
    const text = (await owner.page.locator("body").innerText()).replace(/\s+/g, " ");
    console.log(`step 10: tab ${text.slice(text.indexOf("Sealed minutes"), text.indexOf("Sealed minutes") + 500)}`);
  });
});
