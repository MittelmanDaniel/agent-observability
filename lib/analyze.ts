import type { Section } from "./types";
import { getElastic, SECTIONS_INDEX } from "./db";

/* -------------------------------------------------------------------------- */
/*  Agent Builder configuration                                               */
/* -------------------------------------------------------------------------- */

const KIBANA_URL = process.env.KIBANA_URL;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;

const AGENT_ID = "trajectory-analyzer";

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
/*  Step 2: Embed section with Jina via ES Inference API                      */
/* -------------------------------------------------------------------------- */

async function embedSection(text: string): Promise<number[]> {
  const client = getElastic();
  const result = await client.transport.request({
    method: "POST",
    path: "/_inference/text_embedding/.jina-embeddings-v3",
    body: {
      input: [text],
    },
  });

  return (result as { text_embedding: Array<{ embedding: number[] }> })
    .text_embedding[0].embedding;
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

  return { sections, agentSteps: steps, usage };
}

/* -------------------------------------------------------------------------- */
/*  Bonus: Find similar sections using Jina embeddings + k-NN                 */
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
