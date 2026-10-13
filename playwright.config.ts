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
    // Auto Attendance end-to-end regression (Step B5) — reuses the shared
    // signed-in Clerk session from setup and POSTs the attendance event
    // sequence, then asserts the PDF report matches the captured data.
    {
      name: "chromium-attendance",
      testMatch: /attendance\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: authFile,
      },
    },
    // Speaker Engagement Insights end-to-end regression (Step C3) — reuses the
    // shared signed-in Clerk session from setup, uploads a transcript to create
    // a meeting, then asserts `POST /api/engagement` returns per-speaker data
    // and the `Engagement` tab renders in the meeting detail page.
    {
      name: "chromium-engagement",
      testMatch: /engagement\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: authFile,
      },
    },
    // Stream connection regression — reuses the shared signed-in Clerk session
    // from setup and asserts the call list (useGetCall → client.queryCalls)
    // loads without the 5s axios timeout that occurred before the user was
    // connected on provider mount.
    {
      name: "chromium-connection",
      testMatch: /connection\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: authFile,
      },
    },
    // Recording-page auto-refresh regression (D3.4 /debug) — reuses the shared
    // signed-in Clerk session from setup, then stubs /api/recordings to return
    // empty then a recording and asserts the row appears without a manual reload
    // (see tests/recording-poll.spec.ts). Needs its own project because a CLI
    // file argument does not override a project's testMatch, so the ad-hoc spec
    // would otherwise match no project and report "No tests found".
    {
      name: "chromium-recording-poll",
      testMatch: /recording-poll\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: authFile,
      },
    },
    // Owner Recording-tab duplicate-key regression (F7b /debug) — reuses the
    // shared signed-in Clerk session from setup, then stubs /api/meetings/[id]
    // (with the matching owner id) and /api/recordings (two recordings sharing
    // a call_id) and asserts the duplicate-key console warning never appears
    // (see tests/recording-tab.spec.ts). Needs its own project because a CLI
    // file argument does not override a project's testMatch.
    {
      name: "chromium-recording-tab",
      testMatch: /recording-tab\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: authFile,
      },
    },
    // P0 stuck-loader regression — reuses the shared signed-in Clerk session
    // from setup, then leaves /api/meetings (and /api/follow-ups) hanging so the
    // Promise never settles. Asserts the bounded 12s timeout fires and renders
    // the <LoadError> fallback (Retry + Back to Dashboard) instead of an
    // infinite spinner (see tests/stuck-loader.spec.ts). Needs its own project
    // because a CLI file argument does not override a project's testMatch.
    {
      name: "chromium-stuck-loader",
      testMatch: /stuck-loader\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: authFile,
      },
    },
    // P0 sibling-sweep regression — reuses the shared signed-in Clerk session
    // from setup, then leaves /api/prep (and /api/search) hanging so the fetch
    // never settles. Asserts the bounded 12s timeout fires and renders the
    // <LoadError> fallback (Retry) instead of an infinite spinner on the Prep
    // and Search pages (see tests/fetch-timeout.spec.ts).
    {
      name: "chromium-fetch-timeout",
      testMatch: /fetch-timeout\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: authFile,
      },
    },
    // AI process auth gate regression — proves /api/ai/process returns 401 for
    // an unauthenticated caller (the security gate must never be bypassed). Does
    // not run the heavy AI pipeline, so it is fast.
    {
      name: "chromium-ai-process-auth",
      testMatch: /ai-process-auth\.spec\.ts/,
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
