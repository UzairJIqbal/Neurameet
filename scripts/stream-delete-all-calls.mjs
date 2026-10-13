import { config } from "dotenv";
import { StreamClient } from "@stream-io/node-sdk";

config({ path: ".env.local" });

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secret = process.env.STREAM_SECRET_KEY;

if (!apiKey || !secret) {
  console.error("Missing Stream credentials in .env.local");
  process.exit(1);
}

const confirm = process.argv.includes("--confirm");
const client = new StreamClient(apiKey, secret);

let next;
let allCalls = [];
do {
  const res = await client.video.queryCalls({
    filter_conditions: {},
    limit: 100,
    sort: [{ field: "created_at", direction: -1 }],
    ...(next ? { next } : {}),
  });
  const calls = res.calls || [];
  allCalls.push(...calls);
  next = res.next || null;
} while (next);

console.log(`Found ${allCalls.length} call(s) on Stream.`);

if (!confirm) {
  for (const c of allCalls) {
    const obj = c.call ?? c;
    console.log(`  would delete: type=${obj.type} id=${obj.id}`);
  }
  console.log("Dry run only. Re-run with --confirm to actually delete.");
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let deleted = 0;
let failed = 0;
for (const c of allCalls) {
  const obj = c.call ?? c;
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    try {
      await client.video.deleteCall({ type: obj.type, id: obj.id });
      ok = true;
      deleted++;
      console.log(`  deleted: type=${obj.type} id=${obj.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Too many requests") && attempt < 3) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      console.error(`  FAILED type=${obj.type} id=${obj.id}: ${msg}`);
      failed++;
      break;
    }
  }
  await sleep(350);
}
console.log(`Deleted ${deleted} of ${allCalls.length} call(s). Failed: ${failed}.`);
if (failed > 0) process.exitCode = 1;
