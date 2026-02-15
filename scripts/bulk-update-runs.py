#!/usr/bin/env python3
"""
Bulk-update existing SWE-Agent run documents in Elasticsearch with fields
from the HuggingFace dataset that weren't captured during initial loading:
  - model_name
  - exit_status
  - generated_patch
  - eval_score (0-1 float parsed from eval_logs)
  - eval_passed, eval_failed, eval_errors, eval_total

Usage:
  source .venv/bin/activate
  uv run python scripts/bulk-update-runs.py
"""

import json
import os
import re
import sys
from collections import Counter
from datasets import load_dataset
from elasticsearch import Elasticsearch, helpers


def parse_eval_score(eval_logs: str | None) -> dict:
    """Parse pytest output from eval_logs into pass/fail/error counts + score."""
    if not eval_logs:
        return {"eval_score": None, "eval_passed": 0, "eval_failed": 0, "eval_errors": 0, "eval_total": 0}

    p_match = re.search(r"(\d+) passed", eval_logs)
    f_match = re.search(r"(\d+) failed", eval_logs)
    e_match = re.search(r"(\d+) error", eval_logs)

    passed = int(p_match.group(1)) if p_match else 0
    failed = int(f_match.group(1)) if f_match else 0
    errors = int(e_match.group(1)) if e_match else 0
    total = passed + failed + errors

    return {
        "eval_score": round(passed / total, 4) if total > 0 else None,
        "eval_passed": passed,
        "eval_failed": failed,
        "eval_errors": errors,
        "eval_total": total,
    }


def main():
    # Load env
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_path):
        for line in open(env_path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k, v)

    es_url = os.environ.get("ELASTICSEARCH_URL")
    es_key = os.environ.get("ELASTICSEARCH_API_KEY")
    if not es_url or not es_key:
        print("ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY must be set", file=sys.stderr)
        sys.exit(1)

    client = Elasticsearch(es_url, api_key=es_key)

    # Load the HF dataset
    print("Loading nebius/SWE-agent-trajectories from HuggingFace...")
    ds = load_dataset("nebius/SWE-agent-trajectories", split="train")

    # Get our task set from what's already in ES
    tasks = {
        "Azure__msrest-for-python-208",
        "cuthbertLab__music21-958",
        "deardurham__ciprs-reader-38",
        "websocket-client__websocket-client-929",
        "canonical__operator-860",
        "MicroPyramid__forex-python-27",
        "networkx__networkx-7024",
        "zulip__zulip-terminal-1350",
    }

    print("Filtering dataset to our tasks...")
    filtered = ds.filter(lambda x: x["instance_id"] in tasks)
    print(f"Found {len(filtered)} matching rows in HF dataset")

    # Build a mapping: run_id -> extra fields
    # Run IDs were generated as: nebius-{instance_id}-{index}
    # We need to match by regenerating the same IDs
    updates = []
    for i in range(len(filtered)):
        row = filtered[i]
        run_id = f"nebius-{row['instance_id']}-{i}"
        eval_data = parse_eval_score(row.get("eval_logs"))

        doc = {
            "model_name": row.get("model_name", ""),
            "exit_status": row.get("exit_status", ""),
            "generated_patch": row.get("generated_patch", ""),
            **eval_data,
        }

        updates.append({
            "_op_type": "update",
            "_index": "runs",
            "_id": run_id,
            "doc": doc,
        })

    # Bulk update in batches
    print(f"Sending {len(updates)} bulk updates to Elasticsearch...")
    success = 0
    errors = 0
    for i in range(0, len(updates), 200):
        batch = updates[i:i+200]
        try:
            ok, errs = helpers.bulk(client, batch, raise_on_error=False)
            success += ok
            if errs:
                errors += len(errs)
        except Exception as e:
            print(f"  Batch error at {i}: {e}")
            errors += len(batch)

        if (i + 200) % 1000 < 200 or i + 200 >= len(updates):
            print(f"  Updated {min(i+200, len(updates))}/{len(updates)} ({success} ok, {errors} errors)")

    # Refresh
    client.indices.refresh(index="runs")
    print(f"\nDone. {success} updated, {errors} errors.")

    # Quick verification
    sample = client.get(index="runs", id=updates[0]["_id"])
    src = sample["_source"]
    print(f"\nVerification — {updates[0]['_id']}:")
    for field in ["model_name", "exit_status", "eval_score", "eval_passed", "eval_total"]:
        print(f"  {field}: {src.get(field, 'MISSING')}")


if __name__ == "__main__":
    main()
