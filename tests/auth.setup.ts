import { test as setup } from "@playwright/test";
import { clerkSetup, clerk } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import fs from "node:fs";
import path from "node:path";

// Ensure Clerk secrets are present in THIS worker process (Playwright workers do
// not automatically inherit env set in the runner process).
function loadEnvLocal() {
  for (const f of [".env.local", ".env"]) {
    try {
      const raw = fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq === -1) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
    } catch {
      /* ignore */
    }
  }
}

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");

// A stable dev test user for the E2E suite.
const E2E_EMAIL = "e2e-test@neurameet.dev";
const E2E_PASSWORD = "E2eTest!Passw0rd9";

setup("authenticate test user (shared session)", async ({ browser }) => {
  setup.setTimeout(90000);
  loadEnvLocal();
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required to create the E2E test user");
  }

  const clerkAdmin = createClerkClient({ secretKey });

  // Get-or-create the dev test user (idempotent across runs).
  const existing = await clerkAdmin.users.getUserList({ emailAddress: [E2E_EMAIL] });
  if (!existing.data || existing.data.length === 0) {
    await clerkAdmin.users.createUser({
      emailAddress: [E2E_EMAIL],
      password: E2E_PASSWORD,
    });
  }

  // Fetch the Clerk testing token (enables captcha bypass in the browser).
  await clerkSetup();

  const context = await browser.newContext();
  const page = await context.newPage();

  // Load the Clerk sign-in page so window.Clerk is available.
  await page.goto("/sign-in");
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded), null, {
    timeout: 60000,
  });

  // clerk.signIn registers the captcha-bypass route AND performs the ticket
  // sign-in for the dev user (sets a real session cookie the Next.js Clerk
  // middleware trusts). The ticket path does not auto-navigate, so we force
  // navigation into the app afterward.
  // @ts-ignore @clerk/testing types can lag the runtime (which supports emailAddress); the call is verified working.
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });

  // After a successful ticket sign-in, the session cookie is set. Navigate into
  // the app; the middleware now trusts the session. clerk.signIn's ticket
  // setActive reloads the page to apply the session cookie, so tolerate that
  // in-flight navigation instead of letting our goto abort it.
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });

  // If auth failed we'd be bounced to /sign-in — fail loudly.
  if (page.url().includes("/sign-in")) {
    throw new Error("Clerk test session failed to authenticate (redirected to /sign-in)");
  }

  await page.waitForLoadState("networkidle").catch(() => {});

  // Persist the signed-in session so e2e.spec.ts reuses the SAME user.
  await context.storageState({ path: authFile });
  await context.close();
});
