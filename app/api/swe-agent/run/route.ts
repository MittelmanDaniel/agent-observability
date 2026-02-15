import { createRun } from "@/lib/store";
import type { Run } from "@/lib/types";
import { NextResponse } from "next/server";

const MODAL_ENDPOINT_URL = process.env.MODAL_ENDPOINT_URL;

export async function POST(request: Request) {
  if (!MODAL_ENDPOINT_URL) {
    return NextResponse.json(
      {
        error:
          "MODAL_ENDPOINT_URL is not configured. Run: modal deploy workers/swe_agent_runner.py",
      },
      { status: 500 }
    );
  }

  const { task, model = "gpt-5", costLimit = 3.0 } = await request.json();

  if (!task) {
    return NextResponse.json({ error: "task is required" }, { status: 400 });
  }

  // Create a placeholder run so it appears in the UI immediately
  const id = `modal-${task}-${model.replace(/[^a-z0-9]/gi, "")}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const run: Run = {
    id,
    source: "custom",
    task,
    status: "running",
    model_name: model,
    started_at: now,
    ended_at: now,
  };
  await createRun(run, []);

  // Call the Modal web endpoint — it spawns the job and returns immediately
  try {
    const res = await fetch(MODAL_ENDPOINT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: task,
        model,
        run_id: id,
        cost_limit: costLimit,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Modal trigger failed: ${text}`, run_id: id },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ ...data, run_id: id });
  } catch (err) {
    return NextResponse.json(
      { error: `Modal trigger failed: ${String(err)}`, run_id: id },
      { status: 502 }
    );
  }
}
