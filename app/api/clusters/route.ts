import { getRunClusters } from "@/lib/analyze";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const task = searchParams.get("task") ?? undefined;
  const source = searchParams.get("source") ?? undefined;
  const threshold = searchParams.get("threshold");
  const similarityThreshold = threshold ? Number(threshold) : undefined;

  try {
    const clusters = await getRunClusters({
      task,
      source,
      similarityThreshold,
    });
    return NextResponse.json({ clusters });
  } catch (err) {
    console.error("Clusters failed:", err);
    return NextResponse.json(
      { error: "Clusters failed", detail: String(err) },
      { status: 500 }
    );
  }
}
