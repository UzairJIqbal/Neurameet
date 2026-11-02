/* eslint-disable prettier/prettier */
// Tasdeeq, Verified Minutes (spec 0003, AC-21). Plants K known errors into an
// open review's minutes_lines for a demo meeting and prints the answer key.
// No LLM call. Run it right after opening the review, before anyone answers.
//
//   npx tsx scripts/tasdeeq-seed.ts <meetingId> [K=3] [--write]
//
// Without --write it only prints the plan (a dry run). The answer key is also
// saved to reports/tasdeeq-seed-<meetingId>.json so you can score the run later.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { planSeed, type SeedLine } from "../src/agent/minutes-seed";
import type { MinutesEvidence, MinutesSection } from "../src/lib/minutes-types";

function fail(message: string): never {
  console.error(`[tasdeeq] seed: ${message}`);
  process.exit(1);
}

interface LineRow {
  id: string;
  position: number;
  section: MinutesSection;
  text: string;
  evidence: MinutesEvidence[] | null;
  speaker_labels: string[] | null;
}

async function main(): Promise<void> {
  config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const [meetingId, kArg] = args.filter((a) => !a.startsWith("--"));
  if (!meetingId) fail("usage: npx tsx scripts/tasdeeq-seed.ts <meetingId> [K] [--write]");
  const k = kArg ? Number(kArg) : 3;
  if (!Number.isInteger(k) || k < 1 || k > 20) fail("K must be a whole number from 1 to 20");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  const supabase = createClient(url, key);

  const { data: review, error: reviewErr } = await supabase
    .from("minutes_reviews")
    .select("id, status")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (reviewErr) fail(`could not read the review: ${reviewErr.message}`);
  if (!review) fail("this meeting has no minutes review. Open one in the Minutes tab first");
  if (review.status !== "open") fail(`the review is ${review.status}, it must be open`);

  const { count } = await supabase
    .from("minutes_attestations")
    .select("line_id", { count: "exact", head: true })
    .eq("review_id", review.id);
  if ((count ?? 0) > 0) console.warn(`[tasdeeq] seed: ${count} answers already exist, the run may be skewed`);

  const { data: rows, error: linesErr } = await supabase
    .from("minutes_lines")
    .select("id, position, section, text, evidence, speaker_labels")
    .eq("review_id", review.id)
    .order("position", { ascending: true });
  if (linesErr) fail(`could not read the lines: ${linesErr.message}`);

  const lines: SeedLine[] = ((rows ?? []) as LineRow[]).map((r) => ({
    id: r.id,
    position: r.position,
    section: r.section,
    text: r.text,
    evidence: r.evidence ?? [],
    speakerLabels: r.speaker_labels ?? [],
  }));
  const plants = planSeed(lines, k);
  if (plants.length < k) console.warn(`[tasdeeq] seed: only ${plants.length} of ${k} errors could be planted`);

  if (write) {
    for (const p of plants) {
      const { error } = await supabase
        .from("minutes_lines")
        .update({ text: p.after.text, evidence: p.after.evidence, speaker_labels: p.after.speakerLabels })
        .eq("id", p.lineId);
      if (error) fail(`could not update line ${p.position}: ${error.message}`);
    }
  }

  console.log(`\nAnswer key for meeting ${meetingId} (${write ? "written" : "dry run, nothing changed"})\n`);
  plants.forEach((p, i) => {
    console.log(`${i + 1}. Line ${p.position + 1} [${p.kind}]`);
    console.log(`   before: ${p.before.text}`);
    console.log(`   after:  ${p.after.text}`);
    console.log(`   expect: ${p.expected}\n`);
  });

  const out = resolve(process.cwd(), "reports", `tasdeeq-seed-${meetingId}.json`);
  writeFileSync(out, JSON.stringify({ meetingId, reviewId: review.id, written: write, plants }, null, 2));
  console.log(`Saved the answer key to ${out}`);
}

main().catch((err: unknown) => {
  console.error("[tasdeeq] seed failed", err);
  process.exit(1);
});
