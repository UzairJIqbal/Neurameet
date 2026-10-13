# Step B3 — Attendance PDF Generation

**Skill context:** `/architect attendance PDF generation` (blueprint approved). Part of Layer 2 (Auto Attendance). B0/B1/B2 are done (data model + `attendance_events` table + `POST /api/attendance/event` capture route + client hook). This step generates the downloadable per-meeting attendance report from that data. The Overview-tab download **button** (B4) is a SEPARATE step and out of scope here.

## Goal
Given a meeting and its `attendance_events` rows, produce a per-meeting attendance PDF with one line per join session per participant. Generation runs **server-side** via a new `GET /api/attendance/report` route that returns `application/pdf`. The PDF library is **`pdf-lib`** (MIT, zero cost, zero Next.js config). The attendance data never reaches the browser.

## Behavior (agreed in /architect)
- **Library:** `pdf-lib`. Pure JS, runs in a Next.js API route (Node runtime) with no `serverExternalPackages`/`transpilePackages`. Standard Helvetica font covers the ASCII/Latin names, emails, and timestamps in our data.
- **Scope:** one meeting (the selected meeting's Overview tab, wired in B4). NOT all meetings.
- **One row per join session:** exactly one PDF line per `attendance_events` row. A participant who reconnects has multiple rows (each with its own join/leave/talk-time) — do NOT collapse by person.
- **Authz:** owner-only. `Clerk userId` must equal `meetings.user_id` for the requested `meetingId` (reuse the `/api/meetings/[id]` ownership check). Non-owners / unknown meetings → 404.
- **Empty state:** if the meeting has zero `attendance_events` rows, the route returns `404 { error: "No attendance data" }`; B4 disables the button.
- **Runtime:** `export const runtime = "nodejs"` on the route (it uses `supabaseServer()`).

## Columns (per session line)
`Participant · Email · Joined · Left · Duration · Talk time · Mic toggles · Camera toggles`

- **Participant:** `participant_name` → fallback to `participant_email` → fallback to `"Unknown"`. (Remote users have a name but `participant_email` is null; local has both.)
- **Email:** `participant_email` (may be `null` → render `—`).
- **Joined / Left:** `session_started_at` / `session_ended_at`, formatted in **UTC** and labeled `(UTC)` on the page. Deterministic — avoids server-locale drift. If `session_ended_at` is null (still-open row), render `—`.
- **Duration:** `session_ended_at − session_started_at` in seconds (mm:ss or `Xs`); `—` if `session_ended_at` is null.
- **Talk time:** `talk_time_seconds` from the row, formatted mm:ss (cumulative unmuted duration, server-derived).
- **Mic toggles / Camera toggles:** the integer columns as-is.

## Meeting header (top of PDF)
- Title (from `meetings.title`), and date/status line: `started_at` (UTC) + `status`. Fall back to `created_at` if `started_at` is null.

## Implementation

### 1. Install `pdf-lib`
```
npm install pdf-lib --legacy-peer-deps
```
The `--legacy-peer-deps` flag is REQUIRED (pre-existing `@ai-sdk/react` ↔ React 19 peer mismatch — see memory). No `pdf-lib` skill exists in AGENTS.md and `library-docs.md` has no `pdf-lib` section, so there is nothing to load first.

### 2. Shared type — `src/lib/meeting-types.ts`
Add (used by the generator and later by B4):
```ts
export interface AttendanceRow {
  id: string;
  userId: string;
  participantEmail: string | null;
  participantName: string | null;
  sessionStartedAt: string;        // ISO (UTC)
  sessionEndedAt: string | null;   // ISO (UTC) or null
  micToggles: number;
  cameraToggles: number;
  talkTimeSeconds: number;
}
```

### 3. Generator — `src/lib/attendance-pdf.ts` (server module, NO `"use client"`)
Pure, testable, server-only. Two exports:
- `buildReportRows(meeting: MeetingDetailData, rows: AttendanceRow[]): { headers: string[]; lines: string[][] }`
  - Pure mapping of DB rows → table cells. Computes Duration; applies the name→email→"Unknown" fallback; formats UTC times. Returns the column headers + one `string[]` per session line. **This is the unit-testable core** (asserts columns + counts + formatting without parsing a binary PDF).
- `generateAttendancePdf(meeting: MeetingDetailData, rows: AttendanceRow[]): Promise<Uint8Array>`
  - `import { PDFDocument, StandardFonts, rgb } from "pdf-lib";`
  - `const doc = await PDFDocument.create();` `const font = await doc.embedFont(StandardFonts.Helvetica);` (and `HelveticaBold` for the header/column titles).
  - One page (A4/Letter). Lay out with `doc.drawText` at computed x/y: meeting title (bold), date/status sub-line, a column-header row, then one line per `buildReportRows().lines` entry. Light horizontal rules between rows for readability. Keep margins ~40px; compute column x-offsets up front so values align under headers.
  - Keep it small and explicit — no pagination logic needed for the expected row counts (a single meeting). If rows would overflow one page, wrap to a second page (`doc.addPage()`) — simple line-count guard, not a full table engine.
  - `return await doc.save();` (Uint8Array).
  - **No colors beyond neutral** (`rgb(0,0,0)` text on white). Do not reach for raw Tailwind classes here — this is a PDF canvas, not the DOM. This is allowed by the "never use hex" rule's spirit (UI only); the rule governs component styling, not a PDF byte buffer. Use plain `rgb()` for the PDF.

### 4. API route — `src/app/api/attendance/report/route.ts` (GET)
```ts
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();                       // @clerk/nextjs/server
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meetingId = new URL(request.url).searchParams.get("meetingId");
  if (!meetingId) return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });

  const supabase = supabaseServer();                      // service role, server-only
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, title, status, started_at, ended_at, created_at")
    .eq("id", meetingId)
    .eq("user_id", userId)                               // owner-only
    .single();
  if (meetingError || !meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

  const { data: rows, error: rowsError } = await supabase
    .from("attendance_events")
    .select("id, user_id, participant_email, participant_name, session_started_at, session_ended_at, mic_toggles, camera_toggles, talk_time_seconds")
    .eq("meeting_id", meetingId)
    .order("participant_name", { ascending: true })
    .order("session_started_at", { ascending: true });
  if (rowsError) { console.error("Attendance report error:", rowsError); return NextResponse.json({ error: "Failed to load attendance" }, { status: 500 }); }
  if (!rows || rows.length === 0) return NextResponse.json({ error: "No attendance data" }, { status: 404 });

  const meetingData: MeetingDetailData = { id: meeting.id, title: meeting.title, status: meeting.status, streamCallId: "", startedAt: meeting.started_at, endedAt: meeting.ended_at, createdAt: meeting.created_at };
  const attendance: AttendanceRow[] = rows.map((r) => ({ id: r.id, userId: r.user_id, participantEmail: r.participant_email, participantName: r.participant_name, sessionStartedAt: r.session_started_at, sessionEndedAt: r.session_ended_at, micToggles: r.mic_toggles, cameraToggles: r.camera_toggles, talkTimeSeconds: r.talk_time_seconds }));

  const pdf = await generateAttendancePdf(meetingData, attendance);
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="attendance-report-${meetingId}.pdf"`,
    },
  });
}
```
- Wrap the whole body in try/catch; log and return `500 { error }` on unexpected failure — never crash the run.
- `meetingId` is a uuid (ASCII-safe) so the filename is always valid.

### 5. Unit test (B3 verification — no browser needed)
Add a small test (vitest or a plain `node --test` script — match whatever the repo already uses; if none, a `scripts/check-attendance-pdf.mjs` that imports the compiled generator is acceptable):
- Seed 2+ fake `AttendanceRow[]` (including a null-email remote user and a null-`session_ended_at` row).
- Assert `buildReportRows` returns the right header count (8), the right number of lines, and correct Duration/Talk-time formatting.
- Assert `generateAttendancePdf` returns bytes whose first 5 chars are `%PDF-`.
Pure function → no DB, no Clerk, runs in CI/`tsc` context.

### 6. Update `context/library-docs.md`
Append a short `## pdf-lib` section (server-only; generate in an API route; route returns `application/pdf` + `Content-Disposition: attachment`; timestamps rendered UTC) so future steps have the pattern on file.

### 7. Update `context/progress-tracker.md`
Mark **Step B3** ✅ with the file list + verification result, and note B4 (button wiring) + B5 (e2e) still pending.

## Constraints (from AGENTS.md — never violate)
- Zero cost: `pdf-lib` (MIT) only. No paid PDF service, no second provider.
- Server-side only: `pdf-lib` + `supabaseServer()` live in the API route / `src/lib/attendance-pdf.ts`. No attendance data in the browser; no generation logic in components.
- `strict` TypeScript, no `any`, explicit types (the `AttendanceRow` interface above).
- Every DB/AI call wrapped in try/catch, failures logged, never crash the whole run.
- No changes outside this task's scope. Do not build the B4 button here.

## Verification
- `npx tsc --noEmit` clean.
- `npm run build` exit 0.
- Unit test passes: given seeded `attendance_events` rows, `buildReportRows` produces correct columns/counts and `generateAttendancePdf` returns a valid `%PDF` buffer.
- Manual (optional, prep for B4): `curl -H "Authorization: ..." "http://localhost:3000/api/attendance/report?meetingId=<id>" -o /tmp/r.pdf` for a meeting the signed-in user owns → file opens as a valid PDF with all columns.
