# Agent Observability for Multi-Step Agents

## Product Direction (updated)

This is not "one big summary per run."  
The core UX is a **trajectory broken into sections**, where each section gets a short diagnostic label:

- "Gathered required context from docs"
- "Tool execution failed due to bad args"
- "Used wrong library API shape"
- "Recovered after retry and completed task"

The goal is to help humans answer:

1. Where did the agent make progress?
2. Where did it fail?
3. Why did that happen?
4. What should we change in prompts/tools/system design?

---

## Core Feature: Sectioned Trajectory Diagnosis

### What users see

- Full trajectory timeline (raw events preserved)
- Auto-detected **sections/phases**
- A diagnostic card for each section:
  - `section_title`
  - `start_step` / `end_step`
  - `what_happened` (1 to 2 lines)
  - `verdict` (`good`, `warning`, `failure`)
  - `root_cause_guess`
  - `fix_suggestion`
  - `confidence`

### Why this is better than plain summarization

- Keeps full trace visible (debuggable, auditable)
- Adds high-signal interpretation without hiding details
- Makes long runs scannable in under a minute
- Naturally supports cross-run analytics ("this failure section repeats")

---

## Sponsor-First Strategy (priority order)

Only sponsor-aligned tracks are prioritized below.

| Sponsor Track | How we intentionally satisfy it | Demo artifact |
|---|---|---|
| **Anthropic - Best Use of Claude Agent SDK** | Ingest trajectories directly from Claude Agent SDK callbacks | One live Claude SDK run shown in dashboard with section diagnostics |
| **OpenAI - AI Track** | Use OpenAI for sectioning + diagnostics (`verdict`, `root_cause`, `fix`) | "Diagnose Run" button producing section cards in seconds |
| **Modal - Inference Track** | Run sectioning/diagnosis asynchronously on Modal jobs | Queue + worker + result status in UI |
| ~~Warp - Best Use of Warp Agents (Oz)~~ | *(out of scope; focus Claude SDK only)* | — |
| **Elastic - End-to-end Agentic system on Elasticsearch** | **In scope.** Store section docs + embeddings; support "find similar failure sections" | Search view: similar root-cause clusters |
| **Vercel - Best deployed on Vercel** | Dashboard + API deployed on Vercel | Public URL + smooth demo |
| ~~Cloudflare - Developer Platform~~ | *(out of scope)* | — |
| **Browserbase - Best Web Automation with Stagehand** | Support browser-agent trajectories as a run type | Stagehand run where failure section shows locator/tool issue |
| ~~Decagon - Best Conversation Assistant~~ | *(out of scope)* | — |
| **Perplexity - Sonar API (optional)** | Enrich root-cause explanation with external references | "Related references" on failure cards |

---

## Recommended Stack (sponsor-friendly)

### Primary stack (ship this)

- **Frontend/API:** Next.js App Router on **Vercel**
- **DB:** Postgres (Vercel Postgres or Neon)
- **Background jobs:** **Modal**
- **LLM diagnosis:** **OpenAI** + optional **Anthropic**
- **UI:** Tailwind + shadcn/ui + lightweight chart lib

### Add-on for Elastic track

- **Elasticsearch** index for:
  - section-level documents
  - embeddings for "similar failures"
  - faceted queries by tool/model/error_type

This keeps base MVP simple while enabling an Elastic-specific story.

---

## Architecture decisions

- **Claude integration = wrapper library.** Ship a library that wraps the Claude Agent SDK. Developers use the wrapper instead of (or on top of) the raw SDK; the wrapper hooks into the agent lifecycle and sends trajectory events to our backend. One install, automatic capture. (Alternative: we could document “post from SDK callbacks” only—wrapper is the preferred approach for best DX.)
- **Analysis = OpenAI.** Sectioning, labeling, verdict, root cause, and fix suggestions are powered by **OpenAI** models. Claude is for the agent being observed; OpenAI is for the observability analysis layer.
- **Agent integration: Claude Agent SDK only.** One agent source for the MVP — our wrapper around the Claude Agent SDK. Oz, Stagehand, and other run sources are out of scope for now.
- **Decagon track:** Out of scope (skipped).
- **Cloudflare track:** Out of scope (skipped).
- **Elastic:** In scope — section indexing + "similar failures" search.

---

## Sponsor references (links)

*(Oz deferred; Claude SDK only for MVP.)*

**Warp Oz** (out of scope for now):
- **What it is:** Oz is Warp’s orchestration platform for **cloud coding agents** — programmable, auditable, steerable. Same company as the Warp terminal; Oz runs agents in the cloud (or your infra), with CLI/SDK/API, scheduling, Slack/GitHub/Linear, multi-model (Claude, Codex, Gemini).
- **Landing:** [warp.dev/oz](https://www.warp.dev/oz)
- **Web app:** [oz.warp.dev](https://oz.warp.dev/)
- **Docs:** [docs.warp.dev/agent-platform/cloud-agents/cloud-agents-overview](https://docs.warp.dev/agent-platform/cloud-agents/cloud-agents-overview) — cloud agents overview, triggers, managing agents, self-hosting, platform/SDK/API.
- **CLI reference:** [docs.warp.dev/reference/cli/cli](https://docs.warp.dev/reference/cli/cli)
- **If we add later:** Add an “Oz run” import path (ingest Oz run data into our `runs`/`events` schema) so Oz runs show up in the dashboard with section cards like Claude SDK runs.

---

## Data Model (designed for sectioning)

### `runs`
- `id`
- `source` (`claude_sdk`, `oz`, `stagehand`, `custom`)
- `task`
- `status`
- `started_at`, `ended_at`

### `events`
- `id`, `run_id`, `idx`, `ts`
- `type` (`llm_call`, `tool_call`, `tool_result`, `thought`, `error`, `user_feedback`)
- `actor`
- `content`
- `metadata` (jsonb)

### `sections`
- `id`, `run_id`
- `start_idx`, `end_idx`
- `label`
- `what_happened`
- `verdict`
- `root_cause_guess`
- `fix_suggestion`
- `confidence`
- `embedding` (optional, for similarity)

---

## Pipeline

1. Ingest raw events (`/api/events`)
2. Build section candidates (heuristics + model assist)
   - boundaries at tool errors, retries, context shifts, user feedback turns
3. LLM diagnosis per section
   - generate label, verdict, root cause, fix suggestion
4. Persist sections
5. Optional clustering across runs ("top repeated failure patterns")

---

## 36-Hour MVP Scope

### Must-have

1. **Run ingestion + viewer**
   - Upload JSON or SDK-posted events
   - Timeline with expandable raw events

2. **Section generation**
   - Basic boundary detection + OpenAI labeling
   - Render section cards inline on timeline

3. **Failure-focused analytics**
   - "Top repeated failure labels"
   - "Most common tool misuse"

4. **One real integration**
   - Claude Agent SDK or Warp Oz (prefer Claude first)

5. **Deploy**
   - Live on Vercel with clean demo flow

### Should-have

6. **Modal async worker**
   - Background diagnosis for large runs

7. **Elastic similarity view**
   - Click a failure section -> find similar sections

8. **Judge mode UI**
   - A single page showing:
     - sponsor integrations used
     - one live trajectory
     - section diagnostics
     - repeated failure insight

---

## Suggested Repo Structure

```
treehacks/
├── dashboard/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── runs/[id]/page.tsx
│   │   └── api/
│   │       ├── events/route.ts
│   │       ├── runs/route.ts
│   │       └── diagnose/route.ts
│   ├── components/
│   │   ├── timeline.tsx
│   │   ├── section-card.tsx
│   │   └── sponsor-badges.tsx
│   └── lib/
├── workers/
│   └── modal_diagnose.py
├── sdk/
│   └── python/
│       └── agent_observability/
└── docs/
    ├── TRACK_SUBMISSIONS.md
    └── DEMO_SCRIPT.md
```

---

## Pitch Lines (sponsor-tuned)

- **Anthropic:** "We make Claude Agent SDK runs debuggable by splitting trajectories into diagnostic phases with concrete fixes."
- **OpenAI:** "OpenAI powers section-level diagnosis: what happened, why it failed, and how to fix it."
- **Modal:** "Diagnosis runs asynchronously on Modal so we can process long trajectories quickly."
- **Warp:** "Warp Oz runs are first-class citizens in our observability pipeline."
- **Elastic:** "We index section failures and retrieve similar incidents across runs."
- **Vercel:** "The entire product is live and production-like on Vercel."

---

## Build Decision (recommended now)

Ship a focused v1:

- Vercel + Next.js
- Postgres
- OpenAI diagnosis
- Anthropic SDK integration
- Modal worker

Then add **Elastic** if time remains.  
This maximizes sponsor relevance while keeping build risk realistic for a hackathon window.
