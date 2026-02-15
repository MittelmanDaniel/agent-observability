/**
 * Analyze all runs for a task so they get section summaries and run embeddings,
 * then clustering on the task page will have data to work with.
 *
 * Usage:
 *   npx tsx scripts/analyze-task.ts <task> [source] [--limit N]
 *
 * Examples:
 *   npx tsx scripts/analyze-task.ts networkx__networkx-7024 custom
 *   npx tsx scripts/analyze-task.ts cuthbertLab__music21-958 custom --limit 5
 *
 * Requires: ELASTICSEARCH_*, KIBANA_URL, JINA_API_KEY in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getRunsByTask } from "../lib/store";
import { analyzeRun } from "../lib/analyze";

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;
  const rest = limitIdx >= 0 ? args.slice(0, limitIdx).concat(args.slice(limitIdx + 2)) : args;
  const task = rest[0];
  const source = rest[1];

  if (!task) {
    console.error("Usage: npx tsx scripts/analyze-task.ts <task> [source] [--limit N]");
    process.exit(1);
  }

  const runs = await getRunsByTask(task);
  const filtered = source ? runs.filter((r) => r.source === source) : runs;
  const toRun = limit ? filtered.slice(0, limit) : filtered;

  console.log(`Task: ${task}${source ? ` (source: ${source})` : ""}`);
  console.log(`Runs to analyze: ${toRun.length}${limit ? ` (limit ${limit})` : ""}\n`);

  let ok = 0;
  let err = 0;
  for (let i = 0; i < toRun.length; i++) {
    const run = toRun[i];
    console.log(`[${i + 1}/${toRun.length}] ${run.id}`);
    try {
      await analyzeRun(run.id);
      ok++;
    } catch (e) {
      console.error(`  Failed:`, e);
      err++;
    }
  }
  console.log(`\nDone: ${ok} analyzed, ${err} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
