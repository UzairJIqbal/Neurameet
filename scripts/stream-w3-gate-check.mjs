// W3 feasibility gate check (spec 0004, child 0004-project-meetings, Build plan item 1).
// Run after scripts/stream-create-project-call-type.mjs. Creates a fresh
// `project` call owned by w3-gate-owner (call role `admin`) with w3-gate-member
// (call role `call_member`), then reads the call as each test user through the
// same REST endpoints the browser SDK uses (no websocket) and checks four facts:
//   1. a stranger has no join-call
//   2. admin and call_member have join-call, send-audio, send-video
//   3. a stranger naming themselves in getOrCreate data.members is not added
//   4. a plain user and a call_member have no update-call-member, and the
//      members endpoint refuses them
// Prints PASS or FAIL per fact, then hard deletes the test call.
//
// Usage: node scripts/stream-w3-gate-check.mjs
import { config } from "dotenv";
import { StreamClient } from "@stream-io/node-sdk";

config({ path: ".env.local" });

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secret = process.env.STREAM_SECRET_KEY;
const TYPE = "project";
const BASE = "https://video.stream-io-api.com/video";
const OWNER = "w3-gate-owner";
const MEMBER = "w3-gate-member";
const STRANGER = "w3-gate-stranger";
const MEDIA = ["join-call", "send-audio", "send-video"];

if (!apiKey || !secret) {
  console.error("Missing Stream credentials in .env.local");
  process.exit(1);
}

const client = new StreamClient(apiKey, secret);
const callId = `w3-gate-${Date.now()}`;
const call = client.video.call(TYPE, callId);

function errorText(e) {
  return e instanceof Error ? e.message : String(e);
}

// One REST request as a user, signed with that user's JWT (the browser SDK
// sends the same Authorization and stream-auth-type headers).
async function asUser(userId, method, path, body) {
  const token = client.generateUserToken({ user_id: userId, validity_in_seconds: 600 });
  const url = `${BASE}${path}?api_key=${encodeURIComponent(apiKey)}&user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: token,
      "stream-auth-type": "jwt",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function capsOf(userId) {
  const res = await asUser(userId, "GET", `/call/${TYPE}/${callId}`);
  if (!res.ok) {
    console.log(`  ${userId}: GET call refused (${res.status}) ${res.json?.message ?? ""}`);
    return [];
  }
  return res.json.own_capabilities ?? [];
}

async function memberIds() {
  const res = await client.video.queryCallMembers({ type: TYPE, id: callId, limit: 100 });
  return (res.members ?? []).map((m) => m.user_id);
}

const results = [];
function report(n, label, pass, detail) {
  results.push(pass);
  console.log(`\nFact ${n}: ${label}\n  ${pass ? "PASS" : "FAIL"}  ${detail}`);
}

async function run() {
  await client.upsertUsers([
    { id: OWNER, name: "W3 Gate Owner", role: "user" },
    { id: MEMBER, name: "W3 Gate Member", role: "user" },
    { id: STRANGER, name: "W3 Gate Stranger", role: "user" },
  ]);

  await call.getOrCreate({
    data: {
      created_by_id: OWNER,
      members: [
        { user_id: OWNER, role: "admin" },
        { user_id: MEMBER, role: "call_member" },
      ],
    },
  });
  console.log(`Created test call ${TYPE}:${callId}`);

  console.log("\nown_capabilities per user:");
  const caps = {};
  for (const id of [OWNER, MEMBER, STRANGER]) {
    caps[id] = await capsOf(id);
    console.log(`  ${id}: ${[...caps[id]].sort().join(", ") || "(none)"}`);
  }

  report(
    1,
    "a stranger has no join-call",
    !caps[STRANGER].includes("join-call"),
    `stranger join-call: ${caps[STRANGER].includes("join-call")}`,
  );

  const missing = (id) => MEDIA.filter((c) => !caps[id].includes(c));
  report(
    2,
    "admin and call_member have join-call, send-audio, send-video",
    missing(OWNER).length === 0 && missing(MEMBER).length === 0,
    `owner missing: [${missing(OWNER).join(", ")}], member missing: [${missing(MEMBER).join(", ")}]`,
  );

  const selfAdd = await asUser(STRANGER, "POST", `/call/${TYPE}/${callId}`, {
    data: { members: [{ user_id: STRANGER, role: "call_member" }] },
  });
  const afterSelfAdd = await memberIds();
  report(
    3,
    "a stranger naming themselves in getOrCreate is not added",
    !afterSelfAdd.includes(STRANGER),
    `getOrCreate status ${selfAdd.status}, members now: [${afterSelfAdd.join(", ")}]`,
  );

  const memberAdd = await asUser(MEMBER, "POST", `/call/${TYPE}/${callId}/members`, {
    update_members: [{ user_id: STRANGER, role: "call_member" }],
  });
  const strangerAdd = await asUser(STRANGER, "POST", `/call/${TYPE}/${callId}/members`, {
    update_members: [{ user_id: STRANGER, role: "call_member" }],
  });
  const afterUpdate = await memberIds();
  const noCap =
    !caps[MEMBER].includes("update-call-member") &&
    !caps[STRANGER].includes("update-call-member");
  report(
    4,
    "a plain user and a call_member cannot change members",
    noCap && !memberAdd.ok && !strangerAdd.ok && !afterUpdate.includes(STRANGER),
    `member POST /members ${memberAdd.status}, stranger POST /members ${strangerAdd.status}, ` +
      `members now: [${afterUpdate.join(", ")}], owner has update-call-member: ` +
      `${caps[OWNER].includes("update-call-member")} (expected true, the known limit)`,
  );
}

try {
  await run();
} catch (e) {
  console.error(`\nGate check crashed: ${errorText(e)}`);
  results.push(false);
} finally {
  try {
    await call.delete({ hard: true });
    console.log(`\nHard deleted test call ${TYPE}:${callId}`);
  } catch (e) {
    console.error(`Could not delete test call ${callId}: ${errorText(e)}`);
  }
}

const passed = results.length === 4 && results.every(Boolean);
console.log(`\nGATE ${passed ? "PASSED" : "FAILED"} (${results.filter(Boolean).length} of 4 facts)`);
process.exit(passed ? 0 : 1);
