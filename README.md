This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment (.env.local)

| Variable | Purpose |
|----------|---------|
| `ELASTICSEARCH_URL` | Elasticsearch cluster for index/search (runs, events, sections). Example: `https://….es.us-west1.gcp.elastic.cloud:443` |
| `ELASTICSEARCH_API_KEY` | API key for Elasticsearch (and for Kibana Agent Builder API). |
| `KIBANA_URL` | Kibana instance **only** used for the Agent Builder REST API (converse, tools, agents). Not used for dashboards or inference. Example: `https://….kb.us-west1.gcp.elastic.cloud:443` |
| `ELASTIC_AGENT_CONNECTOR_ID` | Optional. Connector ID for the LLM used by the trajectory-analyzer agent (converse API). If unset, Kibana uses its **default** connector (often set in Stack Management → Connectors or Agent Builder / GenAI settings). Set this to pin the run analyzer to a specific model. |
| `JINA_API_KEY` | **Required** for run analysis. Section embeddings use [Jina AI’s API](https://jina.ai/embeddings) (`https://api.jina.ai/v1/embeddings`). If missing, analysis fails with a clear error. Get a key at [jina.ai](https://jina.ai/?sui=apikey). |

To list Kibana connectors (for `ELASTIC_AGENT_CONNECTOR_ID`): `npx tsx scripts/list-connectors.ts`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
