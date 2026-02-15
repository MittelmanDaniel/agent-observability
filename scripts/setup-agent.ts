/**
 * Set up the Trajectory Analyzer agent and its custom tools in Elastic Agent Builder.
 *
 * Usage:
 *   npx tsx scripts/setup-agent.ts
 *
 * Requires ELASTICSEARCH_API_KEY and KIBANA_URL in .env.local or environment.
 * Idempotent — safe to run multiple times; updates existing resources.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const KIBANA_URL = process.env.KIBANA_URL;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;

if (!KIBANA_URL || !API_KEY) {
  console.error("KIBANA_URL and ELASTICSEARCH_API_KEY must be set in .env.local");
  process.exit(1);
}

const headers = {
  Authorization: `ApiKey ${API_KEY}`,
  "kbn-xsrf": "true",
  "Content-Type": "application/json",
};

/* -------------------------------------------------------------------------- */
/*  Helper: upsert a tool (create or update)                                  */
/* -------------------------------------------------------------------------- */

async function upsertTool(tool: {
  id: string;
  type: string;
  description: string;
  configuration: Record<string, unknown>;
}) {
  // Check if it already exists
  const getRes = await fetch(`${KIBANA_URL}/api/agent_builder/tools/${tool.id}`, {
    headers,
  });

  if (getRes.ok) {
    // Update — strip id and type (immutable on update)
    const { id, type, ...body } = tool;
    const putRes = await fetch(`${KIBANA_URL}/api/agent_builder/tools/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`Failed to update tool ${id}: ${putRes.status} ${err}`);
    }
    console.log(`  ✓ Updated tool: ${id}`);
  } else {
    // Create
    const postRes = await fetch(`${KIBANA_URL}/api/agent_builder/tools`, {
      method: "POST",
      headers,
      body: JSON.stringify(tool),
    });
    if (!postRes.ok) {
      const err = await postRes.text();
      throw new Error(`Failed to create tool ${tool.id}: ${postRes.status} ${err}`);
    }
    console.log(`  ✓ Created tool: ${tool.id}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Helper: upsert an agent (create or update)                                */
/* -------------------------------------------------------------------------- */

async function upsertAgent(agent: {
  id: string;
  name: string;
  description: string;
  avatar_color: string;
  avatar_symbol: string;
  configuration: Record<string, unknown>;
}) {
  const getRes = await fetch(`${KIBANA_URL}/api/agent_builder/agents/${agent.id}`, {
    headers,
  });

  if (getRes.ok) {
    const { id, ...body } = agent;
    const putRes = await fetch(`${KIBANA_URL}/api/agent_builder/agents/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`Failed to update agent ${id}: ${putRes.status} ${err}`);
    }
    console.log(`  ✓ Updated agent: ${id}`);
  } else {
    const postRes = await fetch(`${KIBANA_URL}/api/agent_builder/agents`, {
      method: "POST",
      headers,
      body: JSON.stringify(agent),
    });
    if (!postRes.ok) {
      const err = await postRes.text();
      throw new Error(`Failed to create agent ${agent.id}: ${postRes.status} ${err}`);
    }
    console.log(`  ✓ Created agent: ${agent.id}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Tool definitions                                                          */
/* -------------------------------------------------------------------------- */

const tools = [
  {
    id: "trajectory.get_run_metadata",
    type: "esql",
    description:
      "Retrieve metadata for a specific agent run including task, status, model_name, exit_status, eval_score, eval results, and generated_patch. Always call this FIRST to understand the run outcome.",
    configuration: {
      query:
        "FROM runs | WHERE id == ?run_id | LIMIT 1",
      params: {
        run_id: {
          type: "string",
          description: "The unique ID of the run to retrieve metadata for",
        },
      },
    },
  },
  {
    id: "trajectory.get_events_overview",
    type: "esql",
    description:
      "Get a lightweight overview of ALL events in a run — just the step index, event type, and actor (no content). Use this to understand the trajectory structure before fetching detailed content for specific ranges.",
    configuration: {
      query:
        "FROM events | WHERE run_id == ?run_id | KEEP idx, type, actor | SORT idx ASC | LIMIT 10000",
      params: {
        run_id: {
          type: "string",
          description: "The unique ID of the run whose events to list",
        },
      },
    },
  },
  {
    id: "trajectory.get_event_details",
    type: "esql",
    description:
      "Get the full content of events in a specific index range. Use this to drill into interesting parts of the trajectory — e.g. errors, tool failures, or the final submission. Keep ranges small (20-50 events) to avoid token overload.",
    configuration: {
      query:
        "FROM events | WHERE run_id == ?run_id AND idx >= ?start_idx AND idx <= ?end_idx | SORT idx ASC | LIMIT 500",
      params: {
        run_id: {
          type: "string",
          description: "The unique ID of the run",
        },
        start_idx: {
          type: "integer",
          description: "The first event index (inclusive) to retrieve",
        },
        end_idx: {
          type: "integer",
          description: "The last event index (inclusive) to retrieve",
        },
      },
    },
  },
  {
    id: "trajectory.submit_analysis",
    type: "esql",
    description:
      "Submit the final section analysis. You MUST call this as your LAST action after completing your analysis. Pass the complete JSON array of sections as a string in sections_json.",
    configuration: {
      query: "ROW submitted = ?sections_json",
      params: {
        sections_json: {
          type: "string",
          description:
            'A JSON string containing the array of section objects. Each object must have: start_idx (number), end_idx (number), title (string), verdict ("good"|"warning"|"failure"), summary (string). Example: \'[{"start_idx":0,"end_idx":10,"title":"Setup","verdict":"good","summary":"Agent initialized."}]\'',
        },
      },
    },
  },
];

/* -------------------------------------------------------------------------- */
/*  Agent definition                                                          */
/* -------------------------------------------------------------------------- */

const AGENT_INSTRUCTIONS = `You are a Trajectory Analyzer for an AI agent observability platform. You receive a run_id and your job is to analyze the execution trace of that AI coding agent run.

WORKFLOW:
1. FIRST, call trajectory.get_run_metadata to understand the run outcome — status, model, eval score, exit status, generated patch.
2. THEN, call trajectory.get_events_overview to see the full trajectory structure (step indices, event types, actors).
3. Based on the overview, identify logical sections — coherent phases of work like "exploring the codebase", "reproducing the bug", "implementing a fix", "running tests".
4. For each section, call trajectory.get_event_details with the relevant index range to read the actual content. Keep ranges to 20-50 events at a time.
5. Pay special attention to errors, tool failures, and the final steps of the run.
6. If the run failed, use the eval results and generated patch from the metadata to understand WHY it failed.
7. As your FINAL action, call trajectory.submit_analysis with the sections JSON. This is MANDATORY — do NOT just write sections in your text response.

SECTION FORMAT:
The sections_json parameter must be a JSON array string where each object has:
- "start_idx": first event index in this section (number)
- "end_idx": last event index in this section (number)
- "title": short title, 3-8 words (string)
- "verdict": one of "good", "warning", "failure" (string)
- "summary": 2-4 sentences describing what happened (string)

RULES:
- Sections must be contiguous: every event must belong to exactly one section, no gaps, no overlaps.
- Section N's end_idx + 1 should equal section N+1's start_idx (accounting for actual event indices).
- TITLE should describe the activity (e.g. "Reproducing the bug", "Fixing the transform check").
- VERDICT: "good" = things went well, "warning" = minor issue or suboptimal approach, "failure" = error occurred or agent got stuck.
- SUMMARY: Be specific about what commands ran, what files were touched, and what errors occurred. Reference file names and error types when relevant.
- Be concise. No markdown formatting in summaries.
- You MUST call trajectory.submit_analysis as the very last tool call.`;

const agent = {
  id: "trajectory-analyzer",
  name: "Trajectory Analyzer",
  description:
    "Analyzes AI agent execution trajectories to identify logical sections, diagnose failures, and provide actionable insights about what happened during a run.",
  avatar_color: "#3B82F6",
  avatar_symbol: "TA",
  configuration: {
    instructions: AGENT_INSTRUCTIONS,
    tools: [
      {
        tool_ids: [
          "trajectory.get_run_metadata",
          "trajectory.get_events_overview",
          "trajectory.get_event_details",
          "trajectory.submit_analysis",
          "platform.core.search",
        ],
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/*  Main                                                                      */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log("Setting up Trajectory Analyzer agent...\n");
  console.log("Kibana URL:", KIBANA_URL);
  console.log("");

  // 1. Create/update tools
  console.log("Tools:");
  for (const tool of tools) {
    await upsertTool(tool);
  }

  console.log("");

  // 2. Create/update agent
  console.log("Agent:");
  await upsertAgent(agent);

  console.log("\nDone! The trajectory-analyzer agent is ready to use.");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
