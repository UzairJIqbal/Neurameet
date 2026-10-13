/* eslint-disable prettier/prettier */
import { buildReportRows, generateAttendancePdf } from "../src/lib/attendance-pdf";
import type { AttendanceRow, MeetingDetailData } from "../src/lib/meeting-types";

const meeting: MeetingDetailData = {
  id: "00000000-0000-0000-0000-000000000000",
  title: "Test Meeting",
  status: "ended",
  streamCallId: "call_1",
  startedAt: "2026-08-17T10:00:00.000Z",
  endedAt: "2026-08-17T11:00:00.000Z",
  createdAt: "2026-08-17T10:00:00.000Z",
  user_id: "00000000-0000-0000-0000-000000000000",
  guestAdmissionMode: "approval",
};

const rows: AttendanceRow[] = [
  {
    id: "r1",
    userId: "u1",
    participantName: "Alice Local",
    participantEmail: "alice@example.com",
    sessionStartedAt: "2026-08-17T10:00:00.000Z",
    sessionEndedAt: "2026-08-17T10:30:00.000Z",
    micToggles: 3,
    cameraToggles: 1,
    talkTimeSeconds: 600,
  },
  {
    id: "r2",
    userId: "u2",
    participantName: "Bob Remote",
    participantEmail: null,
    sessionStartedAt: "2026-08-17T10:05:00.000Z",
    sessionEndedAt: "2026-08-17T11:00:00.000Z",
    micToggles: 0,
    cameraToggles: 0,
    talkTimeSeconds: 0,
  },
  {
    id: "r3",
    userId: "u1",
    participantName: "Alice Local",
    participantEmail: "alice@example.com",
    sessionStartedAt: "2026-08-17T10:35:00.000Z",
    sessionEndedAt: null,
    micToggles: 1,
    cameraToggles: 0,
    talkTimeSeconds: 120,
  },
];

async function main(): Promise<void> {
let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    console.log(`PASS: ${name}`);
  } else {
    console.error(`FAIL: ${name}`);
    failures += 1;
  }
}

const { headers, lines } = buildReportRows(meeting, rows);
check("8 headers", headers.length === 8);
check("3 lines", lines.length === 3);
check("header labels", headers.join(",") === "Participant,Email,Joined,Left,Duration,Talk time,Mic,Camera");
check("alice session duration 0:30:00", lines[0][4] === "0:30:00");
check("alice talk time 0:10:00", lines[0][5] === "0:10:00");
check("alice mic toggles 3", lines[0][6] === "3");
check("alice camera toggles 1", lines[0][7] === "1");
check("bob email dash for null", lines[1][1] === "—");
check("bob mic toggles 0", lines[1][6] === "0");
check("bob camera toggles 0", lines[1][7] === "0");
check("bob duration computed 0:55:00", lines[1][4] === "0:55:00");
check("alice open session duration dash", lines[2][4] === "—");
check("alice open session talk time 0:02:00", lines[2][5] === "0:02:00");

const pdf = await generateAttendancePdf(meeting, rows);
const head = Buffer.from(pdf.slice(0, 5)).toString("latin1");
check("pdf starts with %PDF-", head === "%PDF-");
console.log(`PDF bytes: ${pdf.length}`);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("All attendance PDF checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
