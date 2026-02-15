/**
 * Seed Elasticsearch from data/sample_runs.json.
 *
 * Usage:
 *   npx tsx scripts/seed-db.ts
 *
 * Requires ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY in .env.local or environment.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "@elastic/elasticsearch";
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
  const node = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;

  if (!node || !apiKey) {
    console.error(
      "ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY must be set in .env.local"
    );
    process.exit(1);
  }

  const client = new Client({ node, auth: { apiKey } });
  const filePath = path.join(process.cwd(), "data", "sample_runs.json");

  if (!fs.existsSync(filePath)) {
    console.error(
      "data/sample_runs.json not found. Run load_trajectories.py first."
    );
    process.exit(1);
  }

  console.log("Reading sample_runs.json...");
  const raw = fs.readFileSync(filePath, "utf-8");
  const items: RunData[] = JSON.parse(raw);
  console.log(`Found ${items.length} runs.`);

  // Clear existing data
  console.log("Clearing existing data...");
  for (const index of ["events", "sections", "runs"]) {
    try {
      await client.deleteByQuery({
        index,
        query: { match_all: {} },
        refresh: true,
      });
    } catch {
      // index might not exist yet
    }
  }

  let runCount = 0;
  let eventCount = 0;

  for (const { run, events } of items) {
    // Index the run
    await client.index({
      index: "runs",
      id: run.id,
      document: run,
    });
    runCount++;

    // Bulk index events in batches of 500
    for (let i = 0; i < events.length; i += 500) {
      const batch = events.slice(i, i + 500);
      const operations = batch.flatMap((e) => [
        { index: { _index: "events" } },
        { ...e, run_id: run.id },
      ]);
      await client.bulk({ operations });
      eventCount += batch.length;
    }

    if (runCount % 10 === 0 || runCount === items.length) {
      console.log(
        `  Seeded ${runCount}/${items.length} runs (${eventCount} events)...`
      );
    }
  }

  // Final refresh to make everything searchable
  await client.indices.refresh({ index: ["runs", "events"] });

  console.log(`Done. Seeded ${runCount} runs with ${eventCount} events.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
