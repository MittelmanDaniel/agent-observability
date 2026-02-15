/**
 * List Kibana connectors (e.g. for picking ELASTIC_AGENT_CONNECTOR_ID).
 *
 * Usage:
 *   npx tsx scripts/list-connectors.ts
 *
 * Requires KIBANA_URL and ELASTICSEARCH_API_KEY in .env.local.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const KIBANA_URL = process.env.KIBANA_URL;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;

if (!KIBANA_URL || !API_KEY) {
  console.error("KIBANA_URL and ELASTICSEARCH_API_KEY must be set in .env.local");
  process.exit(1);
}

interface Connector {
  id: string;
  name: string;
  connector_type_id?: string;
  is_preconfigured?: boolean;
  referenced_by_count?: number;
  [k: string]: unknown;
}

async function main() {
  const res = await fetch(`${KIBANA_URL}/api/actions/connectors`, {
    headers: {
      Authorization: `ApiKey ${API_KEY}`,
      "kbn-xsrf": "true",
    },
  });
  if (!res.ok) {
    console.error(`Failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const list = (await res.json()) as Connector[];
  console.log("Connectors (id, name, type):\n");
  console.log("(The default for Agent Builder is not in this API — it's set in Kibana: search \"GenAI Settings\" → Default AI Connector.)\n");
  for (const c of list) {
    console.log(`  ${c.id}`);
    console.log(`    name: ${c.name}`);
    if (c.connector_type_id) console.log(`    type: ${c.connector_type_id}`);
    if (c.referenced_by_count != null) console.log(`    referenced_by_count: ${c.referenced_by_count}`);
    console.log("");
  }
  if (list.length === 0) {
    console.log("  (none)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
