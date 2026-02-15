/**
 * Compute the distribution of pairwise cosine similarities between run-summary
 * embeddings so you can choose a sensible clustering threshold (e.g. for
 * getRunClusters). 0.85 was an arbitrary default — run this to see your data.
 *
 * Usage:
 *   npx tsx scripts/similarity-distribution.ts [task] [source]
 *
 * Example:
 *   npx tsx scripts/similarity-distribution.ts networkx__networkx-7024 custom
 *
 * Requires ELASTICSEARCH_* in .env.local.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getElastic, RUNS_INDEX } from "../lib/db";

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo]! : sorted[lo]! + (i - lo) * (sorted[hi]! - sorted[lo]!);
}

async function main() {
  const task = process.argv[2];
  const source = process.argv[3];

  const client = getElastic();
  const must: Record<string, unknown>[] = [{ exists: { field: "embedding" } }];
  if (task) must.push({ term: { task } });
  if (source) must.push({ term: { source } });

  const result = await client.search({
    index: RUNS_INDEX,
    size: 5000,
    query: { bool: { must } },
    _source: ["id", "embedding"],
  });

  const hits = result.hits.hits as Array<{
    _id: string;
    _source: { id?: string; embedding?: number[] };
  }>;
  const embeddingByRunId = new Map<string, number[]>();
  for (const h of hits) {
    if (h._source.embedding) embeddingByRunId.set(h._id, h._source.embedding);
  }
  const ids = [...embeddingByRunId.keys()];

  if (ids.length < 2) {
    console.log(`Only ${ids.length} run(s) with embeddings. Need at least 2 to compute pairwise similarities.`);
    return;
  }

  const similarities: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const a = embeddingByRunId.get(ids[i]!);
    if (!a) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = embeddingByRunId.get(ids[j]!);
      if (!b) continue;
      similarities.push(cosineSimilarity(a, b));
    }
  }

  similarities.sort((x, y) => x - y);
  const min = similarities[0] ?? 0;
  const max = similarities[similarities.length - 1] ?? 0;
  const sum = similarities.reduce((s, x) => s + x, 0);
  const mean = sum / similarities.length;

  console.log(`Pairwise cosine similarities (run-summary embeddings)`);
  console.log(`  Task: ${task ?? "(all)"}  Source: ${source ?? "(all)"}`);
  console.log(`  Runs with embedding: ${ids.length}  Pairs: ${similarities.length}`);
  console.log("");
  console.log(`  min    ${min.toFixed(4)}`);
  console.log(`  max    ${max.toFixed(4)}`);
  console.log(`  mean   ${mean.toFixed(4)}`);
  console.log(`  p50    ${percentile(similarities, 50).toFixed(4)}`);
  console.log(`  p75    ${percentile(similarities, 75).toFixed(4)}`);
  console.log(`  p90    ${percentile(similarities, 90).toFixed(4)}`);
  console.log(`  p95    ${percentile(similarities, 95).toFixed(4)}`);
  console.log("");
  console.log("  Suggested: try threshold = p75 or p90 for clustering (GET /api/clusters?threshold=...).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
