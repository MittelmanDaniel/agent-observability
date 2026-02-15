/**
 * List tasks by trajectory length (avg events per run) so you can pick
 * "mildly long, multi-step" tasks for clustering.
 *
 * Usage:
 *   npx tsx scripts/list-tasks-by-length.ts [source]
 *
 * Requires Elasticsearch (events index with run_id).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getElastic, RUNS_INDEX, EVENTS_INDEX } from "../lib/db";

async function main() {
  const sourceFilter = process.argv[2];
  const client = getElastic();

  // Run ids and task per run (id is in _source or _id)
  const runsRes = await client.search({
    index: RUNS_INDEX,
    size: 10000,
    query: sourceFilter ? { term: { source: sourceFilter } } : { match_all: {} },
    _source: ["id", "task", "source"],
  });
  const runIdToTask = new Map<string, { task: string; source: string }>();
  for (const h of runsRes.hits.hits as Array<{ _id: string; _source?: { id?: string; task: string; source: string } }>) {
    const id = h._source?.id ?? h._id;
    const task = h._source?.task ?? "";
    const source = h._source?.source ?? "";
    runIdToTask.set(id, { task, source });
  }

  // Event count per run_id
  const eventsRes = await client.search({
    index: EVENTS_INDEX,
    size: 0,
    aggs: {
      by_run: {
        terms: { field: "run_id", size: 10000 },
      },
    },
  });
  const buckets = (eventsRes.aggregations?.by_run as { buckets: Array<{ key: string; doc_count: number }> })?.buckets ?? [];
  const runIdToEventCount = new Map<string, number>();
  for (const b of buckets) {
    runIdToEventCount.set(b.key, b.doc_count);
  }

  // Per-task: runs, total events, avg, max
  const byTask = new Map<string, { source: string; runs: number; totalEvents: number; maxEvents: number }>();
  for (const [runId, { task, source }] of runIdToTask) {
    const events = runIdToEventCount.get(runId) ?? 0;
    const cur = byTask.get(task);
    if (!cur) {
      byTask.set(task, { source, runs: 1, totalEvents: events, maxEvents: events });
    } else {
      cur.runs += 1;
      cur.totalEvents += events;
      cur.maxEvents = Math.max(cur.maxEvents, events);
    }
  }

  const rows = Array.from(byTask.entries()).map(([task, v]) => ({
    task,
    source: v.source,
    runs: v.runs,
    avgEvents: Math.round((v.totalEvents / v.runs) * 10) / 10,
    maxEvents: v.maxEvents,
  }));
  rows.sort((a, b) => b.avgEvents - a.avgEvents);

  console.log("Tasks by avg events per run (long / multi-step first):\n");
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  for (const r of rows.slice(0, 25)) {
    const path = `/projects/${encodeURIComponent(r.source)}/tasks/${encodeURIComponent(r.task)}`;
    console.log(`  avg ${r.avgEvents} events (max ${r.maxEvents})  ${r.runs} runs  ${r.source} / ${r.task}`);
    console.log(`    ${base}${path}`);
  }
  if (rows.length > 25) {
    console.log(`  ... and ${rows.length - 25} more tasks`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
