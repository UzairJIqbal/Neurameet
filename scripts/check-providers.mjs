// Pre demo provider health check.
//
// Probes the Gemini primary and Groq fallback with a 1 token call and reports
// which are live, so before a demo you can confirm the primary provider is
// healthy again (its free tier quota was exhausted, leaving Groq carrying the
// load). Zero cost, server side only. Model ids mirror src/agent/models.ts.
//
// Run with: npm run check:providers
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { generateText } from "ai";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const PROBE_TIMEOUT_MS = 8000;

const primaryModel = google("gemini-flash-latest");
const fallbackModel = groq("llama-3.1-8b-instant");

async function probe(label, modelId, model) {
  try {
    await Promise.race([
      generateText({ model, prompt: "ping", maxOutputTokens: 1 }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), PROBE_TIMEOUT_MS),
      ),
    ]);
    return { label, ok: true, modelId };
  } catch (err) {
    return {
      label,
      ok: false,
      modelId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const results = [
  await probe("Gemini (primary)", "gemini-flash-latest", primaryModel),
  await probe("Groq (fallback)", "llama-3.1-8b-instant", fallbackModel),
];

console.log("Provider status:");
for (const p of results) {
  console.log(
    `  ${p.ok ? "LIVE " : "DOWN "} ${p.label} [${p.modelId}]${
      p.ok ? "" : " — " + p.error
    }`,
  );
}

const anyLive = results.some((r) => r.ok);
console.log(anyLive ? "At least one provider is live." : "No provider is live.");
