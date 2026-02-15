"use client";

import { useState } from "react";
import type { Section } from "@/lib/types";

const VERDICT_STYLES: Record<string, string> = {
  good: "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30",
  warning:
    "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30",
  failure:
    "border-rose-300 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/30",
};

const VERDICT_BADGE: Record<string, string> = {
  good: "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200",
  warning:
    "bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  failure: "bg-rose-200 text-rose-800 dark:bg-rose-800 dark:text-rose-200",
};

interface SimilarSection {
  id: string;
  run_id: string;
  label: string;
  what_happened: string;
  verdict: string;
  _score: number;
}

export function SectionCard({ section }: { section: Section }) {
  const [similar, setSimilar] = useState<SimilarSection[] | null>(null);
  const [loading, setLoading] = useState(false);

  const border = VERDICT_STYLES[section.verdict] ?? VERDICT_STYLES.good;
  const badge = VERDICT_BADGE[section.verdict] ?? VERDICT_BADGE.good;

  async function findSimilar() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sections/${section.id}/similar`);
      const data = await res.json();
      setSimilar(data.similar ?? []);
    } catch {
      setSimilar([]);
    }
    setLoading(false);
  }

  return (
    <div className={`rounded-lg border-2 px-4 py-3 ${border}`}>
      <div className="flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge}`}>
          {section.verdict}
        </span>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {section.label}
        </span>
        <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
          events {section.start_idx}–{section.end_idx}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
        {section.what_happened}
      </p>

      <div className="mt-2">
        <button
          onClick={findSimilar}
          disabled={loading}
          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
        >
          {loading ? "Searching..." : similar ? "Similar sections ↓" : "Find similar sections"}
        </button>

        {similar && similar.length > 0 && (
          <ul className="mt-2 space-y-1">
            {similar.map((s) => (
              <li
                key={s.id}
                className="rounded border border-zinc-200 bg-white/50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800/50"
              >
                <a
                  href={`/runs/${s.run_id}`}
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {s.label}
                </a>
                <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${VERDICT_BADGE[s.verdict] ?? VERDICT_BADGE.good}`}>
                  {s.verdict}
                </span>
                <span className="ml-2 text-zinc-400">
                  score: {s._score.toFixed(3)}
                </span>
                <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                  {s.what_happened}
                </p>
              </li>
            ))}
          </ul>
        )}
        {similar && similar.length === 0 && (
          <p className="mt-1 text-xs text-zinc-400">No similar sections found yet. Analyze more runs first.</p>
        )}
      </div>
    </div>
  );
}
