"""
Modal app that runs SWE-agent on a task and writes results to Elasticsearch.

SWE-agent uses Modal internally for code execution (--env.deployment.type=modal).
This Modal function is just the orchestrator that runs the sweagent CLI.

Setup (one-time):
  1. Create Modal secrets (from repo root). Optional: add GITHUB_TOKEN to avoid
     rate limits and allow opening PRs (use: GITHUB_TOKEN="$(gh auth token)").
       uv run modal secret create swe-agent-secrets \
         OPENAI_API_KEY="$(grep OPENAI_API_KEY .env.local | cut -d= -f2-)" \
         ANTHROPIC_API_KEY="$(grep ANTHROPIC_API_KEY .env.local | cut -d= -f2-)" \
         ELASTICSEARCH_URL="$(grep ELASTICSEARCH_URL .env.local | cut -d= -f2-)" \
         ELASTICSEARCH_API_KEY="$(grep ELASTICSEARCH_API_KEY .env.local | cut -d= -f2-)" \
         GITHUB_TOKEN="$(gh auth token)"

  2. Deploy:
       modal deploy workers/swe_agent_runner.py

  3. Copy the trigger_run endpoint URL printed by deploy and add to .env.local:
       MODAL_ENDPOINT_URL=https://<workspace>--swe-agent-runner-trigger-run.modal.run

  4. Restart your Next.js dev server (or redeploy on Vercel).
"""

import modal
import json
import subprocess
import os
import glob
from datetime import datetime, timezone

app = modal.App("swe-agent-runner")

# SWE-agent requires repo root with config/, tools/, trajectories/ (see sweagent/__init__.py).
# pip install from git only installs the package, so we clone and editable-install.
# run_with_drop_params.py sets litellm.drop_params=True so GPT-5 / Claude don't error on top_p.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .run_commands(
        "git clone --depth 1 https://github.com/SWE-agent/SWE-agent.git /opt/swe-agent",
        "pip install -e /opt/swe-agent",
        "pip install 'swe-rex[modal]' modal elasticsearch",
    )
    .add_local_file(
        "workers/run_with_drop_params.py",
        "/opt/swe-agent/run_with_drop_params.py",
    )
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("swe-agent-secrets")],
    timeout=1800,  # 30 minutes
    cpu=2.0,
    memory=4096,
)
def run_swe_agent(
    run_id: str,
    task_id: str,
    model: str,
    cost_limit: float = 3.0,
):
    """Run SWE-agent on a SWE-bench task and write results to Elasticsearch."""
    from elasticsearch import Elasticsearch

    es_url = os.environ["ELASTICSEARCH_URL"]
    es_key = os.environ["ELASTICSEARCH_API_KEY"]
    client = Elasticsearch(es_url, api_key=es_key)

    # Mark run as actively running
    client.update(
        index="runs", id=run_id,
        doc={"status": "running"},
        refresh="wait_for",
    )

    # Parse task ID (format: owner__repo-number)
    parts = task_id.rsplit("-", 1)
    if len(parts) < 2:
        client.update(
            index="runs", id=run_id,
            doc={
                "status": "failed",
                "exit_status": "invalid_task_id",
                "ended_at": datetime.now(timezone.utc).isoformat(),
            },
            refresh="wait_for",
        )
        return {"error": f"Invalid task ID format: {task_id}", "run_id": run_id}

    repo_part = parts[0].replace("__", "/")
    issue_number = parts[1]
    github_url = f"https://github.com/{repo_part}"
    issue_url = f"https://github.com/{repo_part}/issues/{issue_number}"

    workdir = "/tmp/sweagent-run"
    os.makedirs(workdir, exist_ok=True)

    # Use wrapper so litellm.drop_params=True (avoids top_p / temperature errors for GPT-5, Claude, etc.)
    cmd = [
        "python", "/opt/swe-agent/run_with_drop_params.py", "run",
        f"--agent.model.name={model}",
        f"--agent.model.per_instance_cost_limit={cost_limit}",
        f"--env.repo.github_url={github_url}",
        f"--problem_statement.github_url={issue_url}",
        "--env.deployment.type=modal",
    ]

    print(f"[swe-agent-runner] task={task_id} model={model} run_id={run_id}")
    print(f"[swe-agent-runner] cmd: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1500,
            cwd=workdir,
        )

        print(f"[swe-agent-runner] exit_code={result.returncode}")
        if result.stdout:
            print(f"[swe-agent-runner] stdout (tail):\n{result.stdout[-3000:]}")
        if result.stderr:
            print(f"[swe-agent-runner] stderr (tail):\n{result.stderr[-3000:]}")

        # Find trajectory output (.traj files from SWE-agent)
        traj_files = (
            glob.glob(f"{workdir}/**/trajectories/**/*.traj", recursive=True)
            + glob.glob(f"{workdir}/trajectories/**/*.traj", recursive=True)
        )
        if not traj_files:
            traj_files = glob.glob("trajectories/**/*.traj", recursive=True)

        if not traj_files:
            client.update(
                index="runs", id=run_id,
                doc={
                    "status": "failed",
                    "exit_status": "no_trajectory",
                    "ended_at": datetime.now(timezone.utc).isoformat(),
                },
                refresh="wait_for",
            )
            return {
                "error": "No trajectory file found",
                "run_id": run_id,
                "stdout": (result.stdout or "")[-3000:],
                "stderr": (result.stderr or "")[-3000:],
            }

        # Read and normalize the trajectory
        with open(traj_files[0]) as f:
            traj = json.load(f)

        # SWE-agent uses "history" or "trajectory" depending on version
        steps = traj.get("history") or traj.get("trajectory") or []
        info = traj.get("info", {})

        # Normalize steps to our Event schema
        now = datetime.now(timezone.utc).isoformat()
        events = []
        for idx, step in enumerate(steps):
            if not isinstance(step, dict):
                continue
            role = step.get("role", "unknown")
            events.append({
                "idx": idx,
                "ts": now,
                "type": role,
                "actor": role,
                "content": json.dumps(step, ensure_ascii=False),
                "run_id": run_id,
            })

        # Bulk index events
        if events:
            operations = []
            for e in events:
                operations.append({"index": {"_index": "events"}})
                operations.append(e)
            client.bulk(operations=operations, refresh="wait_for")

        # Update run with final status
        exit_status = info.get("exit_status", "unknown")
        patch = info.get("submission", "")

        client.update(
            index="runs", id=run_id,
            doc={
                "status": "succeeded" if exit_status == "submitted" else "failed",
                "exit_status": exit_status,
                "generated_patch": patch,
                "model_name": model,
                "ended_at": datetime.now(timezone.utc).isoformat(),
            },
            refresh="wait_for",
        )

        print(f"[swe-agent-runner] Done: {len(events)} events, exit_status={exit_status}")
        return {
            "status": "completed",
            "run_id": run_id,
            "exit_status": exit_status,
            "num_events": len(events),
        }

    except subprocess.TimeoutExpired:
        client.update(
            index="runs", id=run_id,
            doc={
                "status": "failed",
                "exit_status": "timeout",
                "ended_at": datetime.now(timezone.utc).isoformat(),
            },
            refresh="wait_for",
        )
        return {"error": "SWE-agent timed out (25 min)", "run_id": run_id}

    except Exception as e:
        client.update(
            index="runs", id=run_id,
            doc={
                "status": "failed",
                "exit_status": f"error: {str(e)[:200]}",
                "ended_at": datetime.now(timezone.utc).isoformat(),
            },
            refresh="wait_for",
        )
        return {"error": str(e), "run_id": run_id}


@app.function(image=image, secrets=[modal.Secret.from_name("swe-agent-secrets")])
@modal.fastapi_endpoint(method="POST")
def trigger_run(body: dict):
    """Web endpoint that spawns the long-running function and returns immediately."""
    task_id = body.get("task_id")
    model = body.get("model", "gpt-5")
    run_id = body.get("run_id")
    cost_limit = body.get("cost_limit", 3.0)

    if not task_id:
        return {"error": "task_id is required"}
    if not run_id:
        return {"error": "run_id is required"}

    # Spawn the long-running function asynchronously — returns immediately
    call = run_swe_agent.spawn(
        run_id=run_id,
        task_id=task_id,
        model=model,
        cost_limit=cost_limit,
    )

    return {
        "status": "queued",
        "call_id": call.object_id,
        "run_id": run_id,
        "task_id": task_id,
        "model": model,
    }
