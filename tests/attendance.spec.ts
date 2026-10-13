import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { createClerkClient } from "@clerk/backend";

const authFile = path.resolve(process.cwd(), "tests/.clerk/e2e-auth.json");
const BASE = "http://localhost:3000";
const E2E_EMAIL = "e2e-test@neurameet.dev";

// Same minimal .env loader the runner + auth.setup.ts use, so CLERK_SECRET_KEY
// is visible in this worker when we resolve the test user's Clerk id.
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

async function getTestUserId(): Promise<string> {
  loadEnvLocal();
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error("CLERK_SECRET_KEY is required to resolve the test user id");
  }
  const client = createClerkClient({ secretKey: secret });
  const res = await client.users.getUserList({ emailAddress: [E2E_EMAIL] });
  if (!res.data || res.data.length === 0) {
    throw new Error(`Test user ${E2E_EMAIL} not found in Clerk`);
  }
  return res.data[0].id;
}

// pdf-lib compresses content streams (FlateDecode) by default, so the captured
// text is NOT literal in the raw bytes. Extract real text with pdf-parse to
// confirm the report actually contains the rows we posted.
// pdf-parse 2.x has no function default export — it exposes a `PDFParse`
// class. Resolve it resiliently across ESM/CJS interop, then pull the text
// via getText() (pdf-lib compresses content streams, so we cannot match the
// raw bytes; real text must be extracted).
async function extractPdfText(buf: Buffer): Promise<string> {
  const mod: any = await import("pdf-parse");
  const PDFParse = mod.PDFParse ?? (mod.default && (mod.default.PDFParse ?? mod.default));
  if (typeof PDFParse !== "function") {
    throw new Error("pdf-parse: could not resolve the PDFParse class");
  }
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  return result.text as string;
}

test.describe.serial("Auto Attendance pipeline (Step B5)", () => {
  test.use({ storageState: authFile });

  const streamCallId = `b5-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  test("join → mic/camera toggles → leave → PDF report matches captured data", async ({
    page,
  }) => {
    test.setTimeout(120000);

    const userId = await getTestUserId();

    const postEvent = (event_type: string) =>
      page.request.post(`${BASE}/api/attendance/event`, {
        data: {
          stream_call_id: streamCallId,
          user_id: userId,
          participant_name: "B5 QA",
          participant_email: "b5@neurameet.dev",
          event_type,
        },
      });

    // One session: join, toggle mic on then off, toggle camera on, then leave.
    // page.request carries the Clerk session cookie from the shared storageState.
    const joinRes = await postEvent("join");
    expect(joinRes.ok(), "join event recorded").toBeTruthy();
    await postEvent("mic_on");
    await postEvent("camera_on");
    await postEvent("mic_off");
    await postEvent("leave");

    // Resolve the meetingId (capture route returns only { ok: true }).
    const listRes = await page.request.get(`${BASE}/api/meetings`);
    expect(listRes.ok()).toBeTruthy();
    const listJson = await listRes.json();
    const meeting = (listJson.meetings ?? []).find(
      (m: { streamCallId?: string }) => m.streamCallId === streamCallId,
    );
    expect(meeting, "meeting anchored by first attendance event").toBeTruthy();
    const meetingId: string = meeting.id;

    // Detail route exposes the attendance count (one open session row).
    const detailRes = await page.request.get(`${BASE}/api/meetings/${meetingId}`);
    expect(detailRes.ok()).toBeTruthy();
    const detailJson = await detailRes.json();
    expect(detailJson.attendanceCount, "one attendance session row").toBe(1);

    // Download the PDF report.
    const reportRes = await page.request.get(
      `${BASE}/api/attendance/report?meetingId=${meetingId}`,
    );
    expect(reportRes.ok(), "report route returns 200").toBeTruthy();
    expect(reportRes.headers()["content-type"]).toContain("application/pdf");
    expect(reportRes.headers()["content-disposition"]).toContain(
      `attendance-report-${meetingId}.pdf`,
    );

    const pdfBuf = Buffer.from(await reportRes.body());
    expect(pdfBuf.slice(0, 5).toString("latin1")).toBe("%PDF-");

    // Contents match the captured session.
    const pdfText = await extractPdfText(pdfBuf);
    expect(pdfText, "participant name in PDF").toContain("B5 QA");
    expect(pdfText, "participant email in PDF").toContain("b5@neurameet.dev");
    expect(pdfText, "Participant column header").toContain("Participant");
    expect(pdfText, "Camera column header").toContain("Camera");
    expect(pdfText, "session count footer").toContain("Total sessions: 1");

    // UI: the Overview Download control is the ENABLED anchor (not the disabled
    // button). The report anchor is the only element with a `download` attribute.
    await page.goto(`/meeting-intelligence/${meetingId}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const downloadLink = page.locator("a[download]");
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute(
      "href",
      new RegExp(`/api/attendance/report\\?meetingId=${meetingId}`),
    );
  });
});
