/**
 * Create Elasticsearch index mappings.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts
 *
 * Requires ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY in .env.local or environment.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "@elastic/elasticsearch";

async function migrate() {
  const node = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;

  if (!node || !apiKey) {
    console.error(
      "ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY must be set in .env.local"
    );
    process.exit(1);
  }

  const client = new Client({ node, auth: { apiKey } });

  // Test connection
  const info = await client.info();
  console.log(`Connected to Elasticsearch: ${info.cluster_name}`);

  // --- runs index ---
  const runsExists = await client.indices.exists({ index: "runs" });
  const runsEmbeddingMapping = {
    type: "dense_vector" as const,
    dims: 768,
    index: true,
    similarity: "cosine" as const,
  };
  if (!runsExists) {
    console.log("Creating 'runs' index...");
    await client.indices.create({
      index: "runs",
      mappings: {
        properties: {
          id: { type: "keyword" },
          source: { type: "keyword" },
          task: { type: "keyword" },
          status: { type: "keyword" },
          started_at: { type: "date" },
          ended_at: { type: "date" },
          embedding: runsEmbeddingMapping,
        },
      },
    });
  } else {
    console.log("'runs' index already exists.");
    try {
      await client.indices.putMapping({
        index: "runs",
        properties: { embedding: runsEmbeddingMapping },
      });
      console.log("Updated 'runs' mapping with embedding field.");
    } catch (e) {
      if (String(e).includes("resource_already_exists") || String(e).includes("mapper")) {
        console.log("'runs' embedding field may already exist.");
      } else {
        throw e;
      }
    }
  }

  // --- events index ---
  const eventsExists = await client.indices.exists({ index: "events" });
  if (!eventsExists) {
    console.log("Creating 'events' index...");
    await client.indices.create({
      index: "events",
      mappings: {
        properties: {
          run_id: { type: "keyword" },
          idx: { type: "integer" },
          ts: { type: "date" },
          type: { type: "keyword" },
          actor: { type: "keyword" },
          content: { type: "text", index: true },
          metadata: { type: "object", enabled: false },
        },
      },
    });
  } else {
    console.log("'events' index already exists.");
  }

  // --- sections index (embedding must be 768 for Jina) ---
  const SECTIONS_EMBEDDING_DIMS = 768;
  const sectionsMapping = {
    properties: {
      id: { type: "keyword" },
      run_id: { type: "keyword" },
      start_idx: { type: "integer" },
      end_idx: { type: "integer" },
      label: { type: "text", fields: { keyword: { type: "keyword" } } },
      what_happened: { type: "text" },
      verdict: { type: "keyword" },
      root_cause_guess: { type: "text" },
      fix_suggestion: { type: "text" },
      confidence: { type: "float" },
      embedding: {
        type: "dense_vector" as const,
        dims: SECTIONS_EMBEDDING_DIMS,
        index: true,
        similarity: "cosine" as const,
      },
    },
  };

  const sectionsExists = await client.indices.exists({ index: "sections" });
  if (!sectionsExists) {
    console.log("Creating 'sections' index...");
    await client.indices.create({ index: "sections", mappings: sectionsMapping });
  } else {
    const current = await client.indices.getMapping({ index: "sections" });
    const embeddingDims = (current.sections?.mappings?.properties?.embedding as { dims?: number })?.dims;
    if (embeddingDims !== SECTIONS_EMBEDDING_DIMS) {
      console.log(`'sections' index has embedding dims=${embeddingDims}; we need ${SECTIONS_EMBEDDING_DIMS}. Deleting and recreating...`);
      await client.indices.delete({ index: "sections" });
      await client.indices.create({ index: "sections", mappings: sectionsMapping });
      console.log("Recreated 'sections' index with 768-dim embedding (Jina).");
    } else {
      console.log("'sections' index already exists with correct embedding dims.");
    }
  }

  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
