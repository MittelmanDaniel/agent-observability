#!/usr/bin/env python3
"""
Load trajectory datasets from Hugging Face and normalize to our Run/Event schema.
Outputs JSON files you can import via the dashboard, or POSTs to your local API.

Usage (use uv, not python3/pip):
  # Create venv and install deps (once)
  uv venv && source .venv/bin/activate   # or .venv\\Scripts\\activate on Windows
  uv pip install -r scripts/requirements.txt

  # Load 10 Nebius runs, write to data/sample_runs.json (no API needed yet)
  uv run python scripts/load_trajectories.py --dataset nebius --limit 10 --out data/sample_runs.json

  # Same but POST to your running Next.js app (after Phase 1 API exists)
  uv run python scripts/load_trajectories.py --dataset nebius --limit 10 --post http://localhost:3000
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Tuple


def normalize_nebius_row(row: dict, run_id: str) -> Tuple[Dict, List[Dict]]:
    """Convert one nebius/SWE-agent-trajectories row to Run + Events."""
    run = {
        "id": run_id,
        "source": "custom",
        "task": row.get("instance_id", "unknown"),
        "status": "succeeded" if row.get("target") else "failed",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": datetime.now(timezone.utc).isoformat(),
    }
    trajectory_str = row.get("trajectory") or "[]"
    try:
        steps = json.loads(trajectory_str) if isinstance(trajectory_str, str) else trajectory_str
    except json.JSONDecodeError:
        steps = []
    events = []
    for idx, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        role = step.get("role", "unknown")
        events.append({
            "idx": idx,
            "ts": datetime.now(timezone.utc).isoformat(),
            "type": role,
            "actor": role,
            "content": json.dumps(step, ensure_ascii=False),
        })
    return run, events


def main():
    parser = argparse.ArgumentParser(description="Load HF trajectories and normalize to Run+Events.")
    parser.add_argument("--dataset", choices=["nebius"], default="nebius", help="Dataset: nebius = nebius/SWE-agent-trajectories")
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Max number of runs to load. Use 0 for all (default 10).",
    )
    parser.add_argument("--out", type=str, help="Write runs to this JSON file (default: data/sample_runs.json)")
    parser.add_argument("--post", type=str, help="POST each run to this base URL (e.g. http://localhost:3000)")
    parser.add_argument("--split", type=str, default="train", help="HF dataset split")
    args = parser.parse_args()

    if args.dataset != "nebius":
        print("Only nebius is supported for now.", file=sys.stderr)
        sys.exit(1)

    print("Loading nebius/SWE-agent-trajectories from Hugging Face...")
    from datasets import load_dataset
    ds = load_dataset("nebius/SWE-agent-trajectories", split=args.split)
    total = len(ds) if args.limit <= 0 else min(args.limit, len(ds))
    print(f"Using first {total} rows.")

    out_path = args.out or os.path.join(os.path.dirname(__file__), "..", "data", "sample_runs.json")
    if args.post:
        import requests
        base = args.post.rstrip("/")
        url = f"{base}/api/runs"
        for i in range(total):
            row = ds[i]
            run_id = f"nebius-{row.get('instance_id', i)}-{i}"
            run, events = normalize_nebius_row(row, run_id)
            body = {
                "task": run["task"],
                "source": "custom",
                "events": events,
            }
            try:
                resp = requests.post(url, json=body, timeout=10)
                resp.raise_for_status()
                if (i + 1) % 100 == 0 or i == total - 1:
                    print(f"POST {i + 1}/{total}", run["id"][:50], resp.status_code)
            except Exception as e:
                print("POST failed", run["id"], e)
        print("Done POSTing to", base)
    else:
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("[\n")
            for i in range(total):
                row = ds[i]
                run_id = f"nebius-{row.get('instance_id', i)}-{i}"
                run, events = normalize_nebius_row(row, run_id)
                item = {"run": run, "events": events}
                if i > 0:
                    f.write(",\n")
                f.write(json.dumps(item, ensure_ascii=False))
                if (i + 1) % 100 == 0 or i == total - 1:
                    print(f"Wrote {i + 1}/{total} runs...")
            f.write("\n]\n")
        print("Wrote", total, "runs to", out_path)


if __name__ == "__main__":
    main()
