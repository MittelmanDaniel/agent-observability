import type { Event, Section } from "./types";
import { getElastic, SECTIONS_INDEX } from "./db";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

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
/*  Step 1: Condense ALL events into a single numbered prompt for the LLM     */
/* -------------------------------------------------------------------------- */

/** Max characters per individual event content in the condensed prompt. */
const PER_EVENT_CHAR_LIMIT = 1500;

/**
 * Condense an array of events into a single numbered text block.
 * Each event is formatted as:  [idx] type (actor): truncated_content
 */
function condenseEvents(events: Event[]): string {
  const lines: string[] = [];
  for (const event of events) {
    const text = getContentText(event);
    const truncated =
      text.length > PER_EVENT_CHAR_LIMIT
        ? text.slice(0, PER_EVENT_CHAR_LIMIT) +
          "\n... [truncated, " +
          text.length +
          " chars total]"
        : text;
    const actor = event.actor ? ` (${event.actor})` : "";
    lines.push(`[${event.idx}] ${event.type}${actor}: ${truncated}`);
  }
  return lines.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/*  Step 2: System prompt — LLM decides section boundaries + summaries        */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You are an AI agent trajectory analyzer. You receive the FULL execution trace of an AI coding agent — system prompts, AI thoughts, tool calls, and tool results — as a numbered list of events.

Your job: Identify logical SECTIONS in this trajectory. A section is a coherent phase of work — e.g. "exploring the codebase", "reproducing the bug", "implementing a fix", "running tests".

YOU decide:
- How many sections there are (could be 2, could be 15 — whatever fits the trajectory)
- Where each section starts and ends (using the event index numbers [idx])
- Every event must belong to exactly one section (no gaps, no overlaps)

Output format (strict JSON array):
[
  {
    "start_idx": <first event index in this section>,
    "end_idx": <last event index in this section>,
    "title": "<short title, 3-8 words>",
    "verdict": "<one of: good, warning, failure>",
    "summary": "<2-4 sentences describing what happened>"
  }
]

Rules:
- Sections must be contiguous: section N's end_idx + 1 should equal section N+1's start_idx (accounting for actual event indices).
- TITLE should describe the activity (e.g. "Reproducing the bug", "Fixing the transform check", "Exploring the codebase").
- VERDICT: "good" = things went well, "warning" = minor issue or suboptimal approach, "failure" = error occurred or agent got stuck.
- SUMMARY: Be specific about what commands ran and what happened. Reference file names and error types when relevant.
- Be concise. No markdown formatting in summaries.
- Output ONLY the JSON array. No other text before or after.`;

/* -------------------------------------------------------------------------- */
/*  Step 3: Call Claude via ES Inference API — single pass sectioning          */
/* -------------------------------------------------------------------------- */

interface LLMSection {
  start_idx: number;
  end_idx: number;
  title: string;
  verdict: string;
  summary: string;
}

/**
 * Send a condensed event list to Claude and get back an array of sections
 * with LLM-decided boundaries.
 */
async function sectionsFromLLM(condensed: string): Promise<LLMSection[]> {
  const client = getElastic();

  const result = await client.transport.request({
    method: "POST",
    path: "/_inference/completion/.anthropic-claude-4.5-sonnet-completion",
    body: {
      input: `${SYSTEM_PROMPT}\n\n--- EVENTS ---\n${condensed}\n\n--- END EVENTS ---\n\nIdentify the logical sections:`,
    },
  });

  const text = (result as { completion: Array<{ result: string }> })
    .completion[0].result;

  // Extract JSON array from the response (LLM might wrap in ```json ... ```)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("LLM did not return a JSON array. Raw response:", text);
    throw new Error("Failed to parse LLM section response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as LLMSection[];

  // Validate basic structure
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("LLM returned empty or invalid sections array");
  }

  return parsed;
}

/* -------------------------------------------------------------------------- */
/*  Step 4: Windowed fallback for very long runs                               */
/* -------------------------------------------------------------------------- */

/** Threshold: if condensed text exceeds this, split into windows. */
const MAX_CONDENSED_CHARS = 80_000;

/** Window size in events and overlap between windows. */
const WINDOW_SIZE = 100;
const WINDOW_OVERLAP = 10;

/**
 * For long runs, split events into overlapping windows, get sections for
 * each window, then merge them (dropping duplicate boundary sections from
 * overlapping regions).
 */
async function sectionsFromLLMWindowed(events: Event[]): Promise<LLMSection[]> {
  const allSections: LLMSection[] = [];
  let offset = 0;

  while (offset < events.length) {
    const windowEnd = Math.min(offset + WINDOW_SIZE, events.length);
    const windowEvents = events.slice(offset, windowEnd);
    const condensed = condenseEvents(windowEvents);

    const windowSections = await sectionsFromLLM(condensed);
    allSections.push(...windowSections);

    // Move forward by WINDOW_SIZE - WINDOW_OVERLAP
    offset += WINDOW_SIZE - WINDOW_OVERLAP;
  }

  // Deduplicate overlapping sections: keep the one that starts earlier,
  // and drop any section whose start_idx falls within a previous section's range.
  const merged: LLMSection[] = [];
  for (const section of allSections) {
    const overlaps = merged.some(
      (existing) =>
        section.start_idx >= existing.start_idx &&
        section.start_idx <= existing.end_idx
    );
    if (!overlaps) {
      merged.push(section);
    }
  }

  // Sort by start_idx
  merged.sort((a, b) => a.start_idx - b.start_idx);
  return merged;
}

/* -------------------------------------------------------------------------- */
/*  Step 5: Embed section with Jina via ES Inference API                      */
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
/*  Step 6: Full analysis pipeline — condense → LLM sections → embed → save  */
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

  if (events.length === 0) return [];

  // Condense all events
  const condensed = condenseEvents(events);

  // Decide: single pass or windowed fallback
  let llmSections: LLMSection[];
  if (condensed.length > MAX_CONDENSED_CHARS) {
    console.log(
      `Run ${runId}: ${events.length} events, ${condensed.length} chars — using windowed approach`
    );
    llmSections = await sectionsFromLLMWindowed(events);
  } else {
    console.log(
      `Run ${runId}: ${events.length} events, ${condensed.length} chars — single pass`
    );
    llmSections = await sectionsFromLLM(condensed);
  }

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
