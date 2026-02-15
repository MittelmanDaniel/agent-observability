import { findSimilarSections } from "@/lib/analyze";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const similar = await findSimilarSections(id);
    return NextResponse.json({ similar });
  } catch (err) {
    console.error("Similar sections search failed:", err);
    return NextResponse.json(
      { error: "Search failed", detail: String(err) },
      { status: 500 }
    );
  }
}
