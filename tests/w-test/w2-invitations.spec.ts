import { expect, test } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import {
  addMember,
  api,
  createProject,
  inviteByApi,
  person,
  prepare,
  relativeLink,
  signIn,
} from "./helpers";

// The nine test steps from prompts/step-W2-invitations.md. Soft checks, so one
// failing step still lets the rest report.
test.use({ actionTimeout: 30000, navigationTimeout: 60000 });

const A = person("a");
const B = person("b");
const C = person("c");
const D = person("d");
const E = person("e");
const F = person("f");

test("W2 invitations", async ({ browser }) => {
  test.setTimeout(420000);
  await prepare([A, B, C, D, E, F]);
  const a = await signIn(browser, A);
  const b = await signIn(browser, B);
  const c = await signIn(browser, C);
  const d = await signIn(browser, D);
  const e = await signIn(browser, E);
  const f = await signIn(browser, F);
  const projectId = await createProject(a.page, "W2", "WTB");
  const membersUrl = `/projects/${projectId}?tab=members`;
  let bLink = "";

  await test.step("1 invite B by email in the Add members dialog, then get the link by resending", async () => {
    await a.page.goto(membersUrl);
    await a.page
      .getByRole("button", { name: /add member/i })
      .first()
      .click();
    const dialog = a.page.getByRole("dialog", { name: "Add members" });
    await dialog.getByLabel("Email addresses").fill(`${B.email},`);
    await dialog
      .getByRole("radio", { name: /^Developer/ })
      .check({ force: true });
    await dialog.getByRole("button", { name: "Send Invitation" }).click();
    await expect
      .soft(dialog.getByLabel("Invite results"))
      .toContainText(B.email, { timeout: 20000 });
    const notSent = await dialog
      .getByText("Email not sent, copy the link.")
      .isVisible();
    console.log(
      `step 1: result row shown, email fallback message shown: ${notSent}`,
    );
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect.soft(a.page.getByText(B.email).first()).toBeVisible();
    // The token is shown once and never stored, so a resend mints the link this script needs.
    const list = await api<{
      invitations: { id: string; email: string | null }[];
    }>(a.page, `/api/projects/${projectId}/invitations`, "GET");
    const invite = list.body.invitations.find((i) => i.email === B.email);
    const resent = await api<{ link?: string }>(
      a.page,
      `/api/projects/${projectId}/invitations/${invite?.id}/resend`,
      "POST",
    );
    bLink = resent.body.link ?? "";
  });
  const bPath = relativeLink(bLink);

  await test.step("2 signed out goes to sign in, then returns to the invite", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(bPath, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/sign-in/, { timeout: 30000 });
    const back = new URL(page.url()).searchParams.get("redirect_url") ?? "";
    expect
      .soft(decodeURIComponent(back), "redirect keeps the invite path")
      .toContain(bPath);
    await page.waitForFunction(() =>
      Boolean(
        (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
      ),
    );
    await clerk.signIn({ page, emailAddress: B.email });
    await page.goto(back);
    await expect
      .soft(page.getByRole("button", { name: "Join", exact: true }))
      .toBeVisible({ timeout: 30000 });
    await context.close();
  });

  await test.step("3 a third account sees the preview, Join says different email", async () => {
    await c.page.goto(bPath);
    await expect
      .soft(c.page.getByRole("heading", { name: /E2E W-test W2/ }))
      .toBeVisible({ timeout: 30000 });
    await c.page.getByRole("button", { name: "Join", exact: true }).click();
    await expect
      .soft(c.page.getByText("This invite is for a different email"))
      .toBeVisible({ timeout: 20000 });
  });

  await test.step("4 B joins as Developer, the same link then says already in", async () => {
    await b.page.goto(bPath);
    await b.page.getByRole("button", { name: "Join", exact: true }).click();
    await b.page.waitForURL(new RegExp(`/projects/${projectId}`), {
      timeout: 30000,
    });
    await expect
      .soft(b.page.getByText("Developer").first())
      .toBeVisible({ timeout: 20000 });
    await b.page.goto(bPath);
    await expect
      .soft(b.page.getByText("You're already in this project."))
      .toBeVisible({ timeout: 20000 });
  });

  await test.step("5 a newer invite to the same email kills the older link", async () => {
    // B is already a member, so B's old link should read "already in".
    const toMember = await inviteByApi(a.page, projectId, {
      kind: "email",
      email: B.email,
      role: "viewer",
    });
    console.log(`step 5: invite existing member B returned ${toMember.status}`);
    await b.page.goto(relativeLink(toMember.link as string));
    await expect
      .soft(b.page.getByText("You're already in this project."))
      .toBeVisible({ timeout: 20000 });
    // The real check needs someone who has not joined.
    const viewer = await inviteByApi(a.page, projectId, {
      kind: "email",
      email: D.email,
      role: "viewer",
    });
    const dev = await inviteByApi(a.page, projectId, {
      kind: "email",
      email: D.email,
      role: "developer",
    });
    expect.soft(dev.status, `second invite: ${dev.error}`).toBeLessThan(300);
    await d.page.goto(relativeLink(viewer.link as string));
    await expect
      .soft(d.page.getByText("This invite is no longer valid"))
      .toBeVisible({ timeout: 20000 });
    await d.page.goto(relativeLink(dev.link as string));
    await expect
      .soft(d.page.getByRole("button", { name: "Join", exact: true }))
      .toBeVisible({ timeout: 20000 });
  });

  await test.step("6 link invite: C waits, A approves, a second approve is 409", async () => {
    const link = await inviteByApi(a.page, projectId, {
      kind: "link",
      role: "viewer",
    });
    expect.soft(link.status).toBeLessThan(300);
    await c.page.goto(relativeLink(link.link as string));
    await c.page.getByRole("button", { name: "Ask to join" }).click();
    await expect
      .soft(c.page.getByText(/Waiting for approval/))
      .toBeVisible({ timeout: 20000 });
    const list = await api<{
      requests?: { id: string }[];
      joinRequests?: { id: string }[];
    }>(a.page, `/api/projects/${projectId}/join-requests`);
    const requests = list.body.requests ?? list.body.joinRequests ?? [];
    expect.soft(requests.length, "one pending request").toBe(1);
    await a.page.goto(membersUrl);
    await a.page.getByRole("button", { name: "Approve" }).first().click();
    await expect
      .soft(a.page.getByText(/joined/).first())
      .toBeVisible({ timeout: 20000 });
    const again = await api(
      a.page,
      `/api/projects/${projectId}/join-requests/${requests[0]?.id}`,
      "POST",
      {
        decision: "approve",
      },
    );
    expect.soft(again.status, "second approve").toBe(409);
    await c.page.goto(`/projects/${projectId}`);
    await expect
      .soft(c.page.getByText("Viewer").first())
      .toBeVisible({ timeout: 20000 });
  });

  await test.step("7 revoking a link denies its waiting request", async () => {
    const link = await inviteByApi(a.page, projectId, {
      kind: "link",
      role: "viewer",
    });
    await e.page.goto(relativeLink(link.link as string));
    await e.page.getByRole("button", { name: "Ask to join" }).click();
    await expect
      .soft(e.page.getByText(/Waiting for approval/))
      .toBeVisible({ timeout: 20000 });
    const invites = await api<{ invitations?: { id: string; kind: string }[] }>(
      a.page,
      `/api/projects/${projectId}/invitations`,
    );
    const links = (invites.body.invitations ?? []).filter(
      (i) => i.kind === "link",
    );
    for (const i of links) {
      const res = await api(
        a.page,
        `/api/projects/${projectId}/invitations/${i.id}`,
        "DELETE",
      );
      expect.soft(res.status).toBeLessThan(300);
    }
    const pending = await api<{
      requests?: unknown[];
      joinRequests?: unknown[];
    }>(a.page, `/api/projects/${projectId}/join-requests`);
    expect
      .soft(
        (pending.body.requests ?? pending.body.joinRequests ?? []).length,
        "no pending left",
      )
      .toBe(0);
    await e.page.goto(relativeLink(link.link as string));
    await expect
      .soft(e.page.getByText("This invite is no longer valid"))
      .toBeVisible({ timeout: 20000 });
  });

  await test.step("8 a made up invite eleven times gives Too many tries", async () => {
    for (let i = 0; i < 11; i += 1) {
      await f.page.goto(`/invite/xyz-${i}`);
      // Next's route announcer also has role alert, so wait on the message itself.
      await f.page
        .getByText(/no longer valid|Too many tries/)
        .first()
        .waitFor({ timeout: 20000 });
    }
    await expect
      .soft(f.page.getByText("Too many tries, wait a few minutes"))
      .toBeVisible({ timeout: 20000 });
  });

  await test.step("9 an Admin has no Admin choice, and the server refuses it", async () => {
    await addMember(a.page, e, projectId, "admin");
    await e.page.goto(membersUrl);
    await e.page
      .getByRole("button", { name: /add member/i })
      .first()
      .click();
    const roles = e.page
      .getByRole("dialog", { name: "Add members" })
      .getByRole("radio");
    const admin = roles.filter({ hasText: /^Admin/ });
    console.log(
      `step 9: role cards ${await roles.count()}, Admin card disabled: ${await admin.isDisabled()}`,
    );
    expect.soft(await admin.isDisabled()).toBe(true);
    const res = await inviteByApi(e.page, projectId, {
      kind: "email",
      email: F.email,
      role: "admin",
    });
    expect
      .soft(res.status, "server refuses an Admin granting Admin")
      .toBeGreaterThanOrEqual(400);
  });

  console.log(`W2 project id: ${projectId}`);
});
