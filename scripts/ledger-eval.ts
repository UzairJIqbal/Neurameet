// Promise Ledger evaluation (spec 0001, AC-16).
//
// Runs the production judge (judgeLedgerCandidates, then filterVerdicts with the
// 0.7 threshold and the quote check) on a hand labelled set and prints precision
// and recall per relation and per language, plus Cohen's kappa between the two
// human labels. label_a is the truth. Zero cost: same Gemini plus Groq free tier.
//
// Run with: npm run eval:ledger -- [--limit N] [--out results.json] [--delay ms]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";
import {
  EVAL_LANGUAGES,
  accuracy,
  cohensKappa,
  precisionRecall,
  type EvalLabel,
  type EvalLanguage,
  type EvalOutcome,
} from "../src/lib/ledger-eval-metrics";

const PAIRS_PATH = resolve(process.cwd(), "scripts/ledger-eval/pairs.json");
const DEFAULT_DELAY_MS = 4000;

const labelSchema = z.enum(["kept", "reversed", "none"]);
const pairSchema = z.object({
  id: z.string().min(1),
  item: z.object({
    kind: z.enum(["decision", "promise"]),
    statement: z.string().min(1),
    quote: z.string().min(1),
    language: z.enum(["en", "ur", "mixed"]),
    assignee: z.string().nullable(),
    dueDate: z.string().nullable(),
  }),
  evidence: z.string().min(1),
  label_a: labelSchema,
  label_b: labelSchema.nullable(),
});
const fileSchema = z.object({ pairs: z.array(pairSchema).min(1) });
type EvalPair = z.infer<typeof pairSchema>;

interface CliOptions {
  limit: number | null;
  out: string | null;
  delayMs: number;
}

interface PairResult {
  id: string;
  language: EvalLanguage;
  truth: EvalLabel;
  predicted: EvalLabel | null;
  confidence: number | null;
  error: string | null;
}

function fail(message: string): never {
  console.error(`ledger-eval: ${message}`);
  process.exit(1);
}

function readOption(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? fail(`${name} needs a value`));
}

function parseArgs(args: string[]): CliOptions {
  const limit = readOption(args, "--limit");
  const delay = readOption(args, "--delay");
  const limitN = limit === null ? null : Number(limit);
  const delayN = delay === null ? DEFAULT_DELAY_MS : Number(delay);
  if (limitN !== null && !(Number.isInteger(limitN) && limitN > 0)) {
    fail("--limit must be a positive whole number");
  }
  if (!(Number.isInteger(delayN) && delayN >= 0)) {
    fail("--delay must be a whole number of milliseconds");
  }
  return { limit: limitN, out: readOption(args, "--out"), delayMs: delayN };
}

function loadPairs(): EvalPair[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(PAIRS_PATH, "utf8"));
  } catch (error) {
    fail(`could not read ${PAIRS_PATH}: ${String(error)}`);
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = issue.path[1];
    const pairs = (raw as { pairs?: Array<{ id?: unknown }> }).pairs;
    const id = typeof index === "number" ? pairs?.[index]?.id : undefined;
    fail(
      `bad pairs.json at ${issue.path.join(".")}${id ? ` (pair ${String(id)})` : ""}: ${issue.message}`,
    );
  }
  const ids = new Set<string>();
  for (const pair of parsed.data.pairs) {
    if (ids.has(pair.id)) fail(`duplicate pair id ${pair.id}`);
    ids.add(pair.id);
  }
  return parsed.data.pairs;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function judgePair(pair: EvalPair): Promise<PairResult> {
  // Loaded after dotenv so the providers see the keys.
  const { judgeLedgerCandidates, filterVerdicts } =
    await import("../src/agent/ledger");
  const base = {
    id: pair.id,
    language: pair.item.language,
    truth: pair.label_a,
  };
  try {
    const verdicts = await judgeLedgerCandidates({
      rawText: pair.evidence,
      candidates: [
        {
          id: pair.id,
          kind: pair.item.kind,
          statement: pair.item.statement,
          quote: pair.item.quote,
          assignee: pair.item.assignee,
          dueDate: pair.item.dueDate,
        },
      ],
    });
    // Same keep rule as production: threshold plus verified quote.
    const [row] = filterVerdicts({
      verdicts,
      candidateIds: [pair.id],
      rawText: pair.evidence,
    });
    const raw = verdicts.find((v) => v.itemId === pair.id);
    return {
      ...base,
      predicted: row ? row.relation : "none",
      confidence: raw ? raw.confidence : null,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ledger-eval] judge failed for ${pair.id}: ${message}`);
    return { ...base, predicted: null, confidence: null, error: message };
  }
}

const pct = (value: number | null) =>
  value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;

function printMetrics(outcomes: EvalOutcome[]): void {
  const groups: Array<[string, EvalOutcome[]]> = [
    ...EVAL_LANGUAGES.map((lang): [string, EvalOutcome[]] => [
      lang,
      outcomes.filter((o) => o.language === lang),
    ]),
    ["all", outcomes],
  ];
  console.log("\nlanguage  relation  precision  recall   support");
  for (const [name, group] of groups) {
    for (const label of ["kept", "reversed"] as const) {
      const m = precisionRecall(group, label);
      console.log(
        `${name.padEnd(9)} ${label.padEnd(9)} ${pct(m.precision).padEnd(10)} ${pct(m.recall).padEnd(8)} ${m.support}`,
      );
    }
  }
  console.log("\naccuracy (kept, reversed, none):");
  for (const [name, group] of groups) {
    console.log(
      `  ${name.padEnd(6)} ${pct(accuracy(group))} of ${group.length}`,
    );
  }
}

function printKappa(pairs: EvalPair[]): void {
  const both = pairs.flatMap((p): Array<[EvalLabel, EvalLabel]> =>
    p.label_b === null ? [] : [[p.label_a, p.label_b]],
  );
  const kappa = cohensKappa(both);
  console.log(
    kappa === null
      ? "\nCohen's kappa (label_a vs label_b): needs label_b (no pair has one yet)"
      : `\nCohen's kappa (label_a vs label_b): ${kappa.toFixed(3)} over ${both.length} pairs`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GROQ_API_KEY) {
    fail("no GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY in the environment");
  }

  const all = loadPairs();
  const pairs = options.limit === null ? all : all.slice(0, options.limit);
  console.log(`Judging ${pairs.length} of ${all.length} pairs...`);

  const results: PairResult[] = [];
  for (const [i, pair] of pairs.entries()) {
    if (i > 0) await sleep(options.delayMs);
    const result = await judgePair(pair);
    results.push(result);
    console.log(
      `  ${pair.id} truth=${result.truth} predicted=${result.predicted ?? "error"}`,
    );
  }

  const outcomes = results.flatMap((r): EvalOutcome[] =>
    r.predicted === null
      ? []
      : [{ language: r.language, truth: r.truth, predicted: r.predicted }],
  );
  const errors = results.filter((r) => r.predicted === null);
  const counts = EVAL_LANGUAGES.map(
    (lang) => `${lang} ${pairs.filter((p) => p.item.language === lang).length}`,
  ).join(", ");
  console.log(
    `\nPairs: ${pairs.length} (${counts}). Scored: ${outcomes.length}. Judge errors: ${errors.length}.`,
  );

  printMetrics(outcomes);
  printKappa(pairs);

  const wrong = results.filter(
    (r) => r.predicted !== null && r.predicted !== r.truth,
  );
  console.log(
    `\nWrong predictions: ${wrong.length ? wrong.map((r) => `${r.id} (${r.truth} → ${r.predicted})`).join(", ") : "none"}`,
  );
  if (errors.length) {
    console.log(
      `Not scored (judge error): ${errors.map((r) => r.id).join(", ")}`,
    );
  }

  if (options.out) {
    const outPath = resolve(process.cwd(), options.out);
    writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`\nPer pair results written to ${outPath}`);
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
