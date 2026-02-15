/**
 * Mark run(s) stuck in "running" as failed (e.g. after a Modal crash).
 *
 * Usage:
 *   npx tsx scripts/mark-running-failed.ts <run_id>     # mark one run
 *   npx tsx scripts/mark-running-failed.ts --all        # mark all running runs
 */

import "./load-env";
import { getElastic, RUNS_INDEX } from "../lib/db";

async function main() {
  const client = getElastic();
  const arg = process.argv[2];
  const now = new Date().toISOString();

  if (arg === "--all") {
    const res = await client.search({
      index: RUNS_INDEX,
      size: 500,
      query: { term: { status: "running" } },
      _source: ["id"],
    });
    const ids = (res.hits.hits as Array<{ _id: string }>).map((h) => h._id);
    if (ids.length === 0) {
      console.log("No runs with status 'running'.");
      return;
    }
    console.log(`Marking ${ids.length} run(s) as failed:`, ids);
    for (const id of ids) {
      await client.update({
        index: RUNS_INDEX,
        id,
        doc: {
          status: "failed",
          exit_status: "runner_error",
          ended_at: now,
        },
        refresh: "wait_for",
      });
    }
    console.log("Done.");
    return;
  }

  if (!arg) {
    console.error("Usage: npx tsx scripts/mark-running-failed.ts <run_id> | --all");
    process.exit(1);
  }

  await client.update({
    index: RUNS_INDEX,
    id: arg,
    doc: {
      status: "failed",
      exit_status: "runner_error",
      ended_at: now,
    },
    refresh: "wait_for",
  });
  console.log("Marked", arg, "as failed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
