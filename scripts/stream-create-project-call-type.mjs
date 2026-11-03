// W3 feasibility gate (spec 0004, child 0004-project-meetings, Build plan item 1).
// Creates or updates the `project` call type: a copy of `default` with
// `join-call`, `join-call-any-team`, and `end-call` removed from `user` and
// `guest`, and `update-call-member` and `remove-call-member` removed from
// `user`, `guest`, and `call_member` (the first gate run showed `default` gives
// those roles the full member grant, so a stranger could add themselves).
// `admin` and `host` keep exactly the `default` grants. Our server changes
// members with the secret key, so only people it adds can join.
//
// Usage:
//   node scripts/stream-create-project-call-type.mjs           create or update
//   node scripts/stream-create-project-call-type.mjs --check   print grants, change nothing
import { config } from "dotenv";
import { StreamClient } from "@stream-io/node-sdk";

config({ path: ".env.local" });

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secret = process.env.STREAM_SECRET_KEY;
const NAME = "project";
const MEMBER_GRANTS = ["update-call-member", "remove-call-member"];
const REMOVED_BY_ROLE = {
  user: ["join-call", "join-call-any-team", "end-call", ...MEMBER_GRANTS],
  guest: ["join-call", "join-call-any-team", "end-call", ...MEMBER_GRANTS],
  call_member: MEMBER_GRANTS,
};
const SHOWN_ROLES = ["user", "guest", "call_member", "admin", "host"];
const checkOnly = process.argv.includes("--check");

if (!apiKey || !secret) {
  console.error("Missing Stream credentials in .env.local");
  process.exit(1);
}

const client = new StreamClient(apiKey, secret);

function errorText(e) {
  return e instanceof Error ? e.message : String(e);
}

async function getType(name) {
  try {
    return await client.video.getCallType({ name });
  } catch {
    return null;
  }
}

function printGrants(label, grants) {
  console.log(`\n${label}`);
  for (const role of SHOWN_ROLES) {
    const list = grants?.[role];
    if (!list) {
      console.log(`  ${role}: (no entry)`);
      continue;
    }
    const join = list.includes("join-call") ? "HAS join-call" : "no join-call";
    const member = list.includes("update-call-member")
      ? "HAS update-call-member"
      : "no update-call-member";
    console.log(`  ${role}: ${join}, ${member}, ${list.length} grants`);
    console.log(`    ${[...list].sort().join(", ")}`);
  }
}

function gatedGrants(grants) {
  const next = { ...grants };
  for (const [role, removed] of Object.entries(REMOVED_BY_ROLE)) {
    if (next[role]) next[role] = next[role].filter((g) => !removed.includes(g));
  }
  return next;
}

const existing = await getType(NAME);

if (checkOnly) {
  if (!existing) {
    console.log(`Call type "${NAME}" does not exist yet.`);
    process.exit(0);
  }
  printGrants(`Current "${NAME}" grants`, existing.grants);
  process.exit(0);
}

const base = await getType("default");
if (!base) {
  console.error('Could not read the "default" call type.');
  process.exit(1);
}

const grants = gatedGrants(base.grants);
const request = {
  grants,
  settings: base.settings,
  notification_settings: base.notification_settings,
};

async function save(body) {
  if (existing) return client.video.updateCallType({ name: NAME, ...body });
  return client.video.createCallType({ name: NAME, ...body });
}

let saved;
try {
  saved = await save(request);
} catch (e) {
  // Stream may refuse response only fields inside the copied settings. Retry
  // with the grants alone so the gate can still run, and say so loudly.
  console.warn(`Saving with copied settings failed: ${errorText(e)}`);
  console.warn("Retrying with grants only (settings stay Stream defaults).");
  try {
    saved = await save({ grants });
  } catch (e2) {
    console.error(`Stream refused the "${NAME}" call type: ${errorText(e2)}`);
    console.error("Gate FAIL: report this back before anything else is built.");
    process.exit(1);
  }
}

console.log(`${existing ? "Updated" : "Created"} call type "${NAME}".`);
printGrants(`"${NAME}" grants now`, saved.grants);
