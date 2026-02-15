import { Client } from "@elastic/elasticsearch";

let client: Client | null = null;

export function getElastic(): Client {
  if (client) return client;

  const node = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;

  if (!node || !apiKey) {
    throw new Error(
      "ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY must be set. " +
        "Create a serverless Elasticsearch project at cloud.elastic.co and add them to .env.local"
    );
  }

  client = new Client({
    node,
    auth: { apiKey },
  });

  return client;
}

// Index names
export const RUNS_INDEX = "runs";
export const EVENTS_INDEX = "events";
export const SECTIONS_INDEX = "sections";
