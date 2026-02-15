# Implementation Plan: Agent Observability

Phased build so you can demo early and add sponsor integrations incrementally.

---

## Pragmatic order (data-first)

If you ignore the phased plan and want the **best** path:

1. **Get real trajectories** — Use Hugging Face so you’re building against real agent runs, not toy data.
2. **Normalize and load** — Run `scripts/load_trajectories.py` to pull **Nebius SWE-agent-trajectories** (no gating), normalize to Run + Events, and either write `data/sample_runs.json` or POST to your API once it exists.
3. **Build the app against that data** — Ingest API + viewer first, then sectioning/diagnosis. Tune section boundaries and prompts on real runs.

**Why Nebius first:** 80k trajectories, no Hugging Face gating, clear structure (`trajectory` = JSON list of steps). Use a small limit (e.g. 20–50) for dev. **TRAIL** (PatronusAI) is better for *evaluating* your section labels (human annotations) but is gated — add it later if you want gold labels.

**Script usage:** See `scripts/load_trajectories.py` docstring. From repo root (use **uv**, not python3/pip):
```bash
uv venv && source .venv/bin/activate
uv pip install -r scripts/requirements.txt
uv run python scripts/load_trajectories.py --dataset nebius --limit 20 --out data/sample_runs.json
```
Then either add an “Upload JSON” flow in the dashboard that reads that file, or run the script with `--post http://localhost:3000` after your ingest API is up.

---

## Stack (recap)

| Layer | Choice | Why |
|-------|--------|-----|
| **App & deploy** | Next.js App Router on Vercel | Sponsor (Vercel) |
| **Primary DB** | Vercel Postgres | Sponsor-aligned, one-click with Vercel |
| **Analysis** | OpenAI | Sectioning + diagnosis (verdict, root_cause, fix) |
| **Agent source** | Claude Agent SDK (wrapper) | Sponsor (Anthropic); only agent source for MVP |
| **Search / similarity** | Elasticsearch (Elastic Cloud) + Jina Embeddings | Sponsor (Elastic); Jina = Elastic, good for section embeddings |
| **Rerank (optional)** | Jina Reranker | Better “similar sections” ordering |
| **Background jobs (optional)** | Modal | Sponsor; for async diagnosis on long runs |

---

## Phase 1: Ingest + viewer (no DB yet)

**Goal:** POST a run with events, see it in the UI. No Postgres yet — in-memory store.

1. **Types** — `lib/types.ts`  
   - `Run`, `Event`, `Section` (Section optional for now).

2. **Store** — `lib/store.ts`  
   - In-memory Map/array for runs and events.  
   - `createRun()`, `addEvents()`, `getRun()`, `listRuns()`.

3. **API**  
   - `POST /api/runs` — body: `{ task, source?, events[] }`. Create run, append events, return `runId`.  
   - `GET /api/runs` — list runs (id, task, source, status, started_at).  
   - `GET /api/runs/[id]` — run + events (ordered by `idx`).

4. **UI**  
   - **Home** (`app/page.tsx`) — list runs, link to `/runs/[id]`.  
   - **Run detail** (`app/runs/[id]/page.tsx`) — metadata + **timeline**: list of events, expandable (type, actor, content, ts).

5. **Test** — curl or a small script to POST one run with a few events; confirm it appears and timeline renders.

**Done when:** You can post a run and view its raw timeline in the browser.

---

## Phase 2: Database (Vercel Postgres)

**Goal:** Persist runs and events so they survive restarts and work on Vercel.

1. **Vercel Postgres**  
   - Add Vercel Postgres to the project (dashboard or `vercel link`).  
   - Use `@vercel/postgres` in the app.

2. **Schema**  
   - Tables: `runs` (id, source, task, status, started_at, ended_at), `events` (id, run_id, idx, ts, type, actor, content, metadata jsonb).  
   - Optional: `sections` table (can add in Phase 3).

3. **Migrate store**  
   - Replace in-memory store with Postgres in the same API routes.  
   - Keep the same API shape (POST/GET /api/runs, GET /api/runs/[id]).

4. **Env**  
   - `POSTGRES_URL` (or whatever Vercel injects). Use in server code only.

**Done when:** Runs and events are stored in Postgres; list and detail pages still work.

---

## Phase 3: Section generation (OpenAI)

**Goal:** For each run, compute sections with label, verdict, root_cause, fix; show section cards on the timeline.

1. **Sections table** (if not in Phase 2)  
   - `sections`: id, run_id, start_idx, end_idx, label, what_happened, verdict, root_cause_guess, fix_suggestion, confidence.

2. **Boundary detection**  
   - `lib/sections/boundaries.ts` — heuristics: boundaries at tool errors, retries (same tool call repeated), big content/type changes. Input: ordered events; output: `[{ startIdx, endIdx }]`.

3. **OpenAI diagnosis**  
   - `lib/sections/diagnose.ts` — for each segment (events in [startIdx, endIdx]), call OpenAI with a small prompt: “Given these events, return: label (short title), what_happened (1–2 sentences), verdict (good|warning|failure), root_cause_guess, fix_suggestion, confidence (0–1).”  
   - Use structured output (JSON) or parse. Store result in `sections`.

4. **API**  
   - `POST /api/runs/[id]/diagnose` — (optional) ensure events loaded; compute boundaries; for each segment call diagnose; persist sections; return section list.  
   - `GET /api/runs/[id]` — include `sections` in response (or separate GET if you prefer).

5. **UI**  
   - Run detail page: timeline of events with **section cards** inline (each card: label, what_happened, verdict badge, root_cause, fix_suggestion).  
   - “Diagnose run” button that calls `POST /api/runs/[id]/diagnose` and refreshes.

**Done when:** You can click “Diagnose run” and see section cards on the timeline with OpenAI-generated labels and fixes.

---

## Phase 4: Claude Agent SDK wrapper

**Goal:** Developers use a thin wrapper around the Claude Agent SDK; their runs are sent to your backend automatically.

1. **Backend**  
   - Ensure `POST /api/runs` (or a dedicated `POST /api/ingest`) accepts the payload your wrapper will send (e.g. run metadata + stream of events or batched events).  
   - Map Claude SDK event shapes to your `Event` type (type, actor, content, metadata).

2. **SDK package**  
   - New folder: `sdk/python` or `packages/claude-observability` (or similar).  
   - Wrapper: same API surface as the agent run (or a decorator/middleware) that:  
     - Subscribes to agent lifecycle (start, message/tool/result, end).  
     - Batches events and POSTs to your `POST /api/runs` (or `/api/ingest`) with an API key or project id in header/body.  
   - Readme: install, set `AGENT_OBSERVABILITY_URL` + API key, wrap your agent, run; events show up in the dashboard.

3. **Dashboard**  
   - Runs created by the wrapper have `source: 'claude_sdk'`; filter or badge in the UI.

**Done when:** A small Python (or TS) script that runs a Claude Agent SDK agent with your wrapper sends a run to your app and it appears in the runs list and detail view.

---

## Phase 5: Elasticsearch + “Similar failures” (Elastic + Jina)

**Goal:** Store section-level docs in Elasticsearch; embed with Jina; “find similar sections” in the UI.

1. **Elastic Cloud**  
   - Create a deployment; get connection details (cloud id, API key).  
   - Index for sections: e.g. `sections` with fields: run_id, section_id, start_idx, end_idx, label, what_happened, verdict, root_cause_guess, fix_suggestion, and a `embedding` (dense vector) field.

2. **Jina Embeddings**  
   - When saving a section (after Phase 3), build a text blob (e.g. `label + what_happened + root_cause_guess`), call Jina Embeddings API, get vector, store in `sections.embedding` in Postgres and in Elasticsearch (same vector in the section doc).  
   - Or: store only in Elasticsearch and use ES as source of truth for similarity; Postgres keeps run/event/section metadata without vector.

3. **Indexing**  
   - After diagnosis (Phase 3), for each section: embed text with Jina, push doc to Elasticsearch.  
   - Optional: background job (e.g. Modal) to backfill or batch index.

4. **API**  
   - `GET /api/sections/similar?sectionId=...` or `?runId=...&startIdx=...&endIdx=...` — get section’s embedding (or section id), query Elasticsearch k-NN (and optional keyword filter by verdict), return similar section ids + run ids.  
   - Optional: rerank the top N with Jina Reranker (query = current section text, candidates = similar sections) then return reranked list.

5. **UI**  
   - On run detail, each section card has a “Find similar” (or “Similar failures”) button; click → call API → show a list or modal of similar sections (with link to run + section).

**Done when:** Clicking “Similar failures” on a section shows other sections that are semantically similar, powered by Elasticsearch + Jina.

---

## Phase 6: Polish and deploy

- **Failure analytics** — Aggregate from sections: “Top failure labels,” “Most common tool misuse” (from event metadata). Simple page or section on home.  
- **Judge / demo page** — One page: sponsor logos, one live trajectory, section diagnostics, one “similar failures” example.  
- **Env and deploy** — All secrets in Vercel (Postgres, OpenAI, Elastic, Jina). Deploy to Vercel; test production.  
- **Optional: Modal worker** — For long runs, `POST /api/runs/[id]/diagnose` enqueues a job on Modal; worker computes sections and writes back; UI polls or uses a webhook for “diagnosis complete.”

---

## Order summary

| Phase | What | Outcome |
|-------|------|---------|
| 1 | In-memory ingest + viewer | Post run, see timeline |
| 2 | Vercel Postgres | Persistent runs/events |
| 3 | OpenAI sectioning + diagnose API + section cards | Section cards on timeline |
| 4 | Claude SDK wrapper | SDK sends runs to your app |
| 5 | Elasticsearch + Jina embeddings (+ optional reranker) | “Similar failures” |
| 6 | Analytics, judge page, deploy | Demo-ready on Vercel |

Start with **Phase 1**; each phase builds on the previous one.
