import type { Run, Section } from "./types";
import { getElastic, RUNS_INDEX, SECTIONS_INDEX } from "./db";

/* -------------------------------------------------------------------------- */
/*  Agent Builder (Kibana) — converse API only                                 */
/*  KIBANA_URL = Kibana instance (dashboard app). We use it only for the      */
/*  Agent Builder REST API: /api/agent_builder/converse, not for dashboards.  */
/* -------------------------------------------------------------------------- */

const KIBANA_URL = process.env.KIBANA_URL;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;
/** Optional: connector ID for the LLM (see Kibana → Agent Builder / GenAI settings). If unset, Kibana uses its default. */
const AGENT_CONNECTOR_ID = process.env.ELASTIC_AGENT_CONNECTOR_ID;

const AGENT_ID = "trajectory-analyzer";

/* -------------------------------------------------------------------------- */
/*  Embeddings — Jina AI API only (https://api.jina.ai/v1/embeddings)         */
/*  JINA_API_KEY is required. No fallback — if missing we throw.              */
/*  Sections index expects 768-dim vectors (see scripts/migrate.ts).          */
/* -------------------------------------------------------------------------- */

const JINA_EMBEDDINGS_URL = "https://api.jina.ai/v1/embeddings";
const EMBEDDING_DIMS = 768;

/* -------------------------------------------------------------------------- */
/*  Step 1: Call Trajectory Analyzer agent via Agent Builder converse API      */
/* -------------------------------------------------------------------------- */

interface LLMSection {
  start_idx: number;
  end_idx: number;
  title: string;
  verdict: string;
  summary: string;
}

interface ConverseResponse {
  conversation_id: string;
  status: string;
  steps: Array<{
    type: string;
    reasoning?: string;
    tool_id?: string;
    params?: Record<string, unknown>;
  }>;
  response: {
    message: string;
  };
  model_usage?: {
    llm_calls: number;
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Call the Elastic Agent Builder trajectory-analyzer agent to analyze a run.
 * The agent autonomously fetches run metadata, browses events, and returns
 * structured JSON sections.
 */
async function sectionsFromAgent(runId: string): Promise<{
  sections: LLMSection[];
  steps: ConverseResponse["steps"];
  usage: ConverseResponse["model_usage"] | undefined;
}> {
  if (!KIBANA_URL || !API_KEY) {
    throw new Error(
      "KIBANA_URL and ELASTICSEARCH_API_KEY must be set for Agent Builder integration"
    );
  }

  const res = await fetch(`${KIBANA_URL}/api/agent_builder/converse`, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${API_KEY}`,
      "kbn-xsrf": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: `Analyze run_id: ${runId}`,
      agent_id: AGENT_ID,
      ...(AGENT_CONNECTOR_ID && { connector_id: AGENT_CONNECTOR_ID }),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Agent Builder converse failed: ${res.status} ${errText}`
    );
  }

  const data = (await res.json()) as ConverseResponse;

  if (data.status !== "completed") {
    throw new Error(`Agent did not complete. Status: ${data.status}`);
  }

  // Extract sections from the trajectory.submit_analysis tool call params.
  // The agent calls this tool as its final action with sections_json param.
  const submitStep = [...data.steps]
    .reverse()
    .find(
      (s) =>
        s.type === "tool_call" && s.tool_id === "trajectory.submit_analysis"
    );

  let jsonText: string | null = null;

  if (submitStep?.params?.sections_json) {
    jsonText = submitStep.params.sections_json as string;
  }

  // Fallback: parse from response message if agent didn't call the tool
  if (!jsonText) {
    console.warn(
      "Agent did not call trajectory.submit_analysis — falling back to response parsing"
    );
    const message = data.response.message;

    // Try ```json code fence
    const fenceMatch = message.match(/```json\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    }

    // Last resort: scan backwards from the last ']'
    if (!jsonText) {
      const lastBracket = message.lastIndexOf("]");
      if (lastBracket !== -1) {
        let depth = 0;
        for (let i = lastBracket; i >= 0; i--) {
          if (message[i] === "]") depth++;
          if (message[i] === "[") depth--;
          if (depth === 0) {
            jsonText = message.slice(i, lastBracket + 1);
            break;
          }
        }
      }
    }
  }

  if (!jsonText) {
    console.error(
      "Agent did not return sections. Steps:",
      JSON.stringify(data.steps.map((s) => ({ type: s.type, tool_id: s.tool_id })))
    );
    throw new Error("Failed to extract sections from agent response");
  }

  const parsed = JSON.parse(jsonText) as LLMSection[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Agent returned empty or invalid sections array");
  }

  return {
    sections: parsed,
    steps: data.steps,
    usage: data.model_usage,
  };
}

/* -------------------------------------------------------------------------- */
/*  Step 2: Embed section via Jina AI API (required)                           */
/* -------------------------------------------------------------------------- */

function getJinaApiKey(): string {
  const key = process.env.JINA_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "JINA_API_KEY is not set. Add it to .env.local to enable section embeddings. Get a key at https://jina.ai/"
    );
  }
  return key;
}

async function embedSection(text: string): Promise<number[]> {
  const apiKey = getJinaApiKey();
  const res = await fetch(JINA_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: "jina-embeddings-v3",
      input: [text],
      dimensions: EMBEDDING_DIMS,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jina embeddings API failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

/* -------------------------------------------------------------------------- */
/*  Step 3: Full analysis pipeline — agent → embed → save                     */
/* -------------------------------------------------------------------------- */

export async function analyzeRun(
  runId: string
): Promise<{
  sections: Section[];
  agentSteps: ConverseResponse["steps"];
  usage: ConverseResponse["model_usage"] | undefined;
}> {
  const client = getElastic();

  // Delete existing sections for this run
  await client.deleteByQuery({
    index: SECTIONS_INDEX,
    query: { term: { run_id: runId } },
    refresh: true,
  });

  // Call the Agent Builder trajectory-analyzer agent
  console.log(`Run ${runId}: calling trajectory-analyzer agent...`);
  const { sections: llmSections, steps, usage } =
    await sectionsFromAgent(runId);
  console.log(
    `Run ${runId}: agent returned ${llmSections.length} sections (${usage?.llm_calls ?? "?"} LLM calls, ${usage?.input_tokens ?? "?"} input tokens)`
  );

  // Embed each section and save to Elasticsearch
  const sections: Section[] = [];

  for (let i = 0; i < llmSections.length; i++) {
    const llmSection = llmSections[i];

    // Embed with Jina via ES
    const embeddingText = `${llmSection.title}: ${llmSection.summary}`;
    const embedding = await embedSection(embeddingText);

    const section: Section & { embedding?: number[] } = {
      id: `${runId}-section-${i}`,
      run_id: runId,
      start_idx: llmSection.start_idx,
      end_idx: llmSection.end_idx,
      label: llmSection.title,
      what_happened: llmSection.summary,
      verdict: llmSection.verdict as "good" | "warning" | "failure",
      embedding,
    };

    // Save to Elasticsearch
    await client.index({
      index: SECTIONS_INDEX,
      id: section.id,
      document: section,
    });

    // Remove embedding from the returned object (not needed in UI)
    const { embedding: _, ...sectionWithoutEmbedding } = section;
    sections.push(sectionWithoutEmbedding);
  }

  await client.indices.refresh({ index: SECTIONS_INDEX });

  // Embed run summary (section titles + summaries) for similar-runs clustering
  const runSummaryText = llmSections
    .map((s, i) => `${i + 1}) ${s.title}: ${s.summary}`)
    .join(". ");
  const runEmbedding = await embedSection(runSummaryText);
  await client.update({
    index: RUNS_INDEX,
    id: runId,
    doc: { embedding: runEmbedding },
  });

  return { sections, agentSteps: steps, usage };
}

/* -------------------------------------------------------------------------- */
/*  Find similar runs using Jina run-summary embeddings + k-NN                */
/* -------------------------------------------------------------------------- */

export async function findSimilarRuns(
  runId: string,
  limit = 8
): Promise<Array<Run & { _score: number }>> {
  const client = getElastic();

  const runDoc = await client.get({ index: RUNS_INDEX, id: runId });
  const embedding = (runDoc._source as { embedding?: number[] })?.embedding;
  if (!embedding) return [];

  const result = await client.search({
    index: RUNS_INDEX,
    size: limit + 1,
    knn: {
      field: "embedding",
      query_vector: embedding,
      k: limit + 1,
      num_candidates: 100,
    },
    _source: [
      "id",
      "source",
      "task",
      "status",
      "started_at",
      "ended_at",
      "model_name",
      "exit_status",
    ],
  });

  return result.hits.hits
    .filter((h) => h._id !== runId)
    .slice(0, limit)
    .map((h) => ({
      ...(h._source as Run),
      _score: h._score ?? 0,
    }));
}

/* -------------------------------------------------------------------------- */
/*  Cluster all runs into groups by embedding similarity (connected comps)  */
/* -------------------------------------------------------------------------- */

export interface RunCluster {
  groupId: number;
  runIds: string[];
  runs: Run[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function connectedComponents(
  runIds: string[],
  embeddingByRunId: Map<string, number[]>,
  threshold: number
): number[] {
  const n = runIds.length;
  const idToIdx = new Map(runIds.map((id, i) => [id, i]));
  const parent = runIds.map((_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(x: number, y: number) {
    parent[find(x)] = find(y);
  }

  for (let i = 0; i < n; i++) {
    const a = embeddingByRunId.get(runIds[i]);
    if (!a) continue;
    for (let j = i + 1; j < n; j++) {
      const b = embeddingByRunId.get(runIds[j]);
      if (!b) continue;
      if (cosineSimilarity(a, b) >= threshold) union(i, j);
    }
  }

  const rootToGroupId = new Map<number, number>();
  let nextId = 0;
  return runIds.map((_, i) => {
    const r = find(i);
    if (!rootToGroupId.has(r)) rootToGroupId.set(r, nextId++);
    return rootToGroupId.get(r)!;
  });
}

export async function getRunClusters(options: {
  task?: string;
  source?: string;
  similarityThreshold?: number;
}): Promise<RunCluster[]> {
  const { task, source, similarityThreshold = 0.85 } = options;
  const client = getElastic();

  const must: Record<string, unknown>[] = [{ exists: { field: "embedding" } }];
  if (task) must.push({ term: { task } });
  if (source) must.push({ term: { source } });

  const result = await client.search({
    index: RUNS_INDEX,
    size: 5000,
    query: { bool: { must } },
    _source: ["id", "embedding", "source", "task", "status", "started_at", "ended_at", "model_name", "exit_status"],
  });

  const hits = result.hits.hits as Array<{
    _id: string;
    _source: Run & { embedding?: number[] };
  }>;
  const runIds = hits.map((h) => h._id);
  if (runIds.length === 0) return [];

  const embeddingByRunId = new Map<string, number[]>();
  const runsByRunId = new Map<string, Run>();
  for (const h of hits) {
    const src = h._source;
    if (src.embedding) {
      embeddingByRunId.set(h._id, src.embedding);
      const { embedding: _, ...run } = src;
      runsByRunId.set(h._id, run);
    }
  }

  const runIdsWithEmbedding = runIds.filter((id) => embeddingByRunId.has(id));
  if (runIdsWithEmbedding.length === 0) return [];

  const groupIds = connectedComponents(
    runIdsWithEmbedding,
    embeddingByRunId,
    similarityThreshold
  );

  const groupIdToRuns = new Map<number, string[]>();
  runIdsWithEmbedding.forEach((id, i) => {
    const g = groupIds[i];
    if (!groupIdToRuns.has(g)) groupIdToRuns.set(g, []);
    groupIdToRuns.get(g)!.push(id);
  });

  const clusters: RunCluster[] = [];
  let groupId = 0;
  for (const [, ids] of groupIdToRuns) {
    clusters.push({
      groupId: ++groupId,
      runIds: ids,
      runs: ids.map((id) => runsByRunId.get(id)!).filter(Boolean),
    });
  }
  clusters.sort((a, b) => b.runs.length - a.runs.length);
  return clusters;
}

/* -------------------------------------------------------------------------- */
/*  Find similar sections using Jina embeddings + k-NN                        */
/* -------------------------------------------------------------------------- */

export async function findSimilarSections(
  sectionId: string,
  limit = 5
): Promise<Array<Section & { _score: number }>> {
  const client = getElastic();

  // Get the source section's embedding
  const source = await client.get({
    index: SECTIONS_INDEX,
    id: sectionId,
  });
  const embedding = (source._source as { embedding?: number[] })?.embedding;
  if (!embedding) return [];

  // k-NN search
  const result = await client.search({
    index: SECTIONS_INDEX,
    size: limit + 1, // +1 to exclude self
    knn: {
      field: "embedding",
      query_vector: embedding,
      k: limit + 1,
      num_candidates: 100,
    },
    _source: [
      "id",
      "run_id",
      "start_idx",
      "end_idx",
      "label",
      "what_happened",
      "verdict",
    ],
  });

  return result.hits.hits
    .filter((h) => h._id !== sectionId)
    .slice(0, limit)
    .map((h) => ({
      ...(h._source as Section),
      _score: h._score ?? 0,
    }));
}
