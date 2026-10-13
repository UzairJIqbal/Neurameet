import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ─── Dependency-free .env.local loader ───────────────────────────────────────
// The Playwright runner process (where clerkSetup() runs) does not automatically
// load Next.js .env files, so load them here so CLERK_SECRET_KEY is visible.
function loadEnvFile(file: string) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // missing file is fine
  }
}

const root = process.cwd();
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

// @clerk/testing reads CLERK_PUBLISHABLE_KEY; the app uses the NEXT_PUBLIC_ prefix.
if (
  !process.env.CLERK_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

export const authFile = path.resolve(root, "tests/.clerk/e2e-auth.json");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Single worker: the auth suite hammers one `next dev` server + the Gemini
  // API (upload→process→embed + RAG chat). Parallel unauth + auth runs overload
  // the shared dev server and bounce authenticated navigations to /dashboard.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // One-time signed-in Clerk test session → saved to storageState.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Authenticated happy-path regression — reuses the shared session from setup,
    // and runs e2e.spec.ts with test.describe.serial() for ordered shared state.
    // Runs BEFORE the unauth baseline so the AI-heavy suite hits a fresh dev server.
    {
      name: "chromium-auth",
      testMatch: /e2e\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: authFile,
      },
    },
    // Unauthenticated regression (Step 0.5 baseline) — must stay signed OUT.
    // Runs AFTER the AI-heavy auth suite so the e2e tests hit a fresh dev server
    // (running them last, after ~2min of load, makes /personal-room flake).
    {
      name: "chromium-unauth",
      testMatch: /auth\.spec\.ts/,
      dependencies: ["chromium-auth"],
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});
