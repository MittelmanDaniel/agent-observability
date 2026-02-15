# Agent Trajectory Datasets for Demo/Test

This file tracks practical datasets we can use to demo sectioned trajectory diagnosis.

## Selection criteria (how these judgments were made)

We prioritized datasets that are:

1. **Actual agent traces** (not just final answers),
2. **Long-horizon / multi-step** enough for sectioning,
3. **Failure-rich** so diagnostics are meaningful,
4. **Easy to access quickly** during hackathon development.

---

## 1) TRAIL (PatronusAI) - best for quality diagnostics

- Dataset: `PatronusAI/TRAIL` (Hugging Face)
- Paper: "TRAIL: Trace Reasoning and Agentic Issue Localization" (arXiv:2505.08638)
- Repo: `patronus-ai/trail-benchmark`

### What it is

Human-annotated benchmark for trace debugging:
- **148** annotated agent traces
- **841** labeled errors
- Error taxonomy across reasoning, execution, and planning
- Built from GAIA and SWE-Bench style tasks

### Run counts

- **Total traces (runs): 148**
- Breakdown from dataset card: **118 GAIA + 30 SWE-Bench**
- Additional structure detail from card: 1,987 spans total, 575 spans with at least one error

### Notes

- Strongest dataset for validating your section labels (`verdict`, `root_cause_guess`, `fix_suggestion`)
- Access is gated on Hugging Face (you must accept terms)

---

## 2) Nebius SWE-agent trajectories - best for scale

- Dataset: `nebius/SWE-agent-trajectories`

### What it is

Large corpus of SWE-agent-style coding traces with reasoning/actions/observations and patch/eval metadata.

### Run counts

- **Total trajectories (runs): 80,036**
- Dataset card split by issue outcome:
  - Resolved: 13,389
  - Not resolved: 66,647

### Notes

- Great for cross-run analytics ("top repeated failure sections")
- Larger/noisier than TRAIL, but excellent for stress testing

---

## 3) SWE-smith trajectories - large and strong coding baseline

- Dataset: `SWE-bench/SWE-smith-trajectories`

### What it is

Trajectory dataset generated from SWE-agent + Claude 3.7 Sonnet over SWE-smith tasks.

### Run counts

- Dataset description says: **5,017 trajectories used for fine-tuning**
- Hugging Face row count shows: **76,002 rows**

### Notes on count interpretation

For this dataset, "rows" may not equal one full run depending on serialization format.  
Plan to inspect one sample before assuming "76,002 independent full runs."

---

## Suggested usage in our demo

1. Use **TRAIL** for "gold" examples in the live demo.
2. Use **Nebius SWE-agent trajectories** for "many runs" analytics views.
3. Add **SWE-smith** if we need extra volume or Claude-oriented coding traces.

---

## Possible trajectory types to support in our schema

We should normalize all sources into one internal schema (`run`, `events`, `sections`) and support:

- `coding_agent_run` (SWE-agent traces)
- `research_agent_run` (GAIA-like open-web retrieval traces)
- `conversation_agent_run` (assistant turn/tool traces)
- `browser_agent_run` (Stagehand/browser automation traces)
- `multi_agent_run` (handoff/delegation patterns)

Each run should preserve:
- ordered events (`idx`, timestamp, type, actor, content),
- tool calls/results,
- explicit errors/exceptions,
- optional patch/eval outcomes.
