"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import type { Event, Section } from "@/lib/types";

const Markdown = dynamic(() => import("react-markdown"), { ssr: false });

/* ── helpers ────────────────────────────────────────────────────────── */

function extractText(event: Event): string {
  try {
    const obj = JSON.parse(event.content) as Record<string, unknown>;
    // SWE-agent / Modal: content can be string or array of blocks [{ type: "text", text: "..." }]
    if (typeof obj.content === "string" && obj.content) return obj.content;
    if (Array.isArray(obj.content)) {
      const parts = (obj.content as Array<{ type?: string; text?: string }>)
        .filter((b) => b && typeof b.text === "string")
        .map((b) => b.text as string);
      if (parts.length) return parts.join("\n\n");
    }
    if (typeof obj.system_prompt === "string" && obj.system_prompt) return obj.system_prompt;
    if (typeof obj.text === "string" && obj.text) return obj.text;
    // Modal/SWE-agent agent steps: content often empty, action + thought hold the useful part
    if (typeof obj.action === "string" && obj.action) {
      const thought =
        typeof obj.thought === "string" && obj.thought.trim()
          ? `Thought: ${obj.thought.trim()}\n\n`
          : "";
      return `${thought}Action: ${obj.action}`;
    }
    // Tool results / observations
    if (typeof obj.output === "string" && obj.output) return obj.output;
    if (typeof obj.observation === "string" && obj.observation) return obj.observation;
  } catch {
    // not JSON
  }
  return event.content;
}

/** True if event is typed "system" but content is env feedback / tool result, not a prompt. */
function isObservationLike(event: Event): boolean {
  const raw = event.content.trim();
  if (raw.startsWith("OBSERVATION:") || raw.startsWith("Observation:")) return true;
  try {
    const obj = JSON.parse(event.content) as Record<string, unknown>;
    if (typeof obj.observation === "string" || typeof obj.output === "string") return true;
  } catch {
    // not JSON
  }
  return false;
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

/**
 * Group events so that consecutive tool_call + tool_result pairs
 * become a single render item. Everything else stays individual.
 */
type RenderItem =
  | { kind: "event"; event: Event }
  | { kind: "tool_pair"; call: Event; result: Event };

function groupToolPairs(events: Event[]): RenderItem[] {
  const items: RenderItem[] = [];
  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    // If this is a tool_call followed by a tool_result, pair them
    if (
      ev.type === "tool_call" &&
      i + 1 < events.length &&
      events[i + 1].type === "tool_result"
    ) {
      items.push({ kind: "tool_pair", call: ev, result: events[i + 1] });
      i += 2;
    } else {
      items.push({ kind: "event", event: ev });
      i += 1;
    }
  }
  return items;
}

/* ── combined tool call + result block ─────────────────────────────── */

function ToolBlock({ call, result }: { call: Event; result: Event }) {
  const toolName = call.actor || "Tool";
  const callText = extractText(call);
  const resultText = extractText(result);

  return (
    <div className="max-w-[90%] rounded-xl overflow-hidden shadow-sm border border-violet-200 dark:border-violet-800/60">
      {/* Top: tool call */}
      <div className="bg-violet-50 px-4 py-3 dark:bg-violet-950/40">
        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500 dark:text-violet-400 mb-1.5 block">
          {toolName}
        </span>
        <pre className="whitespace-pre-wrap wrap-break-word text-sm text-violet-900 dark:text-violet-200 font-mono leading-relaxed">
          {callText}
        </pre>
      </div>
      {/* Divider */}
      <div className="h-px bg-violet-200 dark:bg-violet-800/60" />
      {/* Bottom: result */}
      <div className="bg-zinc-50 px-4 py-3 dark:bg-zinc-800/60 max-h-72 overflow-y-auto">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 block">
          Output
        </span>
        <pre className="whitespace-pre-wrap wrap-break-word text-sm text-zinc-700 dark:text-zinc-300 font-mono leading-relaxed">
          {resultText}
        </pre>
      </div>
    </div>
  );
}

/* ── single message bubble ──────────────────────────────────────────── */

function MessageBubble({ event, isFirstContext }: { event: Event; isFirstContext?: boolean }) {
  const role = event.type || "user";
  const text = extractText(event);

  // Agent messages: show on the left with blue accent
  if (role === "ai" || role === "assistant") {
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

        {/* Command (SWE-Agent style inline tool call) */}
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

  // Standalone tool_call (no paired result — rare)
  if (role === "tool_call") {
    const toolName = event.actor || "Tool";
    return (
      <div className="max-w-[90%] rounded-xl overflow-hidden shadow-sm border border-violet-200 dark:border-violet-800/60">
        <div className="bg-violet-50 px-4 py-3 dark:bg-violet-950/40">
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500 dark:text-violet-400 mb-1.5 block">
            {toolName}
          </span>
          <pre className="whitespace-pre-wrap wrap-break-word text-sm text-violet-900 dark:text-violet-200 font-mono leading-relaxed">
            {text}
          </pre>
        </div>
      </div>
    );
  }

  // Standalone tool_result (no paired call — rare)
  if (role === "tool_result") {
    return (
      <div className="max-w-[90%] rounded-xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-700">
        <div className="bg-zinc-50 px-4 py-3 dark:bg-zinc-800/60 max-h-72 overflow-y-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 block">
            Output
          </span>
          <pre className="whitespace-pre-wrap wrap-break-word text-sm text-zinc-700 dark:text-zinc-300 font-mono leading-relaxed">
            {text}
          </pre>
        </div>
      </div>
    );
  }

  // User messages: show on the right
  // For SWE-Agent data, "user" events after idx 1 are actually tool outputs
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

  // "system" type from trajectories: either env observation (tool-like) or task/context (not LLM system prompt)
  if (role === "system") {
    if (isObservationLike(event)) {
      const displayText = /^observation:\s*/i.test(text) ? text.replace(/^observation:\s*/i, "").trim() : text;
      return (
        <div className="max-w-[90%] rounded-xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-700 mx-auto">
          <div className="bg-zinc-50 px-4 py-3 dark:bg-zinc-800/60 max-h-72 overflow-y-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 block">
              Observation
            </span>
            <pre className="whitespace-pre-wrap wrap-break-word text-sm text-zinc-700 dark:text-zinc-300 font-mono leading-relaxed">
              {displayText}
            </pre>
          </div>
        </div>
      );
    }
    // First context block = system prompt / task setup — make it stand out
    if (isFirstContext) {
      return (
        <div className="flex flex-col items-center gap-2 max-w-[90%] mx-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            System prompt
          </span>
          <div className="rounded-xl bg-amber-50/80 px-4 py-3 shadow-sm border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/60 w-full">
            <pre className="whitespace-pre-wrap wrap-break-word text-sm text-zinc-700 dark:text-zinc-300 font-mono">
              {text}
            </pre>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-2 max-w-[90%] mx-auto">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Context
        </span>
        <div className="rounded-xl bg-zinc-50 px-4 py-3 shadow-sm border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 w-full">
          <pre className="whitespace-pre-wrap wrap-break-word text-sm text-zinc-700 dark:text-zinc-300 font-mono">
            {text}
          </pre>
        </div>
      </div>
    );
  }

  // Other / unknown role
  return (
    <div className="flex flex-col items-center gap-2 max-w-[90%] mx-auto">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {role}
      </span>
      <div className="rounded-xl bg-zinc-50 px-4 py-3 shadow-sm border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 w-full">
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

  // First context block in this run (system-type, not observation) — we style it as "System prompt"
  const firstContextIdx =
    events.length > 0
      ? (() => {
          const candidates = events.filter(
            (e) => e.type === "system" && !isObservationLike(e)
          );
          if (candidates.length === 0) return null;
          return Math.min(...candidates.map((e) => e.idx));
        })()
      : null;

  const refCallback = useCallback(
    (sectionIndex: number) => (el: HTMLDivElement | null) => {
      registerSectionRef(sectionIndex, el);
    },
    [registerSectionRef]
  );

  return (
    <div className="space-y-4 pb-20">
      {groups.map((group) => {
        const renderItems = groupToolPairs(group.events);
        return (
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
              {renderItems.map((item) =>
                item.kind === "tool_pair" ? (
                  <ToolBlock
                    key={`${item.call.run_id}-${item.call.idx}`}
                    call={item.call}
                    result={item.result}
                  />
                ) : (
                  <MessageBubble
                    key={`${item.event.run_id}-${item.event.idx}`}
                    event={item.event}
                    isFirstContext={
                      item.event.type === "system" &&
                      !isObservationLike(item.event) &&
                      item.event.idx === firstContextIdx
                    }
                  />
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
