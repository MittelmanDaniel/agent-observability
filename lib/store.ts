import type { Event, Run, Section } from "./types";

/* -------------------------------------------------------------------------- */
/*  Detect mode: Elasticsearch when env vars set, in-memory otherwise         */
/* -------------------------------------------------------------------------- */

const USE_ES =
  !!process.env.ELASTICSEARCH_URL && !!process.env.ELASTICSEARCH_API_KEY;

/* ============================== Elasticsearch ==============================*/

async function es() {
  const { getElastic } = await import("./db");
  return getElastic();
}

/* ============================== In-memory ==================================*/

import fs from "fs";
import path from "path";

const memRuns = new Map<string, Run>();
const memEvents = new Map<string, Event[]>();
let seeded = false;

function seedFromFile() {
  if (seeded) return;
  seeded = true;
  const filePath = path.join(process.cwd(), "data", "sample_runs.json");
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const items = JSON.parse(raw) as Array<{
      run: Run;
      events: Omit<Event, "run_id">[];
    }>;
    for (const { run, events } of items) {
      memRuns.set(run.id, run);
      const withRunId = events.map((e) => ({ ...e, run_id: run.id }));
      memEvents.set(run.id, withRunId);
    }
  } catch {
    // ignore
  }
}

/* ============================== Public API =================================*/

export interface ProjectSummary {
  source: string;
  runs: number;
  tasks: number;
  succeeded: number;
  failed: number;
  reward_hacking: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (USE_ES) {
    const client = await es();
    const result = await client.search({
      index: "runs",
      size: 0,
      aggs: {
        by_source: {
          terms: { field: "source", size: 100 },
          aggs: {
            unique_tasks: { cardinality: { field: "task" } },
            succeeded: { filter: { term: { status: "succeeded" } } },
            failed: { filter: { term: { status: "failed" } } },
            reward_hacking: { filter: { term: { status: "reward_hacking" } } },
          },
        },
      },
    });
    const buckets = (
      result.aggregations?.by_source as {
        buckets: Array<{
          key: string;
          doc_count: number;
          unique_tasks: { value: number };
          succeeded: { doc_count: number };
          failed: { doc_count: number };
          reward_hacking: { doc_count: number };
        }>;
      }
    ).buckets;

    return buckets.map((b) => ({
      source: b.key,
      runs: b.doc_count,
      tasks: b.unique_tasks.value,
      succeeded: b.succeeded.doc_count,
      failed: b.failed.doc_count,
      reward_hacking: b.reward_hacking.doc_count,
    }));
  }

  seedFromFile();
  const bySource = new Map<string, ProjectSummary>();
  const tasksBySource = new Map<string, Set<string>>();
  for (const run of memRuns.values()) {
    const src = run.source;
    const existing = bySource.get(src);
    if (!tasksBySource.has(src)) tasksBySource.set(src, new Set());
    tasksBySource.get(src)!.add(run.task);
    if (!existing) {
      bySource.set(src, {
        source: src,
        runs: 1,
        tasks: 0,
        succeeded: run.status === "succeeded" ? 1 : 0,
        failed: run.status === "failed" ? 1 : 0,
        reward_hacking: run.status === "reward_hacking" ? 1 : 0,
      });
    } else {
      existing.runs += 1;
      if (run.status === "succeeded") existing.succeeded += 1;
      if (run.status === "failed") existing.failed += 1;
      if (run.status === "reward_hacking") existing.reward_hacking += 1;
    }
  }
  for (const [src, tasks] of tasksBySource) {
    const p = bySource.get(src);
    if (p) p.tasks = tasks.size;
  }
  return Array.from(bySource.values());
}

export interface TaskSummary {
  task: string;
  runs: number;
  succeeded: number;
  failed: number;
  reward_hacking: number;
  latest_started_at: string;
}

export async function listTaskSummaries(source?: string): Promise<TaskSummary[]> {
  if (USE_ES) {
    const client = await es();
    const result = await client.search({
      index: "runs",
      size: 0,
      query: source ? { term: { source } } : { match_all: {} },
      aggs: {
        by_task: {
          terms: { field: "task", size: 1000 },
          aggs: {
            succeeded: {
              filter: { term: { status: "succeeded" } },
            },
            failed: {
              filter: { term: { status: "failed" } },
            },
            reward_hacking: {
              filter: { term: { status: "reward_hacking" } },
            },
            latest: {
              max: { field: "started_at" },
            },
          },
        },
      },
    });
    const buckets = (
      result.aggregations?.by_task as {
        buckets: Array<{
          key: string;
          doc_count: number;
          succeeded: { doc_count: number };
          failed: { doc_count: number };
          reward_hacking: { doc_count: number };
          latest: { value_as_string: string };
        }>;
      }
    ).buckets;

    return buckets
      .map((b) => ({
        task: b.key,
        runs: b.doc_count,
        succeeded: b.succeeded.doc_count,
        failed: b.failed.doc_count,
        reward_hacking: b.reward_hacking.doc_count,
        latest_started_at: b.latest.value_as_string,
      }))
      .sort(
        (a, b) =>
          new Date(b.latest_started_at).getTime() -
          new Date(a.latest_started_at).getTime()
      );
  }

  seedFromFile();
  const byTask = new Map<string, TaskSummary>();
  for (const run of memRuns.values()) {
    if (source && run.source !== source) continue;
    const existing = byTask.get(run.task);
    if (!existing) {
      byTask.set(run.task, {
        task: run.task,
        runs: 1,
        succeeded: run.status === "succeeded" ? 1 : 0,
        failed: run.status === "failed" ? 1 : 0,
        reward_hacking: run.status === "reward_hacking" ? 1 : 0,
        latest_started_at: run.started_at,
      });
    } else {
      existing.runs += 1;
      if (run.status === "succeeded") existing.succeeded += 1;
      if (run.status === "failed") existing.failed += 1;
      if (run.status === "reward_hacking") existing.reward_hacking += 1;
      if (
        new Date(run.started_at).getTime() >
        new Date(existing.latest_started_at).getTime()
      ) {
        existing.latest_started_at = run.started_at;
      }
    }
  }
  return Array.from(byTask.values()).sort(
    (a, b) =>
      new Date(b.latest_started_at).getTime() -
      new Date(a.latest_started_at).getTime()
  );
}

export interface TaskLengthStats {
  task: string;
  runs: number;
  avgEvents: number;
  maxEvents: number;
}

/** Task trajectory length (avg/max events per run) for sorting by "longest first". */
export async function getTaskLengthStats(
  source: string
): Promise<TaskLengthStats[]> {
  if (USE_ES) {
    const client = await es();
    const runsRes = await client.search({
      index: "runs",
      size: 10000,
      query: { term: { source } },
      _source: ["id", "task"],
    });
    const runIdToTask = new Map<string, string>();
    for (const h of runsRes.hits.hits as Array<{
      _id: string;
      _source?: { id?: string; task: string };
    }>) {
      const id = h._source?.id ?? h._id;
      runIdToTask.set(id, h._source?.task ?? "");
    }
    const eventsRes = await client.search({
      index: "events",
      size: 0,
      aggs: {
        by_run: { terms: { field: "run_id", size: 10000 } },
      },
    });
    const buckets =
      (eventsRes.aggregations?.by_run as {
        buckets: Array<{ key: string; doc_count: number }>;
      })?.buckets ?? [];
    const runIdToCount = new Map<string, number>();
    for (const b of buckets) runIdToCount.set(b.key, b.doc_count);
    const byTask = new Map<
      string,
      { runs: number; totalEvents: number; maxEvents: number }
    >();
    for (const [runId, task] of runIdToTask) {
      const events = runIdToCount.get(runId) ?? 0;
      const cur = byTask.get(task);
      if (!cur) {
        byTask.set(task, { runs: 1, totalEvents: events, maxEvents: events });
      } else {
        cur.runs += 1;
        cur.totalEvents += events;
        cur.maxEvents = Math.max(cur.maxEvents, events);
      }
    }
    return Array.from(byTask.entries())
      .map(([task, v]) => ({
        task,
        runs: v.runs,
        avgEvents: Math.round((v.totalEvents / v.runs) * 10) / 10,
        maxEvents: v.maxEvents,
      }))
      .sort((a, b) => b.avgEvents - a.avgEvents);
  }
  seedFromFile();
  const byTask = new Map<
    string,
    { runs: number; totalEvents: number; maxEvents: number }
  >();
  for (const run of memRuns.values()) {
    if (run.source !== source) continue;
    const events = (memEvents.get(run.id) ?? []).length;
    const cur = byTask.get(run.task);
    if (!cur) {
      byTask.set(run.task, { runs: 1, totalEvents: events, maxEvents: events });
    } else {
      cur.runs += 1;
      cur.totalEvents += events;
      cur.maxEvents = Math.max(cur.maxEvents, events);
    }
  }
  return Array.from(byTask.entries())
    .map(([task, v]) => ({
      task,
      runs: v.runs,
      avgEvents: Math.round((v.totalEvents / v.runs) * 10) / 10,
      maxEvents: v.maxEvents,
    }))
    .sort((a, b) => b.avgEvents - a.avgEvents);
}

export async function listRuns(): Promise<Run[]> {
  if (USE_ES) {
    const client = await es();
    const result = await client.search({
      index: "runs",
      size: 1000,
      sort: [{ started_at: "desc" }],
      _source: ["id", "source", "task", "status", "started_at", "ended_at", "model_name", "exit_status", "eval_score", "eval_passed", "eval_failed", "eval_errors", "eval_total"],
    });
    return result.hits.hits.map((h) => h._source as Run);
  }

  seedFromFile();
  return Array.from(memRuns.values()).sort(
    (a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
}

export async function getRunsByTask(task: string): Promise<Run[]> {
  if (USE_ES) {
    const client = await es();
    const result = await client.search({
      index: "runs",
      size: 1000,
      query: { term: { task } },
      sort: [{ started_at: "desc" }],
      _source: ["id", "source", "task", "status", "started_at", "ended_at", "model_name", "exit_status", "generated_patch", "eval_score", "eval_passed", "eval_failed", "eval_errors", "eval_total", "trace_label", "trace_label_description", "trace_trajectory_id"],
    });
    return result.hits.hits.map((h) => h._source as Run);
  }

  seedFromFile();
  return Array.from(memRuns.values())
    .filter((r) => r.task === task)
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
}

export async function getRun(id: string): Promise<Run | undefined> {
  if (USE_ES) {
    const client = await es();
    try {
      const result = await client.get({ index: "runs", id });
      return result._source as Run;
    } catch {
      return undefined;
    }
  }

  seedFromFile();
  return memRuns.get(id);
}

export async function getEvents(runId: string): Promise<Event[]> {
  if (USE_ES) {
    const client = await es();
    const result = await client.search({
      index: "events",
      size: 10000,
      query: { term: { run_id: runId } },
      sort: [{ idx: "asc" }],
      _source: ["run_id", "idx", "ts", "type", "actor", "content", "metadata"],
    });
    return result.hits.hits.map((h) => h._source as Event);
  }

  seedFromFile();
  const list = memEvents.get(runId) ?? [];
  return [...list].sort((a, b) => a.idx - b.idx);
}

export async function createRun(
  run: Run,
  eventList: Omit<Event, "run_id" | "id">[]
): Promise<Run> {
  if (USE_ES) {
    const client = await es();
    // Index the run document
    await client.index({
      index: "runs",
      id: run.id,
      document: run,
      refresh: "wait_for",
    });
    // Bulk index events
    if (eventList.length > 0) {
      const operations = eventList.flatMap((e) => [
        { index: { _index: "events" } },
        { ...e, run_id: run.id },
      ]);
      await client.bulk({ operations, refresh: "wait_for" });
    }
    return run;
  }

  seedFromFile();
  memRuns.set(run.id, run);
  const withRunId = eventList.map((e) => ({ ...e, run_id: run.id }));
  memEvents.set(run.id, withRunId);
  return run;
}

export async function addEvents(
  runId: string,
  eventList: Omit<Event, "run_id" | "id">[]
): Promise<void> {
  if (USE_ES) {
    const client = await es();
    if (eventList.length > 0) {
      const operations = eventList.flatMap((e) => [
        { index: { _index: "events" } },
        { ...e, run_id: runId },
      ]);
      await client.bulk({ operations, refresh: "wait_for" });
    }
    return;
  }

  seedFromFile();
  const existing = memEvents.get(runId) ?? [];
  const withRunId = eventList.map((e) => ({ ...e, run_id: runId }));
  memEvents.set(runId, [...existing, ...withRunId]);
}

/* Sections */

export async function getSections(runId: string): Promise<Section[]> {
  if (USE_ES) {
    const client = await es();
    const result = await client.search({
      index: "sections",
      size: 1000,
      query: { term: { run_id: runId } },
      sort: [{ start_idx: "asc" }],
    });
    return result.hits.hits.map((h) => h._source as Section);
  }
  return [];
}

export async function saveSections(sections: Section[]): Promise<void> {
  if (!USE_ES || sections.length === 0) return;
  const client = await es();
  const operations = sections.flatMap((s) => [
    { index: { _index: "sections", _id: s.id } },
    s,
  ]);
  await client.bulk({ operations, refresh: "wait_for" });
}

/* Full-text search across events (bonus: free with ES!) */

export async function searchEvents(
  query: string,
  limit = 50
): Promise<(Event & { _score: number })[]> {
  if (!USE_ES) return [];
  const client = await es();
  const result = await client.search({
    index: "events",
    size: limit,
    query: {
      match: { content: { query, fuzziness: "AUTO" } },
    },
    _source: ["run_id", "idx", "ts", "type", "actor", "content"],
  });
  return result.hits.hits.map((h) => ({
    ...(h._source as Event),
    _score: h._score ?? 0,
  }));
}
