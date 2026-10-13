import { config } from "dotenv";
import { StreamClient } from "@stream-io/node-sdk";

config({ path: ".env.local" });

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secret = process.env.STREAM_SECRET_KEY;
const callId = process.argv[2];
const type = process.argv[3] || "default";

if (!apiKey || !secret) {
  console.error("Missing Stream credentials in .env.local");
  process.exit(1);
}
if (!callId) {
  console.error("Usage: node scripts/stream-check-call.mjs <callId> [type]");
  process.exit(1);
}

const client = new StreamClient(apiKey, secret);

let call;
try {
  const res = await client.video.getCall({ type, id: callId });
  call = res.call;
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`Call ${type}:${callId} not found: ${msg}`);
  process.exit(1);
}

console.log(`Call ${type}:${callId}`);
console.log(`  created_at: ${call.created_at ?? "n/a"}`);
console.log(`  started_at: ${call.started_at ?? "n/a"}`);
console.log(`  ended_at:   ${call.ended_at ?? "n/a"}`);
console.log(`  status:     ${call.status ?? "n/a"}`);
const fr = call.settings?.frame_recording;
console.log(
  `  frame_recording.mode: ${fr?.mode ?? "n/a"} (quality ${fr?.quality ?? "n/a"})`,
);
console.log(
  `  individual_recording.mode: ${call.settings?.individual_recording?.mode ?? "n/a"}`,
);

const recRes = await client.video.listRecordings({ type, id: callId });
const recs = recRes.recordings || [];
console.log(`\nRecordings found: ${recs.length}`);
for (const r of recs) {
  console.log(`  - id: ${r.id ?? r.recording_id ?? "n/a"}`);
  console.log(`    recording_type: ${r.recording_type ?? "n/a"}`);
  console.log(`    status:         ${r.status ?? "n/a"}`);
  console.log(`    url:            ${r.url ?? r.file_url ?? r.video_url ?? "NONE YET"}`);
  console.log(`    start_time:     ${r.start_time ?? "n/a"}`);
  console.log(`    end_time:       ${r.end_time ?? "n/a"}`);
}
if (recs.length === 0) {
  console.log("  (no recording in the list yet = still processing, or none started)");
}
