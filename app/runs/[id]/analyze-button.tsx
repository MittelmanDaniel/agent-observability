"use client";

import { useState } from "react";
import type { Section } from "@/lib/types";

export function AnalyzeButton({
  runId,
  initialSections,
  onSectionsChange,
}: {
  runId: string;
  initialSections: Section[];
  onSectionsChange?: (sections: Section[]) => void;
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
      const newSections = data.sections ?? [];
      setSections(newSections);
      onSectionsChange?.(newSections);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
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
          Agent is analyzing trajectory (fetching metadata → browsing events → generating sections)...
        </span>
      )}
      {error && (
        <span className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </div>
  );
}
