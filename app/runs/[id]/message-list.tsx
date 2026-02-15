"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import type { Event, Section } from "@/lib/types";

const Markdown = dynamic(() => import("react-markdown"), { ssr: false });

/* ── helpers ────────────────────────────────────────────────────────── */

function extractText(event: Event): string {
  try {
    const obj = JSON.parse(event.content) as Record<string, unknown>;
    if (typeof obj.system_prompt === "string" && obj.system_prompt) return obj.system_prompt;
    if (typeof obj.text === "string" && obj.text) return obj.text;
  } catch {
    // not JSON
  }
  return event.content;
}

function splitAiMessage(text: string): { thought: string; command: string | null } {
  const lines = text.split("\n");
  let lastOpen = -1;
  let lastClose = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```") {
      if (lastOpen === -1 || lastClose !== -1) {
        lastOpen = i;
        lastClose = -1;
      } else {
        lastClose = i;
      }
    }
  }
  if (lastOpen !== -1 && lastClose !== -1 && lastClose > lastOpen) {
    return {
      thought: lines.slice(0, lastOpen).join("\n").trimEnd(),
      command: lines.slice(lastOpen + 1, lastClose).join("\n").trim() || null,
    };
  }
  return { thought: text, command: null };
}

/* ── single message bubble ──────────────────────────────────────────── */

function MessageBubble({ event }: { event: Event }) {
  const role = event.type || "user";
  const text = extractText(event);

  // Agent messages: show on the left with blue accent
  if (role === "ai") {
    const { thought, command } = splitAiMessage(text);
    return (
      <div className="flex flex-col gap-2 max-w-[85%]">
        {/* Agent label */}
        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
          Agent
        </span>

        {/* Thought */}
        {thought && (
          <div className="rounded-xl rounded-tl-sm bg-white px-4 py-3 shadow-sm border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700">
            <div className="prose prose-sm dark:prose-invert max-w-none wrap-break-word text-sm">
              <Markdown>{thought}</Markdown>
            </div>
          </div>
        )}

        {/* Command */}
        {command && (
          <div className="rounded-xl rounded-tl-sm bg-violet-50 px-4 py-3 shadow-sm border border-violet-200 dark:bg-violet-950/40 dark:border-violet-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500 dark:text-violet-400 mb-1 block">
              Tool Call
            </span>
            <pre className="whitespace-pre-wrap wrap-break-word text-sm text-violet-900 dark:text-violet-200 font-mono">
              {command}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // User / tool result messages: show on the right
  if (role === "user") {
    const isToolResult = event.idx > 1;
    return (
      <div className="flex flex-col items-end gap-2 max-w-[85%] ml-auto">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {isToolResult ? "Result" : "User"}
        </span>
        <div className="rounded-xl rounded-tr-sm bg-zinc-100 px-4 py-3 shadow-sm border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700">
          <pre className="whitespace-pre-wrap wrap-break-word text-sm text-zinc-800 dark:text-zinc-200 font-mono">
            {text}
          </pre>
        </div>
      </div>
    );
  }

  // System messages: centered, muted
  return (
    <div className="flex flex-col items-center gap-2 max-w-[90%] mx-auto">
      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400">
        System
      </span>
      <div className="rounded-xl bg-amber-50 px-4 py-3 shadow-sm border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 w-full">
        <pre className="whitespace-pre-wrap wrap-break-word text-sm text-zinc-700 dark:text-zinc-300 font-mono">
          {text}
        </pre>
      </div>
    </div>
  );
}

/* ── section divider ────────────────────────────────────────────────── */

const VERDICT_BAR: Record<string, string> = {
  good: "bg-emerald-400 dark:bg-emerald-500",
  warning: "bg-amber-400 dark:bg-amber-500",
  failure: "bg-rose-400 dark:bg-rose-500",
};

function SectionDivider({ section, index }: { section: Section; index: number }) {
  const bar = VERDICT_BAR[section.verdict] ?? VERDICT_BAR.good;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`h-[3px] w-8 rounded-full ${bar}`} />
      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
        Section {index + 1} — {section.label}
      </span>
      <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
    </div>
  );
}

/* ── main message list ──────────────────────────────────────────────── */

export function MessageList({
  events,
  sections,
  selectedSectionIdx,
  registerSectionRef,
}: {
  events: Event[];
  sections: Section[];
  selectedSectionIdx: number;
  registerSectionRef: (sectionIndex: number, el: HTMLDivElement | null) => void;
}) {
  // Build section groups: which events belong to which section
  const groups: Array<{ section: Section | null; sectionIndex: number; events: Event[] }> = [];

  if (sections.length === 0) {
    // No analysis yet — show all events as one flat group
    groups.push({ section: null, sectionIndex: 0, events });
  } else {
    // Map events to sections by idx range
    const sortedSections = [...sections].sort((a, b) => a.start_idx - b.start_idx);

    // Events before the first section
    const beforeFirst = events.filter((e) => e.idx < sortedSections[0].start_idx);
    if (beforeFirst.length > 0) {
      groups.push({ section: null, sectionIndex: -1, events: beforeFirst });
    }

    for (let i = 0; i < sortedSections.length; i++) {
      const s = sortedSections[i];
      const sectionEvents = events.filter(
        (e) => e.idx >= s.start_idx && e.idx <= s.end_idx
      );
      groups.push({ section: s, sectionIndex: i, events: sectionEvents });
    }

    // Events after the last section
    const lastEnd = sortedSections[sortedSections.length - 1].end_idx;
    const afterLast = events.filter((e) => e.idx > lastEnd);
    if (afterLast.length > 0) {
      groups.push({ section: null, sectionIndex: sortedSections.length, events: afterLast });
    }
  }

  const refCallback = useCallback(
    (sectionIndex: number) => (el: HTMLDivElement | null) => {
      registerSectionRef(sectionIndex, el);
    },
    [registerSectionRef]
  );

  return (
    <div className="space-y-4 pb-20">
      {groups.map((group) => (
        <div
          key={group.section?.id ?? `ungrouped-${group.sectionIndex}`}
          ref={group.section ? refCallback(group.sectionIndex) : undefined}
        >
          {/* Section divider */}
          {group.section && (
            <SectionDivider section={group.section} index={group.sectionIndex} />
          )}

          {/* Messages */}
          <div className="space-y-4 py-2">
            {group.events.map((event) => (
              <MessageBubble key={`${event.run_id}-${event.idx}`} event={event} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
