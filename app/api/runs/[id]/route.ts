import { getEvents, getRun } from "@/lib/store";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const events = await getEvents(id);
  return NextResponse.json({ run, events });
}
