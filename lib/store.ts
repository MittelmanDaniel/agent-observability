import type { Event, Run, Section } from "./types";

/* -------------------------------------------------------------------------- */
/*  Detect mode: Postgres when DATABASE_URL is set, in-memory otherwise       */
/* -------------------------------------------------------------------------- */

const USE_DB = !!process.env.DATABASE_URL;

/* ============================== Postgres ==================================*/

async function pgSql() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL!);
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

export interface TaskSummary {
  task: string;
  runs: number;
  succeeded: number;
  failed: number;
  latest_started_at: string;
}

export async function listTaskSummaries(): Promise<TaskSummary[]> {
  if (USE_DB) {
    const sql = await pgSql();
    const rows = await sql`
      SELECT
        task,
        COUNT(*)::int AS runs,
        COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        MAX(started_at)::text AS latest_started_at
      FROM runs
      GROUP BY task
      ORDER BY MAX(started_at) DESC
    `;
    return rows as TaskSummary[];
  }

  seedFromFile();
  const byTask = new Map<string, TaskSummary>();
  for (const run of memRuns.values()) {
    const existing = byTask.get(run.task);
    if (!existing) {
      byTask.set(run.task, {
        task: run.task,
        runs: 1,
        succeeded: run.status === "succeeded" ? 1 : 0,
        failed: run.status === "failed" ? 1 : 0,
        latest_started_at: run.started_at,
      });
    } else {
      existing.runs += 1;
      if (run.status === "succeeded") existing.succeeded += 1;
      if (run.status === "failed") existing.failed += 1;
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

export async function listRuns(): Promise<Run[]> {
  if (USE_DB) {
    const sql = await pgSql();
    const rows = await sql`
      SELECT id, source, task, status,
             started_at::text AS started_at,
             ended_at::text AS ended_at
      FROM runs
      ORDER BY started_at DESC
    `;
    return rows as Run[];
  }

  seedFromFile();
  return Array.from(memRuns.values()).sort(
    (a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
}

export async function getRunsByTask(task: string): Promise<Run[]> {
  if (USE_DB) {
    const sql = await pgSql();
    const rows = await sql`
      SELECT id, source, task, status,
             started_at::text AS started_at,
             ended_at::text AS ended_at
      FROM runs
      WHERE task = ${task}
      ORDER BY started_at DESC
    `;
    return rows as Run[];
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
  if (USE_DB) {
    const sql = await pgSql();
    const rows = await sql`
      SELECT id, source, task, status,
             started_at::text AS started_at,
             ended_at::text AS ended_at
      FROM runs
      WHERE id = ${id}
      LIMIT 1
    `;
    return (rows[0] as Run) ?? undefined;
  }

  seedFromFile();
  return memRuns.get(id);
}

export async function getEvents(runId: string): Promise<Event[]> {
  if (USE_DB) {
    const sql = await pgSql();
    const rows = await sql`
      SELECT id::text, run_id, idx, ts::text, type, actor, content, metadata
      FROM events
      WHERE run_id = ${runId}
      ORDER BY idx ASC
    `;
    return rows as Event[];
  }

  seedFromFile();
  const list = memEvents.get(runId) ?? [];
  return [...list].sort((a, b) => a.idx - b.idx);
}

export async function createRun(
  run: Run,
  eventList: Omit<Event, "run_id" | "id">[]
): Promise<Run> {
  if (USE_DB) {
    const sql = await pgSql();
    await sql`
      INSERT INTO runs (id, source, task, status, started_at, ended_at)
      VALUES (${run.id}, ${run.source}, ${run.task}, ${run.status}, ${run.started_at}, ${run.ended_at})
    `;
    for (const e of eventList) {
      await sql`
        INSERT INTO events (run_id, idx, ts, type, actor, content, metadata)
        VALUES (${run.id}, ${e.idx}, ${e.ts}, ${e.type}, ${e.actor}, ${e.content}, ${JSON.stringify(e.metadata ?? null)})
      `;
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
  if (USE_DB) {
    const sql = await pgSql();
    for (const e of eventList) {
      await sql`
        INSERT INTO events (run_id, idx, ts, type, actor, content, metadata)
        VALUES (${runId}, ${e.idx}, ${e.ts}, ${e.type}, ${e.actor}, ${e.content}, ${JSON.stringify(e.metadata ?? null)})
      `;
    }
    return;
  }

  seedFromFile();
  const existing = memEvents.get(runId) ?? [];
  const withRunId = eventList.map((e) => ({ ...e, run_id: runId }));
  memEvents.set(runId, [...existing, ...withRunId]);
}

/* Sections (for Phase 3) */

export async function getSections(runId: string): Promise<Section[]> {
  if (USE_DB) {
    const sql = await pgSql();
    const rows = await sql`
      SELECT id, run_id, start_idx, end_idx, label, what_happened,
             verdict, root_cause_guess, fix_suggestion, confidence
      FROM sections
      WHERE run_id = ${runId}
      ORDER BY start_idx ASC
    `;
    return rows as Section[];
  }
  return [];
}

export async function saveSections(sections: Section[]): Promise<void> {
  if (!USE_DB || sections.length === 0) return;
  const sql = await pgSql();
  for (const s of sections) {
    await sql`
      INSERT INTO sections (id, run_id, start_idx, end_idx, label, what_happened, verdict, root_cause_guess, fix_suggestion, confidence)
      VALUES (${s.id}, ${s.run_id}, ${s.start_idx}, ${s.end_idx}, ${s.label}, ${s.what_happened}, ${s.verdict}, ${s.root_cause_guess ?? null}, ${s.fix_suggestion ?? null}, ${s.confidence ?? null})
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        what_happened = EXCLUDED.what_happened,
        verdict = EXCLUDED.verdict,
        root_cause_guess = EXCLUDED.root_cause_guess,
        fix_suggestion = EXCLUDED.fix_suggestion,
        confidence = EXCLUDED.confidence
    `;
  }
}
