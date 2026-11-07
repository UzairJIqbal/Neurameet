import fs from "node:fs";
import path from "node:path";
import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Shared by the owed manual test scripts (W2, W3, W4, LL5, Tasdeeq). Every
// record these create is named "E2E W-test" so it can be found and cleaned up.
export const TAG = "E2E W-test";

export type Person = { key: string; email: string; name: string };

export const person = (key: string): Person => ({
  key,
  email: `e2e-wtest-${key}+clerk_test@example.com`,
  name: `Wtest ${key}`,
});

export type Session = { context: BrowserContext; page: Page; who: Person };

const loadEnvLocal = () => {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const key = t.slice(0, t.indexOf("=")).trim();
      const value = t.slice(t.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
};

// Refuses to run against a production Clerk instance. Prints no key values.
export const prepare = async (people: Person[]): Promise<void> => {
  loadEnvLocal();
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Stopped: CLERK_SECRET_KEY is not a development key.");
  }
  const client = createClerkClient({ secretKey });
  for (const p of people) {
    const found = await client.users.getUserList({ emailAddress: [p.email] });
    if (found.data.length > 0) continue;
    await client.users.createUser({
      emailAddress: [p.email],
      firstName: "Wtest",
      lastName: p.key,
      skipPasswordRequirement: true,
    });
  }
  await clerkSetup();
};

const signInOnce = async (browser: Browser, who: Person, landing: string): Promise<Session> => {
  const context = await browser.newContext({ permissions: ["camera", "microphone"] });
  const page = await context.newPage();
  const attempt = (async () => {
    await page.goto("/sign-in", { timeout: 120000 });
    await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded));
    await clerk.signIn({ page, emailAddress: who.email });
    await page.goto(landing, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
  })();
  const limit = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`sign in stalled for ${who.key}`)), 75000);
  });
  try {
    await Promise.race([attempt, limit]);
    return { context, page, who };
  } catch (err) {
    attempt.catch(() => {});
    await context.close().catch(() => {});
    throw err;
  }
};

// A browser side stall was seen on sign in, so one retry, and it gets logged.
export const signIn = async (browser: Browser, who: Person, landing = "/projects"): Promise<Session> => {
  try {
    return await signInOnce(browser, who, landing);
  } catch (err) {
    console.log(`RETRY sign in: ${String(err)}`);
    return signInOnce(browser, who, landing);
  }
};

export type ApiResult<T = Record<string, unknown>> = { status: number; body: T };

// Same origin fetch from inside the page, so Clerk's refreshed session applies.
export const api = async <T = Record<string, unknown>>(
  page: Page,
  url: string,
  method = "GET",
  body?: unknown,
  timeoutMs = 45000,
): Promise<ApiResult<T>> =>
  page.evaluate(
    async ({ url, method, body, timeoutMs }) => {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        return { status: 0, body: { error: `no response: ${String(err)}` } as T };
      }
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 200) };
      }
      return { status: res.status, body: parsed as T };
    },
    { url, method, body, timeoutMs },
  );

export const createProject = async (page: Page, label: string, taskPrefix: string): Promise<string> => {
  const res = await api<{ project?: { id: string }; id?: string; error?: string }>(page, "/api/projects", "POST", {
    name: `${TAG} ${label} ${Date.now()}`,
    taskPrefix,
  });
  expect(res.status, `create project: ${JSON.stringify(res.body)}`).toBeLessThan(300);
  const id = res.body.project?.id ?? res.body.id;
  if (!id) throw new Error("create project returned no id");
  return id;
};

export type Invite = { status: number; link?: string; error?: string; emailSent?: boolean };

export const inviteByApi = async (
  page: Page,
  projectId: string,
  input: { kind: "email" | "link"; email?: string; role: string },
): Promise<Invite> => {
  const res = await api<{ link?: string; error?: string; emailSent?: boolean }>(
    page,
    `/api/projects/${projectId}/invitations`,
    "POST",
    input,
  );
  return { status: res.status, ...res.body };
};

// Puts someone in a project directly: email invite, then they accept it.
export const addMember = async (owner: Page, member: Session, projectId: string, role: string): Promise<void> => {
  const invite = await inviteByApi(owner, projectId, { kind: "email", email: member.who.email, role });
  expect(invite.link, `invite ${member.who.key}: ${invite.error ?? invite.status}`).toBeTruthy();
  const token = new URL(invite.link as string).pathname.split("/").pop();
  const res = await api(member.page, "/api/invitations/accept", "POST", { token });
  expect(res.status, `accept ${member.who.key}: ${JSON.stringify(res.body)}`).toBeLessThan(300);
};

export const relativeLink = (link: string): string => new URL(link).pathname;

// Schedules a meeting in a project through the dashboard. Returns the Stream call id.
export const scheduleInProject = async (page: Page, projectId: string, title: string): Promise<string> => {
  await page.goto("/dashboard");
  await page.getByText("Schedule Meeting", { exact: true }).first().click();
  await page.getByPlaceholder("e.g. Weekly product sync").fill(title);
  await page.locator("#meeting-project").selectOption(projectId, { timeout: 30000 });
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByText("Your meeting is scheduled")).toBeVisible({ timeout: 40000 });
  const link = await page.locator("input[readonly]").last().inputValue();
  return link.split("/meeting/")[1];
};

export const meetingIdOf = async (page: Page, callId: string): Promise<string> => {
  const row = await api<{ meetingId?: string }>(page, `/api/meetings/by-call/${callId}`);
  if (!row.body.meetingId) throw new Error(`no meeting row for ${callId}`);
  return row.body.meetingId;
};

export const uploadTranscript = async (
  page: Page,
  input: { title: string; rawText: string; meetingId?: string },
): Promise<string> => {
  const res = await api<{ meetingId?: string; error?: string }>(page, "/api/transcript/upload", "POST", input);
  expect(res.status, `upload: ${JSON.stringify(res.body)}`).toBeLessThan(300);
  return res.body.meetingId as string;
};

// Gemini can be busy and the Groq fallback can fail on JSON (known bug), so a
// 500 retries and is counted. Anything else comes straight back.
export const processMeeting = async (page: Page, meetingId: string, tries = 8): Promise<ApiResult> => {
  let last: ApiResult = { status: 0, body: {} };
  for (let i = 1; i <= tries; i += 1) {
    last = await page.evaluate(
      async (id) => {
        const res = await fetch("/api/ai/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId: id }),
          signal: AbortSignal.timeout(170000),
        }).catch(() => null);
        if (!res) return { status: 0, body: {} };
        return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
      },
      meetingId,
    );
    if (last.status !== 500 && last.status !== 0) {
      console.log(`AI process ${meetingId}: ${last.status} on try ${i}`);
      return last;
    }
    console.log(`AI process RETRY ${meetingId}: ${last.status} on try ${i} ${JSON.stringify(last.body).slice(0, 160)}`);
    await page.waitForTimeout(45000);
  }
  return last;
};
