import { findSimilarRuns } from "@/lib/analyze";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const similar = await findSimilarRuns(id);
    return NextResponse.json({ similar });
  } catch (err) {
    console.error("Similar runs search failed:", err);
    return NextResponse.json(
      { error: "Search failed", detail: String(err) },
      { status: 500 }
    );
  }
}
