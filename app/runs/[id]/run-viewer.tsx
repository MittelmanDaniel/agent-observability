"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Event, Section } from "@/lib/types";
import { Timeline } from "./timeline";
import { MessageList } from "./message-list";
import { AnalyzeButton } from "./analyze-button";

export function RunViewer({
  runId,
  events,
  initialSections,
}: {
  runId: string;
  events: Event[];
  initialSections: Section[];
}) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0); // 0-1 within active section
  const sectionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const registerSectionRef = useCallback(
    (sectionIndex: number, el: HTMLDivElement | null) => {
      if (el) {
        sectionRefs.current.set(sectionIndex, el);
      } else {
        sectionRefs.current.delete(sectionIndex);
      }
    },
    []
  );

  const scrollToSection = useCallback((sectionIndex: number) => {
    setSelectedSectionIdx(sectionIndex);
    const el = sectionRefs.current.get(sectionIndex);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Track scroll position to determine active section + progress
  useEffect(() => {
    if (sections.length === 0) return;

    function onScroll() {
      const refs = sectionRefs.current;
      if (refs.size === 0) return;

      const viewportTop = window.scrollY;
      const viewportHeight = window.innerHeight;

      // Find which section is currently in view
      let activeIdx = 0;
      let activeTop = 0;
      let activeBottom = 0;

      for (let i = sections.length - 1; i >= 0; i--) {
        const el = refs.get(i);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Section is "active" if its top is above the middle of viewport
        if (rect.top <= viewportHeight * 0.3) {
          activeIdx = i;
          activeTop = rect.top + window.scrollY;
          // Next section starts where the next ref begins, or end of page
          const nextEl = refs.get(i + 1);
          activeBottom = nextEl
            ? nextEl.getBoundingClientRect().top + window.scrollY
            : document.body.scrollHeight;
          break;
        }
      }

      setSelectedSectionIdx(activeIdx);

      // Calculate progress within active section
      const sectionHeight = activeBottom - activeTop;
      if (sectionHeight > 0) {
        const scrolledInto = viewportTop - activeTop + viewportHeight * 0.3;
        const progress = Math.max(0, Math.min(1, scrolledInto / sectionHeight));
        setScrollProgress(progress);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // initial
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  const hasAnalysis = sections.length > 0;

  return (
    <div>
      {/* Analyze controls */}
      <div className="mb-6">
        <AnalyzeButton
          runId={runId}
          initialSections={initialSections}
          onSectionsChange={setSections}
        />
      </div>

      {/* Table of contents */}
      {hasAnalysis && (
        <div className="mb-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(sections.length, 4)}, 1fr)` }}>
          {sections.map((section, i) => {
            const isActive = i === selectedSectionIdx;
            const verdictColor: Record<string, string> = {
              good: "border-emerald-400 dark:border-emerald-600",
              warning: "border-amber-400 dark:border-amber-600",
              failure: "border-rose-400 dark:border-rose-600",
            };
            const verdictBg: Record<string, string> = {
              good: "bg-emerald-50 dark:bg-emerald-950/30",
              warning: "bg-amber-50 dark:bg-amber-950/30",
              failure: "bg-rose-50 dark:bg-rose-950/30",
            };
            const verdictBadge: Record<string, string> = {
              good: "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200",
              warning: "bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
              failure: "bg-rose-200 text-rose-800 dark:bg-rose-800 dark:text-rose-200",
            };
            const border = verdictColor[section.verdict] ?? verdictColor.good;
            const bg = verdictBg[section.verdict] ?? verdictBg.good;
            const badge = verdictBadge[section.verdict] ?? verdictBadge.good;

            return (
              <button
                key={section.id}
                onClick={() => scrollToSection(i)}
                className={`
                  rounded-lg border-l-4 px-3 py-2.5 text-left transition-all
                  ${border} ${bg}
                  ${isActive ? "ring-2 ring-zinc-400/30 shadow-md" : "opacity-70 hover:opacity-100"}
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                    {i + 1}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none ${badge}`}>
                    {section.verdict}
                  </span>
                </div>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 leading-tight">
                  {section.label}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed max-h-36 overflow-y-auto">
                  {section.what_happened}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Layout: timeline rail + message chat */}
      <div className="flex min-h-[calc(100vh-220px)]">
        {/* Left: Section timeline rail */}
        {hasAnalysis && (
          <div className="w-[260px] shrink-0 relative">
            <div className="sticky top-8">
              <Timeline
                sections={sections}
                selectedIdx={selectedSectionIdx}
                scrollProgress={scrollProgress}
                onSelect={scrollToSection}
              />
            </div>
          </div>
        )}

        {/* Main: Scrollable message chat */}
        <div className="flex-1 max-w-4xl">
          <MessageList
            events={events}
            sections={sections}
            selectedSectionIdx={selectedSectionIdx}
            registerSectionRef={registerSectionRef}
          />
        </div>
      </div>
    </div>
  );
}
