"use client";

import { useState } from "react";
import type { Section } from "@/lib/types";
import { SectionCard } from "./section-card";

export function AnalyzeButton({
  runId,
  initialSections,
}: {
  runId: string;
  initialSections: Section[];
}) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/analyze`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }
      const data = await res.json();
      setSections(data.sections ?? []);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Sections ({sections.length})
        </h2>
        <button
          onClick={analyze}
          disabled={loading}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {loading
            ? "Analyzing..."
            : sections.length > 0
              ? "Re-analyze"
              : "Analyze Run"}
        </button>
        {loading && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            Chunking events → Claude summarization → Jina embedding...
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {sections.length > 0 && (
        <div className="mt-3 space-y-2">
          {sections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}
