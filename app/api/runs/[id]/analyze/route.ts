import { getEvents, getRun } from "@/lib/store";
import { analyzeRun } from "@/lib/analyze";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const run = await getRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const events = await getEvents(id);
  if (events.length === 0) {
    return NextResponse.json(
      { error: "No events found for this run" },
      { status: 400 }
    );
  }

  try {
    const sections = await analyzeRun(id, events);
    return NextResponse.json({ sections });
  } catch (err) {
    console.error("Analysis failed:", err);
    return NextResponse.json(
      { error: "Analysis failed", detail: String(err) },
      { status: 500 }
    );
  }
}
