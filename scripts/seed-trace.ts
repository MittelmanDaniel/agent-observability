/**
 * Seed Elasticsearch with TRACE dataset runs from data/trace_runs.json.
 * IMPORTANT: This does NOT clear existing data — it only adds TRACE runs.
 *
 * To remove all TRACE data later:
 *   npx tsx scripts/seed-trace.ts --remove
 *
 * Usage:
 *   npx tsx scripts/seed-trace.ts            # seed TRACE data
 *   npx tsx scripts/seed-trace.ts --remove   # remove all TRACE data
 *
 * Requires ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY in .env.local.
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
    trace_label?: string;
    trace_label_description?: string;
    trace_trajectory_id?: string;
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

function getClient(): Client {
  const node = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;

  if (!node || !apiKey) {
    console.error(
      "ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY must be set in .env.local"
    );
    process.exit(1);
  }

  return new Client({ node, auth: { apiKey } });
}

async function removeTraceData() {
  const client = getClient();

  console.log("Removing all TRACE data from Elasticsearch...");

  // First find all TRACE run IDs
  const runsResult = await client.search({
    index: "runs",
    size: 10000,
    query: { term: { source: "trace" } },
    _source: ["id"],
  });

  const runIds = runsResult.hits.hits.map(
    (h) => (h._source as { id: string }).id
  );
  console.log(`Found ${runIds.length} TRACE runs to remove.`);

  if (runIds.length === 0) {
    console.log("Nothing to remove.");
    return;
  }

  // Delete events belonging to those runs
  const eventsResult = await client.deleteByQuery({
    index: "events",
    query: { terms: { run_id: runIds } },
    refresh: true,
  });
  console.log(`Deleted ${eventsResult.deleted} events.`);

  // Delete sections belonging to those runs
  try {
    const sectionsResult = await client.deleteByQuery({
      index: "sections",
      query: { terms: { run_id: runIds } },
      refresh: true,
    });
    console.log(`Deleted ${sectionsResult.deleted} sections.`);
  } catch {
    // sections index might not exist
  }

  // Delete the runs themselves
  const runsDeleteResult = await client.deleteByQuery({
    index: "runs",
    query: { term: { source: "trace" } },
    refresh: true,
  });
  console.log(`Deleted ${runsDeleteResult.deleted} runs.`);

  console.log("All TRACE data removed.");
}

async function seedTraceData() {
  const client = getClient();
  const filePath = path.join(process.cwd(), "data", "trace_runs.json");

  if (!fs.existsSync(filePath)) {
    console.error(
      "data/trace_runs.json not found. Run load_trace.py first:\n" +
        "  HF_TOKEN=hf_xxx uv run python scripts/load_trace.py --limit 0"
    );
    process.exit(1);
  }

  console.log("Reading trace_runs.json...");
  const raw = fs.readFileSync(filePath, "utf-8");
  const items: RunData[] = JSON.parse(raw);
  console.log(`Found ${items.length} TRACE runs to seed.`);

  let runCount = 0;
  let eventCount = 0;

  for (const { run, events } of items) {
    // Index the run (uses run.id as doc ID, so re-running is idempotent)
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

    if (runCount % 50 === 0 || runCount === items.length) {
      console.log(
        `  Seeded ${runCount}/${items.length} runs (${eventCount} events)...`
      );
    }
  }

  // Refresh to make everything searchable
  await client.indices.refresh({ index: ["runs", "events"] });

  console.log(
    `Done. Seeded ${runCount} TRACE runs with ${eventCount} events.`
  );
  console.log(
    "To remove later: npx tsx scripts/seed-trace.ts --remove"
  );
}

const isRemove = process.argv.includes("--remove");

if (isRemove) {
  removeTraceData().catch((err) => {
    console.error("Remove failed:", err);
    process.exit(1);
  });
} else {
  seedTraceData().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
