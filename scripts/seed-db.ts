/**
 * Seed the Postgres database from data/sample_runs.json.
 *
 * Usage:
 *   npx tsx scripts/seed-db.ts
 *
 * Requires DATABASE_URL in .env.local or environment.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

interface RunData {
  run: {
    id: string;
    source: string;
    task: string;
    status: string;
    started_at: string;
    ended_at: string;
  };
  events: Array<{
    idx: number;
    ts: string;
    type: string;
    actor: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local");
    process.exit(1);
  }

  const sql = neon(url);
  const filePath = path.join(process.cwd(), "data", "sample_runs.json");

  if (!fs.existsSync(filePath)) {
    console.error("data/sample_runs.json not found. Run load_trajectories.py first.");
    process.exit(1);
  }

  console.log("Reading sample_runs.json...");
  const raw = fs.readFileSync(filePath, "utf-8");
  const items: RunData[] = JSON.parse(raw);
  console.log(`Found ${items.length} runs.`);

  // Clear existing data
  console.log("Clearing existing data...");
  await sql`DELETE FROM events`;
  await sql`DELETE FROM sections`;
  await sql`DELETE FROM runs`;

  let runCount = 0;
  let eventCount = 0;

  for (const { run, events } of items) {
    await sql`
      INSERT INTO runs (id, source, task, status, started_at, ended_at)
      VALUES (${run.id}, ${run.source}, ${run.task}, ${run.status}, ${run.started_at}, ${run.ended_at})
      ON CONFLICT (id) DO NOTHING
    `;
    runCount++;

    // Batch events in groups of 50 for performance
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      await sql`
        INSERT INTO events (run_id, idx, ts, type, actor, content, metadata)
        VALUES (${run.id}, ${e.idx}, ${e.ts}, ${e.type}, ${e.actor}, ${e.content}, ${JSON.stringify(e.metadata ?? null)})
      `;
      eventCount++;
    }

    if (runCount % 10 === 0 || runCount === items.length) {
      console.log(`  Seeded ${runCount}/${items.length} runs (${eventCount} events)...`);
    }
  }

  console.log(`Done. Seeded ${runCount} runs with ${eventCount} events.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
