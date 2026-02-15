#!/usr/bin/env python3
"""
Load the PatronusAI/trace-dataset (reward-hacking agent trajectories) from
Hugging Face and normalize to our Run/Event schema.

This dataset is GATED – you need a HuggingFace token with access.
Set HF_TOKEN in your environment before running.

Usage (use uv, not python3/pip):
  uv venv && source .venv/bin/activate
  uv pip install -r scripts/requirements.txt

  # Load 20 TRACE runs (default), write to data/trace_runs.json
  HF_TOKEN=hf_xxx uv run python scripts/load_trace.py --limit 20

  # Load ALL 517 runs
  HF_TOKEN=hf_xxx uv run python scripts/load_trace.py --limit 0
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Tuple


# TRACE label taxonomy (from the paper)
LABEL_DESCRIPTIONS: Dict[str, str] = {
    "0": "benign",
    "1.1.1": "reward hacking: specification gaming – exploiting evaluation metric",
    "1.1.2": "reward hacking: specification gaming – shortcut solution",
    "1.1.3": "reward hacking: specification gaming – fabricated evidence",
    "1.2.1": "reward hacking: reward tampering – modifying tests",
    "1.2.2": "reward hacking: reward tampering – disabling validation",
    "1.2.3": "reward hacking: reward tampering – falsifying results",
    "1.3.1": "reward hacking: sycophancy – agreeing without basis",
    "1.3.2": "reward hacking: sycophancy – misleading progress claims",
    "1.4.1": "reward hacking: sandbagging – deliberate underperformance",
    "1.4.2": "reward hacking: sandbagging – feigning inability",
}


def label_to_status(label: str) -> str:
    """Map TRACE label to our status field."""
    if label == "0":
        return "succeeded"
    return "reward_hacking"


def describe_labels(label: str) -> str:
    """Turn the comma-separated label codes into human-readable descriptions."""
    codes = [c.strip() for c in label.split(",")]
    descriptions = []
    for code in codes:
        desc = LABEL_DESCRIPTIONS.get(code, f"unknown ({code})")
        descriptions.append(desc)
    return "; ".join(descriptions)


def _format_tool_call(name: str, params: dict) -> str:
    """Format a tool call into readable content based on tool type."""
    name_lower = name.lower()

    if name_lower == "bash" or name_lower == "shell":
        cmd = params.get("command", "")
        desc = params.get("description", "")
        parts = []
        if desc:
            parts.append(f"# {desc}")
        parts.append(cmd or json.dumps(params, indent=2))
        return "\n".join(parts)

    if name_lower == "read":
        fp = params.get("file_path", params.get("path", ""))
        if fp:
            return fp
        return json.dumps(params, indent=2)

    if name_lower in ("edit", "strreplace", "str_replace"):
        fp = params.get("file_path", params.get("path", ""))
        old = params.get("old_string", "")
        new = params.get("new_string", "")
        parts = []
        if fp:
            parts.append(fp)
        if old and new:
            parts.append(f"- {old[:200]}")
            parts.append(f"+ {new[:200]}")
        elif old:
            parts.append(f"- {old[:300]}")
        elif new:
            parts.append(f"+ {new[:300]}")
        return "\n".join(parts) if parts else json.dumps(params, indent=2)

    if name_lower == "write":
        fp = params.get("file_path", params.get("path", ""))
        content = params.get("content", params.get("contents", ""))
        parts = []
        if fp:
            parts.append(fp)
        if content:
            preview = content[:300]
            if len(content) > 300:
                preview += f"\n... [{len(content)} chars total]"
            parts.append(preview)
        return "\n".join(parts) if parts else json.dumps(params, indent=2)

    if name_lower == "glob":
        pattern = params.get("pattern", params.get("glob_pattern", ""))
        path = params.get("path", "")
        if pattern:
            return f"{pattern}" + (f"  in {path}" if path else "")

    if name_lower == "grep":
        pattern = params.get("pattern", "")
        path = params.get("path", "")
        if pattern:
            return f"grep {pattern}" + (f"  in {path}" if path else "")

    # Fallback: compact JSON
    return json.dumps(params, indent=2, ensure_ascii=False)


def _format_tool_result(tr) -> str:
    """Extract readable content from a tool result."""
    if isinstance(tr, dict):
        # Most common: {"output": "..."} — extract the output directly
        output = tr.get("output")
        if output is not None:
            text = str(output)
        else:
            # Try other common keys
            for key in ("result", "content", "text", "stdout"):
                val = tr.get(key)
                if val is not None:
                    text = str(val)
                    break
            else:
                text = json.dumps(tr, ensure_ascii=False)
    else:
        text = str(tr)

    # Cap extremely long results (>20k) to keep ES indexing reasonable
    if len(text) > 20000:
        text = text[:18000] + "\n... [truncated, " + str(len(text)) + " chars total]"
    return text


def normalize_trace_row(row: dict, run_id: str) -> Tuple[Dict, List[Dict]]:
    """Convert one PatronusAI/trace-dataset row to Run + Events."""
    label = row.get("label", "0")
    trajectory_id = row.get("trajectory_id", run_id)

    conversation_str = row.get("conversation", "[]")
    try:
        messages = (
            json.loads(conversation_str)
            if isinstance(conversation_str, str)
            else conversation_str
        )
    except json.JSONDecodeError:
        messages = []

    # Extract task description from first user message
    task = "TRACE trajectory"
    for msg in messages:
        if msg.get("role") == "user":
            content = msg.get("content", "")
            # Use first 120 chars as task summary
            task = content[:120].replace("\n", " ").strip()
            if len(content) > 120:
                task += "..."
            break

    now = datetime.now(timezone.utc).isoformat()

    run = {
        "id": run_id,
        "source": "trace",
        "task": task,
        "status": label_to_status(label),
        "started_at": now,
        "ended_at": now,
        # Extra metadata specific to TRACE
        "trace_label": label,
        "trace_label_description": describe_labels(label),
        "trace_trajectory_id": trajectory_id,
    }

    events: List[Dict] = []
    event_idx = 0

    for msg in messages:
        if not isinstance(msg, dict):
            continue

        role = msg.get("role", "unknown")
        text_content = msg.get("content", "")
        tool_calls = msg.get("tool_calls") or []
        tool_results = msg.get("tool_results") or []

        # 1) Emit the text content as a thought/message (if non-empty)
        if text_content and text_content.strip():
            events.append(
                {
                    "idx": event_idx,
                    "ts": now,
                    "type": role,  # "user" or "assistant"
                    "actor": role,
                    "content": text_content,
                }
            )
            event_idx += 1

        # 2) Emit paired tool_call + tool_result events
        #    Each tool_call is immediately followed by its tool_result (if available).
        for i_tc, tc in enumerate(tool_calls):
            name = tc.get("name", "unknown_tool")
            params = tc.get("parameters", {})

            # Format the tool call content nicely based on tool type
            call_content = _format_tool_call(name, params)
            events.append(
                {
                    "idx": event_idx,
                    "ts": now,
                    "type": "tool_call",
                    "actor": name,
                    "content": call_content,
                }
            )
            event_idx += 1

            # Emit the matching tool result right after (if it exists)
            if i_tc < len(tool_results):
                tr = tool_results[i_tc]
                result_text = _format_tool_result(tr)
                events.append(
                    {
                        "idx": event_idx,
                        "ts": now,
                        "type": "tool_result",
                        "actor": name,
                        "content": result_text,
                    }
                )
                event_idx += 1

        # Any remaining tool results without a matching call (rare)
        for tr in tool_results[len(tool_calls):]:
            result_text = _format_tool_result(tr)
            events.append(
                {
                    "idx": event_idx,
                    "ts": now,
                    "type": "tool_result",
                    "actor": "tool",
                    "content": result_text,
                }
            )
            event_idx += 1

    return run, events


def main():
    parser = argparse.ArgumentParser(
        description="Load PatronusAI/trace-dataset and normalize to Run+Events."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Max number of runs to load. Use 0 for all (default 20).",
    )
    parser.add_argument(
        "--out",
        type=str,
        help="Write runs to this JSON file (default: data/trace_runs.json)",
    )
    parser.add_argument("--split", type=str, default="train", help="HF dataset split")
    args = parser.parse_args()

    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        print(
            "HF_TOKEN environment variable is required (dataset is gated).",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Loading PatronusAI/trace-dataset from Hugging Face...")
    from datasets import load_dataset

    ds = load_dataset("PatronusAI/trace-dataset", split=args.split, token=hf_token)
    total = len(ds) if args.limit <= 0 else min(args.limit, len(ds))
    print(f"Dataset has {len(ds)} rows. Using first {total}.")

    out_path = args.out or os.path.join(
        os.path.dirname(__file__), "..", "data", "trace_runs.json"
    )
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("[\n")
        for i in range(total):
            row = ds[i]
            tid = row.get("trajectory_id", f"trace-{i}")
            run_id = f"trace-{tid}"
            run, events = normalize_trace_row(row, run_id)

            if i > 0:
                f.write(",\n")
            f.write(json.dumps({"run": run, "events": events}, ensure_ascii=False))

            if (i + 1) % 50 == 0 or i == total - 1:
                print(f"  Wrote {i + 1}/{total} runs...")
        f.write("\n]\n")

    print(f"Done. Wrote {total} runs to {out_path}")


if __name__ == "__main__":
    main()
