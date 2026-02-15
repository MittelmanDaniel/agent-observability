/**
 * List tasks with fewest runs first (to find a good task for testing clustering).
 *
 * Usage:
 *   npx tsx scripts/list-tasks-by-run-count.ts [source]
 *
 * If [source] is given, only that project's tasks are listed.
 * Requires ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY (or uses in-memory data).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { listProjects, listTaskSummaries } from "../lib/store";

async function main() {
  const sourceFilter = process.argv[2]; // optional: e.g. "custom"
  const projects = await listProjects();
  const toList = sourceFilter
    ? projects.filter((p) => p.source === sourceFilter)
    : projects;
  if (toList.length === 0) {
    console.log("No projects found.");
    return;
  }

  type Row = { source: string; task: string; runs: number };
  const rows: Row[] = [];
  for (const p of toList) {
    const tasks = await listTaskSummaries(p.source);
    for (const t of tasks) {
      rows.push({ source: p.source, task: t.task, runs: t.runs });
    }
  }
  rows.sort((a, b) => a.runs - b.runs);

  console.log("Tasks by run count (fewest first):\n");
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  for (const r of rows.slice(0, 30)) {
    const path = `/projects/${encodeURIComponent(r.source)}/tasks/${encodeURIComponent(r.task)}`;
    console.log(`  ${r.runs} runs  ${r.source} / ${r.task}`);
    console.log(`    ${base}${path}`);
  }
  if (rows.length > 30) {
    console.log(`  ... and ${rows.length - 30} more tasks`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
