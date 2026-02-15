/**
 * Check which runs have "reproduc" in their section labels/summaries.
 * Usage: npx tsx scripts/check-reproduction.ts <task> [source]
 */
import "./load-env";
import { getElastic, SECTIONS_INDEX } from "../lib/db";

async function main() {
  const task = process.argv[2] ?? "cuthbertLab__music21-958";
  const source = process.argv[3] ?? "custom";
  const client = getElastic();

  const runsRes = await client.search({
    index: "runs",
    size: 100,
    query: { bool: { must: [{ term: { task } }, { term: { source } }, { exists: { field: "embedding" } }] } },
    _source: ["id"],
  });
  const runIds = (runsRes.hits.hits as Array<{ _id: string }>).map((h) => h._id);

  console.log(`Runs with embedding: ${runIds.length}\n`);
  for (const runId of runIds) {
    const sectionsRes = await client.search({
      index: SECTIONS_INDEX,
      size: 30,
      query: { term: { run_id: runId } },
      _source: ["label", "what_happened"],
    });
    const sections = (sectionsRes.hits.hits as Array<{ _source: { label?: string; what_happened?: string } }>).map(
      (h) => h._source
    );
    const text = sections.map((s) => (s.label ?? "") + " " + (s.what_happened ?? "")).join(" ");
    const hasReproduc = /reproduc/i.test(text);
    const shortId = runId.split("-").pop();
    console.log(`${shortId}: ${hasReproduc ? "YES (reproduction)" : "no"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
