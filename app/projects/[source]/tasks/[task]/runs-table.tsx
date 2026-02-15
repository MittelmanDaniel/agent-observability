"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import type { Run } from "@/lib/types";

/* ---------- Helpers ---------- */

function modelShortName(name?: string): string {
  if (!name) return "—";
  const m = name.match(/llama[- ]?(\d+b)/i);
  if (m) return `Llama ${m[1].toUpperCase()}`;
  return name;
}

/* ---------- Sub-components ---------- */

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "succeeded"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : status === "running"
        ? "bg-blue-100 text-blue-700 animate-pulse dark:bg-blue-900/40 dark:text-blue-300"
        : status === "reward_hacking"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight ${cls}`}>
      {status}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 1 ? "bg-emerald-500" : score >= 0.8 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{pct}%</span>
    </div>
  );
}

function FilterChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      }`}
    >
      {label}
      <span className={`tabular-nums ${active ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-400 dark:text-zinc-500"}`}>
        {count}
      </span>
    </button>
  );
}

/* ---------- Main component ---------- */

export function RunsTable({
  runs,
  task,
  source,
}: {
  runs: Run[];
  task: string;
  source: string;
}) {
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Derive unique models and statuses
  const models = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of runs) {
      const name = modelShortName(r.model_name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [runs]);

  const statuses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of runs) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [runs]);

  const hasModels = runs.some((r) => r.model_name);
  const hasScores = runs.some((r) => r.eval_score != null);

  // Filter
  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (modelFilter && modelShortName(r.model_name) !== modelFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [runs, modelFilter, statusFilter]);

  const taskEscaped = task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1">Filter:</span>

        {/* Model filters */}
        {hasModels && models.length > 1 && (
          <>
            {models.map(([model, count]) => (
              <FilterChip
                key={model}
                label={model}
                count={count}
                active={modelFilter === model}
                onClick={() => setModelFilter(modelFilter === model ? null : model)}
              />
            ))}
            <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
          </>
        )}

        {/* Status filters */}
        {statuses.map(([status, count]) => (
          <FilterChip
            key={status}
            label={status}
            count={count}
            active={statusFilter === status}
            onClick={() => setStatusFilter(statusFilter === status ? null : status)}
          />
        ))}

        {/* Clear all */}
        {(modelFilter || statusFilter) && (
          <>
            <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
            <button
              onClick={() => { setModelFilter(null); setStatusFilter(null); }}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Results count */}
      {(modelFilter || statusFilter) && (
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Showing {filtered.length} of {runs.length} runs
        </p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/50">
              <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Run</th>
              {hasModels && (
                <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Model</th>
              )}
              <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Status</th>
              {hasScores && (
                <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Score</th>
              )}
              <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Exit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {filtered.map((run) => (
              <tr
                key={run.id}
                className="transition hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/runs/${run.id}?source=${encodeURIComponent(source)}`}
                    className="font-mono text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:underline"
                  >
                    {run.id.replace(/^nebius-/, "").replace(new RegExp(`^${taskEscaped}-`), "#")}
                  </Link>
                </td>
                {hasModels && (
                  <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {modelShortName(run.model_name)}
                  </td>
                )}
                <td className="px-3 py-2">
                  <StatusBadge status={run.status} />
                </td>
                {hasScores && (
                  <td className="px-3 py-2">
                    {run.eval_score != null ? (
                      <ScoreBar score={run.eval_score} />
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500">
                  {run.exit_status ?? "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-zinc-400">
                  No runs match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
