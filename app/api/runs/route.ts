import { createRun, listRuns } from "@/lib/store";
import type { EventType, Run } from "@/lib/types";
import { NextResponse } from "next/server";

const EVENT_TYPES: EventType[] = [
  "llm_call",
  "tool_call",
  "tool_result",
  "thought",
  "error",
  "user_feedback",
];

function toEventType(s: string): EventType {
  return EVENT_TYPES.includes(s as EventType) ? (s as EventType) : "thought";
}

export async function GET() {
  const runs = await listRuns();
  return NextResponse.json(runs);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { task, source = "custom", events = [] } = body as {
    task?: string;
    source?: Run["source"];
    events?: Array<{
      idx: number;
      ts: string;
      type: string;
      actor: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const run: Run = {
    id,
    source: source ?? "custom",
    task: task ?? "Untitled",
    status: "completed",
    started_at: now,
    ended_at: now,
  };
  const eventList = Array.isArray(events)
    ? events.map((e) => ({
        idx: e.idx,
        ts: e.ts ?? now,
        type: toEventType(e.type ?? "thought"),
        actor: e.actor ?? "agent",
        content: e.content ?? "",
        metadata: e.metadata,
      }))
    : [];
  await createRun(run, eventList);
  return NextResponse.json({ id, run });
}
