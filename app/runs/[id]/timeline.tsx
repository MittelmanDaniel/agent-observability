"use client";

import { useState } from "react";
import type { Section } from "@/lib/types";

const VERDICT_BADGE: Record<string, string> = {
  good: "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200",
  warning: "bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  failure: "bg-rose-200 text-rose-800 dark:bg-rose-800 dark:text-rose-200",
};

const VERDICT_BORDER: Record<string, string> = {
  good: "border-emerald-300 bg-emerald-50/95 dark:border-emerald-700 dark:bg-emerald-950/90",
  warning: "border-amber-300 bg-amber-50/95 dark:border-amber-700 dark:bg-amber-950/90",
  failure: "border-rose-300 bg-rose-50/95 dark:border-rose-700 dark:bg-rose-950/90",
};

const CELL_HEIGHT = 52; // px per section cell

export function Timeline({
  sections,
  selectedIdx,
  scrollProgress,
  onSelect,
}: {
  sections: Section[];
  selectedIdx: number;
  scrollProgress: number;
  onSelect: (idx: number) => void;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const totalHeight = sections.length * CELL_HEIGHT;

  // Fill height: fills through all past sections + progress in the active one
  const fillHeight = (selectedIdx + scrollProgress) * CELL_HEIGHT;

  return (
    <div className="relative flex items-start">
      {/* The thick rail bar */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{ width: 44, height: totalHeight }}
      >
        {/* Unfilled background */}
        <div className="absolute inset-0 bg-zinc-200 dark:bg-zinc-700/80" />

        {/* Filled progress */}
        <div
          className="absolute top-0 left-0 right-0 bg-zinc-400 dark:bg-zinc-500 transition-all duration-150"
          style={{ height: fillHeight }}
        />

        {/* Section number cells */}
        {sections.map((section, i) => {
          const isSelected = i === selectedIdx;
          const isPast = i < selectedIdx;

          return (
            <button
              key={section.id}
              onClick={() => onSelect(i)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`
                absolute left-0 right-0 flex items-center justify-center cursor-pointer
                transition-all duration-200 z-10
                ${isSelected
                  ? "text-lg font-black text-zinc-900 dark:text-white"
                  : isPast
                    ? "text-sm font-bold text-zinc-600 dark:text-zinc-300"
                    : "text-sm font-bold text-zinc-400 dark:text-zinc-500"
                }
              `}
              style={{
                top: i * CELL_HEIGHT,
                height: CELL_HEIGHT,
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Popout labels (positioned to the right of the bar) */}
      {sections.map((section, i) => {
        const isSelected = i === selectedIdx;
        const isHovered = i === hoveredIdx;

        return (
          <div key={section.id + "-label"}>
            {/* Mini title for selected section */}
            {isSelected && !isHovered && (
              <div
                className="absolute left-[56px] z-20 pointer-events-none w-[190px]"
                style={{ top: i * CELL_HEIGHT + CELL_HEIGHT / 2, transform: "translateY(-50%)" }}
              >
                <span className="block truncate rounded-lg bg-zinc-200/90 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-700/90 dark:text-zinc-200 shadow-sm backdrop-blur-sm">
                  {section.label}
                </span>
              </div>
            )}

            {/* Full popout on hover */}
            {isHovered && (
              <div
                className={`
                  absolute left-[56px] z-50 w-[300px] rounded-xl border shadow-2xl backdrop-blur-sm
                  px-4 py-3 pointer-events-none
                  ${VERDICT_BORDER[section.verdict] ?? VERDICT_BORDER.good}
                `}
                style={{ top: i * CELL_HEIGHT + CELL_HEIGHT / 2, transform: "translateY(-50%)" }}
              >
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight block">
                  {section.label}
                </span>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Events {section.start_idx}–{section.end_idx}
                </p>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed mt-2 line-clamp-3">
                  {section.what_happened}
                </p>
                <div className="mt-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${VERDICT_BADGE[section.verdict] ?? VERDICT_BADGE.good}`}>
                    {section.verdict}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
