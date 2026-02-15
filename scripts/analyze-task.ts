/**
 * Analyze all runs for a task so they get section summaries and run embeddings,
 * then clustering on the task page will have data to work with.
 *
 * Usage:
 *   npx tsx scripts/analyze-task.ts <task> [source] [--limit N] [--concurrency C]
 *
 * Examples:
 *   npx tsx scripts/analyze-task.ts networkx__networkx-7024 custom
 *   npx tsx scripts/analyze-task.ts cuthbertLab__music21-958 custom --limit 5
 *   npx tsx scripts/analyze-task.ts networkx__networkx-7024 custom --concurrency 5
 *   npx tsx scripts/analyze-task.ts cuthbertLab__music21-958 custom --limit 25 --concurrency 5
 *
 * Default concurrency is 5. Use --limit 20+ and then run similarity-distribution.ts to inspect threshold.
 *
 * Requires: ELASTICSEARCH_*, KIBANA_URL, JINA_API_KEY in .env.local
 */

import "./load-env";
import { getRunsByTask } from "../lib/store";
import { analyzeRun } from "../lib/analyze";

function parseArgs(args: string[]): { task?: string; source?: string; limit?: number; concurrency: number } {
  let limit: number | undefined;
  let concurrency = 5;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1] != null) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--concurrency" && args[i + 1] != null) {
      concurrency = Math.max(1, parseInt(args[i + 1], 10));
      i++;
    } else if (!args[i]!.startsWith("--")) {
      positional.push(args[i]!);
    }
  }
  return {
    task: positional[0],
    source: positional[1],
    limit,
    concurrency,
  };
}

async function main() {
  const { task, source, limit, concurrency } = parseArgs(process.argv.slice(2));

  if (!task) {
    console.error("Usage: npx tsx scripts/analyze-task.ts <task> [source] [--limit N] [--concurrency C]");
    process.exit(1);
  }

  const runs = await getRunsByTask(task);
  const filtered = source ? runs.filter((r) => r.source === source) : runs;
  const toRun = limit ? filtered.slice(0, limit) : filtered;

  console.log(`Task: ${task}${source ? ` (source: ${source})` : ""}`);
  console.log(`Runs to analyze: ${toRun.length}${limit ? ` (limit ${limit})` : ""} (concurrency ${concurrency})\n`);

  let ok = 0;
  let err = 0;

  for (let i = 0; i < toRun.length; i += concurrency) {
    const chunk = toRun.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map((run) => analyzeRun(run.id)));
    for (let j = 0; j < chunk.length; j++) {
      const run = chunk[j]!;
      const result = results[j]!;
      const idx = i + j + 1;
      if (result.status === "fulfilled") {
        console.log(`[${idx}/${toRun.length}] ${run.id} ✓`);
        ok++;
      } else {
        console.error(`[${idx}/${toRun.length}] ${run.id} ✗`, result.reason);
        err++;
      }
    }
  }
  console.log(`\nDone: ${ok} analyzed, ${err} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
