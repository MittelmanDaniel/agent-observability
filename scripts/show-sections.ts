/**
 * Print sections for a run (labels + summaries) to sanity-check analysis.
 * Usage: npx tsx scripts/show-sections.ts <runId>
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getElastic, SECTIONS_INDEX } from "../lib/db";

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error("Usage: npx tsx scripts/show-sections.ts <runId>");
    process.exit(1);
  }

  const client = getElastic();
  const res = await client.search({
    index: SECTIONS_INDEX,
    size: 50,
    query: { term: { run_id: runId } },
    sort: [{ start_idx: "asc" }],
    _source: ["label", "what_happened", "start_idx", "end_idx", "verdict"],
  });

  const sections = (res.hits.hits as Array<{ _source: { label?: string; what_happened?: string; start_idx?: number; end_idx?: number; verdict?: string } }>).map((h) => h._source);
  if (sections.length === 0) {
    console.log("No sections found for run:", runId);
    return;
  }

  console.log(`Sections for run: ${runId}\n`);
  sections.forEach((s, i) => {
    console.log(`--- Section ${i + 1} [events ${s.start_idx}–${s.end_idx}] ${s.verdict ?? ""} ---`);
    console.log(`Title: ${s.label ?? "(none)"}`);
    console.log(`Summary: ${(s.what_happened ?? "").slice(0, 400)}${(s.what_happened?.length ?? 0) > 400 ? "..." : ""}`);
    console.log("");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
