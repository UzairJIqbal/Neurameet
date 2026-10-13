import { test, expect } from "@playwright/test";
import path from "node:path";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");
const BASE = "http://localhost:3000";

// Security regression: /api/ai/process must require an authenticated session.
// The route performs AI processing (summary, action items, category, RAG
// embeddings) and must never run for an unauthenticated caller. This control
// proves the auth gate exists and returns 401. (The owner "Generate Transcript"
// full-pipeline trigger that previously exercised this from a signed-in session
// was removed in the F7b transcript-flow correction; the gate itself is
// unchanged and still worth guarding.)
test.describe("AI process auth gate (401)", () => {
  test.use({ storageState: authFile });

  test("control: /api/ai/process without a session returns 401", async ({
    browser,
  }) => {
    // A fresh browser context has no storageState cookie, so this simulates an
    // unauthenticated request. NOTE: the `request` fixture and even
    // `browser.newContext()` can inherit `test.use({ storageState })`, so we
    // pass an EXPLICIT empty cookie store to guarantee the request carries no
    // session.
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const api = ctx.request;
    const res = await api.post(`${BASE}/api/ai/process`, {
      data: { meetingId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status(), "/api/ai/process requires auth").toBe(401);
    await ctx.close();
  });
});
