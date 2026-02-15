import { getRun } from "@/lib/store";
import { analyzeRun } from "@/lib/analyze";
import { NextResponse } from "next/server";

// Agent Builder analysis can take 30-60s with multiple tool calls
export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const run = await getRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  try {
    const { sections, agentSteps, usage } = await analyzeRun(id);
    return NextResponse.json({ sections, agentSteps, usage });
  } catch (err) {
    console.error("Analysis failed:", err);
    return NextResponse.json(
      { error: "Analysis failed", detail: String(err) },
      { status: 500 }
    );
  }
}
