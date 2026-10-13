import { config } from "dotenv";
import { StreamClient } from "@stream-io/node-sdk";

config({ path: ".env.local" });

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secret = process.env.STREAM_SECRET_KEY;
const callId = process.argv[2];
const type = process.argv[3] || "default";
const maxTicks = Number(process.argv[4] || 15); // ~15 checks
const gapMs = Number(process.argv[5] || 20000); // 20s between checks

if (!apiKey || !secret || !callId) {
  console.error("Usage: node scripts/stream-wait-recording.mjs <callId> [type] [maxTicks] [gapMs]");
  process.exit(1);
}

const client = new StreamClient(apiKey, secret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 1; i <= maxTicks; i++) {
  const now = new Date().toISOString();
  let recs = [];
  let startedAt = "n/a";
  try {
    const callRes = await client.video.getCall({ type, id: callId });
    startedAt = callRes.call?.started_at ?? "n/a";
    const recRes = await client.video.listRecordings({ type, id: callId });
    recs = recRes.recordings || [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[${now}] check ${i}/${maxTicks}: ERROR ${msg}`);
    await sleep(gapMs);
    continue;
  }

  const ready = recs.find((r) => r.url || r.file_url || r.video_url);
  console.log(
    `[${now}] check ${i}/${maxTicks}: recordings=${recs.length} started_at=${startedAt} ` +
      (ready ? `READY url=${ready.url || ready.file_url || ready.video_url}` : ""),
  );
  if (ready) {
    console.log("Recording is ready. Stopping poll.");
    process.exit(0);
  }
  await sleep(gapMs);
}
console.log("Poll finished with no ready recording. The call may not have recorded (check started_at).");
process.exitCode = 1;
