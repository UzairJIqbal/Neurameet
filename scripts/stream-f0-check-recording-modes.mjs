#!/usr/bin/env node
/*
 * F0 DIAGNOSTIC - per-participant audio retrieval on THIS Stream account.
 *
 * WHY: The F-series (auto transcript generation) needs per-participant AUDIO
 * to attribute speech to speakers without diarization. D3.4 proved this
 * account does NOT store composite frame recordings, and flagged that the
 * `individual_recording` override might be a no-op (Stream reported
 * `settings.recording = { audio_only: true, mode: "available" }` as a default).
 * This script answers the F0 gate: which recording mode, if any, actually
 * yields a DOWNLOADABLE per-participant audio file on this account?
 *
 * THROWAWAY DIAGNOSTIC - do NOT commit (per AGENTS.md / progress-tracker).
 *
 * USAGE:
 *   node scripts/stream-f0-check-recording-modes.mjs create
 *   node scripts/stream-f0-check-recording-modes.mjs check --callId <id> [--type default]
 *
 * PREREQS: .env.local with NEXT_PUBLIC_STREAM_API_KEY and STREAM_SECRET_KEY.
 */

import { config } from "dotenv";
import { StreamClient } from "@stream-io/node-sdk";

config({ path: ".env.local" });

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secret = process.env.STREAM_SECRET_KEY;

if (!apiKey || !secret) {
  console.error("Missing Stream credentials. Set NEXT_PUBLIC_STREAM_API_KEY and STREAM_SECRET_KEY in .env.local");
  process.exit(1);
}

const client = new StreamClient(apiKey, secret);
const TYPE = "default";

function parseArgs(argv) {
  const out = { _: [], callId: null, type: "default" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--callId") out.callId = argv[++i];
    else if (a === "--type") out.type = argv[++i];
    else out._.push(a);
  }
  return out;
}

function printSettings(c) {
  console.log("  individual_recording:    " + JSON.stringify(c?.settings?.individual_recording ?? null));
  console.log("  recording (audio_only):  " + JSON.stringify(c?.settings?.recording ?? null));
  console.log("  frame_recording:         " + JSON.stringify(c?.settings?.frame_recording ?? null));
}

function recordingUrl(r) {
  return r?.url || r?.file_url || r?.video_url || null;
}

async function createTestCall() {
  const callId = "f0diag-" + Date.now().toString(36);
  const botId = "f0diag-bot";

  // Server-side auth requires a valid created_by_id. Upsert a throwaway bot
  // user so the diagnostic never depends on knowing a real user id.
  try {
    await client.upsertUsers([{ id: botId, name: "F0 Diagnostic" }]);
  } catch (e) {
    console.warn("upsertUsers warning: " + (e instanceof Error ? e.message : String(e)));
  }

  const call = client.video.call(TYPE, callId);
  const res = await call.getOrCreate({
    data: {
      created_by_id: botId,
      settings_override: {
        // Per-participant audio tracks (the F0 target). auto-on => Stream's
        // server auto-starts capture for each participant who joins with mic on.
        individual_recording: { mode: "auto-on" },
        // Per-call audio-only recording (the key Stream reported at default).
        recording: { mode: "auto-on", audio_only: true },
        // Disable mixed composite video - we are isolating audio-only modes.
        // capture_interval_in_seconds is REQUIRED by Stream whenever the
        // frame_recording key is present in settings_override, even if disabled.
        frame_recording: { mode: "disabled", capture_interval_in_seconds: 2 },
      },
      custom: { description: "F0 diagnostic - per-participant audio modes" },
    },
  });
  const c = res?.call ?? res;
  console.log("Created call: " + TYPE + ":" + callId);
  console.log("Effective settings Stream stored at creation:");
  printSettings(c);

  try {
    await call.goLive();
    console.log("\nCall marked live (goLive).");
  } catch (e) {
    console.warn("goLive warning: " + (e instanceof Error ? e.message : String(e)));
  }

  console.log("\n=== NEXT STEP (manual, in the browser) ===");
  console.log("1. Run the app (npm run dev) and JOIN this exact call id: " + callId);
  console.log("   Use the Join Meeting flow and paste the code, or open /meeting/" + callId);
  console.log("2. Turn your MIC ON and speak for ~30-45 seconds (English or Urdu).");
  console.log("3. Leave / end the call.");
  console.log("4. Wait 1-2 minutes for Stream to finalize the audio file.");
  console.log("5. Run: node scripts/stream-f0-check-recording-modes.mjs check --callId " + callId);
}

async function checkCall(callId) {
  const call = client.video.call(TYPE, callId);
  let c;
  try {
    const g = await call.get();
    c = g?.call ?? g;
  } catch (e) {
    console.error("Could not fetch call: " + (e instanceof Error ? e.message : String(e)));
    process.exit(1);
  }
  console.log("Call " + TYPE + ":" + callId);
  console.log("Effective settings Stream now reports (confirms whether our override stuck):");
  printSettings(c);

  const recRes = await client.video.listRecordings({ type: TYPE, id: callId });
  const recs = recRes?.recordings || [];
  console.log("\nRecordings found: " + recs.length);

  let gotIndividual = false;
  let gotAudioOnly = false;
  let gotComposite = false;
  for (const r of recs) {
    const rtype = r?.recording_type ?? "n/a";
    const url = recordingUrl(r);
    console.log("  - recording_type: " + rtype);
    console.log("    status:   " + (r?.status ?? "n/a"));
    console.log("    url:      " + (url ?? "NONE YET (still processing or not stored)"));
    console.log("    filename: " + (r?.filename ?? "n/a"));
    if (rtype === "individual") gotIndividual = true;
    if (rtype === "recording") gotAudioOnly = true;
    if (rtype === "composite") gotComposite = true;
  }

  console.log("\n=== VERDICT (F0 gate) ===");
  if (recs.length === 0) {
    console.log("NO recordings stored. This account does NOT persist any audio for this call.");
    console.log("=> F0 BLOCKED: per-participant audio is not retrievable here. Keep manual");
    console.log("   transcript upload (already built) as the primary path, or revisit the Stream plan.");
    return;
  }
  console.log("individual (per-participant) audio present: " + gotIndividual);
  console.log("recording (audio_only) present:            " + gotAudioOnly);
  console.log("composite (mixed video) present:           " + gotComposite);

  const indivUrl = recs.some((r) => r?.recording_type === "individual" && recordingUrl(r));
  const audioUrl = recs.some((r) => r?.recording_type === "recording" && recordingUrl(r));
  if (indivUrl) {
    console.log("=> F0 GO: individual_recording:auto-on yields downloadable per-participant audio. Use it for F1.");
  } else if (audioUrl) {
    console.log("=> F0 GO (alt): 'recording' audio_only mode yields audio. Map each file to a");
    console.log("   participant via attendance_events (B2) data, since it is not per-speaker keyed.");
  } else {
    console.log("=> F0 PARTIAL: recordings exist but none are downloadable per-participant audio yet.");
    console.log("   Inspect the urls above; likely still processing or stored without a public url.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command) {
    console.error("Usage: node scripts/stream-f0-check-recording-modes.mjs <create|check> [--callId <id>] [--type default]");
    process.exit(1);
  }
  if (command === "create") {
    await createTestCall();
  } else if (command === "check") {
    if (!args.callId) {
      console.error("check requires --callId <id>");
      process.exit(1);
    }
    await checkCall(args.callId);
  } else {
    console.error("Unknown command: " + command);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal: " + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
