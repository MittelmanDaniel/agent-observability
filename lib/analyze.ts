import type { Event, Section } from "./types";
import { getElastic, SECTIONS_INDEX } from "./db";

/* -------------------------------------------------------------------------- */
/*  Step 1: Heuristic pre-chunking — split events at natural boundaries       */
/* -------------------------------------------------------------------------- */

interface Chunk {
  startIdx: number;
  endIdx: number;
  events: Event[];
}

/**
 * Split events into rough chunks at natural section boundaries:
 * - After errors/tracebacks in tool results
 * - When the agent tries a different approach (command type changes)
 * - After "submit" or cleanup commands
 * - Cap chunk size at ~15 events to keep LLM calls manageable
 */
export function chunkEvents(events: Event[]): Chunk[] {
  if (events.length === 0) return [];

  const chunks: Chunk[] = [];
  let currentChunk: Event[] = [];
  let chunkStart = events[0].idx;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    currentChunk.push(event);

    const isLast = i === events.length - 1;
    let shouldBreak = false;

    if (!isLast) {
      // Break after error tracebacks in tool results
      const contentLower = getContentText(event).toLowerCase();
      if (
        event.type === "user" &&
        (contentLower.includes("traceback") ||
          contentLower.includes("error:") ||
          contentLower.includes("exception:"))
      ) {
        shouldBreak = true;
      }

      // Break after submit/cleanup commands in AI messages
      if (event.type === "ai") {
        const text = getContentText(event);
        if (/\b(submit|rm |exit)\b/.test(text)) {
          shouldBreak = true;
        }
      }

      // Break if chunk is getting large (cap at ~12 events = ~6 AI+result pairs)
      if (currentChunk.length >= 12) {
        // Try to break at an AI message boundary (after a tool result)
        if (event.type === "user" && i + 1 < events.length && events[i + 1].type === "ai") {
          shouldBreak = true;
        }
        // Force break at 16
        if (currentChunk.length >= 16) {
          shouldBreak = true;
        }
      }
    }

    if (shouldBreak || isLast) {
      chunks.push({
        startIdx: chunkStart,
        endIdx: event.idx,
        events: [...currentChunk],
      });
      currentChunk = [];
      if (!isLast) {
        chunkStart = events[i + 1].idx;
      }
    }
  }

  return chunks;
}

/** Extract the readable text from an event's content (may be JSON wrapper). */
function getContentText(event: Event): string {
  try {
    const obj = JSON.parse(event.content) as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text) return obj.text;
    if (typeof obj.system_prompt === "string" && obj.system_prompt)
      return obj.system_prompt;
  } catch {
    // not JSON
  }
  return event.content;
}

/* -------------------------------------------------------------------------- */
/*  Step 2: Condense a chunk into a compact prompt for Claude                 */
/* -------------------------------------------------------------------------- */

function condenseChunk(chunk: Chunk): string {
  const lines: string[] = [];
  for (const event of chunk.events) {
    const text = getContentText(event);
    // Truncate very long content (file listings, code dumps) for the LLM prompt
    const truncated =
      text.length > 2000
        ? text.slice(0, 1500) + "\n... [truncated, " + text.length + " chars total]"
        : text;
    lines.push(`[${event.idx}] ${event.type}: ${truncated}`);
  }
  return lines.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/*  Step 3: Call Claude via ES Inference API to summarize each chunk           */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You are an AI agent trajectory analyzer. You receive a chunk of events from an AI coding agent's execution trace (system prompts, AI thoughts, tool calls, tool results).

Your job: Write a SHORT narrative summary of what happened in this chunk. Focus on:
- What the agent was trying to do
- What commands/tools it used
- What happened (success, error, unexpected result)
- Any notable decisions or mistakes

Output format (strict):
TITLE: <short title, 3-8 words>
VERDICT: <one of: good, warning, failure>
SUMMARY: <2-4 sentences describing what happened>

Rules:
- TITLE should describe the activity (e.g. "Reproducing the bug", "Fixing transform_in check", "Exploring the codebase")
- VERDICT: "good" = things went well, "warning" = minor issue or suboptimal approach, "failure" = error occurred or agent got stuck
- SUMMARY: Be specific about what commands ran and what happened. Reference file names and error types when relevant.
- Be concise. No markdown formatting.`;

async function summarizeChunk(
  chunk: Chunk
): Promise<{ title: string; verdict: string; summary: string }> {
  const client = getElastic();
  const condensed = condenseChunk(chunk);

  const result = await client.transport.request({
    method: "POST",
    path: "/_inference/completion/.anthropic-claude-4.5-sonnet-completion",
    body: {
      input: `${SYSTEM_PROMPT}\n\n--- EVENTS ---\n${condensed}\n\n--- END EVENTS ---\nAnalyze this chunk:`,
    },
  });

  const text = (result as { completion: Array<{ result: string }> }).completion[0]
    .result;

  // Parse the structured response
  const titleMatch = text.match(/TITLE:\s*(.+)/i);
  const verdictMatch = text.match(/VERDICT:\s*(\w+)/i);
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]+)/i);

  return {
    title: titleMatch?.[1]?.trim() ?? "Unknown Section",
    verdict: verdictMatch?.[1]?.trim().toLowerCase() ?? "good",
    summary: summaryMatch?.[1]?.trim() ?? text.trim(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Step 4: Embed section with Jina via ES Inference API                      */
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
/*  Step 5: Full analysis pipeline — chunk → summarize → embed → save         */
/* -------------------------------------------------------------------------- */

export async function analyzeRun(
  runId: string,
  events: Event[]
): Promise<Section[]> {
  const client = getElastic();

  // Delete existing sections for this run
  await client.deleteByQuery({
    index: SECTIONS_INDEX,
    query: { term: { run_id: runId } },
    refresh: true,
  });

  // Step 1: Chunk
  const chunks = chunkEvents(events);
  if (chunks.length === 0) return [];

  const sections: Section[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Step 2: Summarize with Claude via ES
    const { title, verdict, summary } = await summarizeChunk(chunk);

    // Step 3: Embed with Jina via ES
    const embeddingText = `${title}: ${summary}`;
    const embedding = await embedSection(embeddingText);

    const section: Section & { embedding?: number[] } = {
      id: `${runId}-section-${i}`,
      run_id: runId,
      start_idx: chunk.startIdx,
      end_idx: chunk.endIdx,
      label: title,
      what_happened: summary,
      verdict: verdict as "good" | "warning" | "failure",
      embedding,
    };

    // Step 4: Save to Elasticsearch
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

  return sections;
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
