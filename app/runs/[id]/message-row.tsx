"use client";

import dynamic from "next/dynamic";

// Client-only markdown to avoid hydration mismatch
const Markdown = dynamic(() => import("react-markdown"), { ssr: false });

const ROLE_STYLES: Record<string, string> = {
  system:
    "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30",
  ai: "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30",
  tool_call:
    "border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30",
  user:
    "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900",
};

const ROLE_LABEL_STYLES: Record<string, string> = {
  system:
    "bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200",
  ai: "bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  tool_call:
    "bg-violet-200 text-violet-800 dark:bg-violet-800 dark:text-violet-200",
  user:
    "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
};

/**
 * SWE-agent AI messages follow the pattern:
 *   [discussion text]
 *   ```
 *   [command]
 *   ```
 *
 * This splits them into { thought, command }.
 */
function splitAiMessage(text: string): { thought: string; command: string | null } {
  // Find the last ``` ... ``` block — that's the command
  const lines = text.split("\n");
  let lastOpenIdx = -1;
  let lastCloseIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```") {
      if (lastOpenIdx === -1 || lastCloseIdx !== -1) {
        // Start of a new code fence
        lastOpenIdx = i;
        lastCloseIdx = -1;
      } else {
        // Close of the current code fence
        lastCloseIdx = i;
      }
    }
  }

  if (lastOpenIdx !== -1 && lastCloseIdx !== -1 && lastCloseIdx > lastOpenIdx) {
    const thought = lines.slice(0, lastOpenIdx).join("\n").trimEnd();
    const command = lines.slice(lastOpenIdx + 1, lastCloseIdx).join("\n").trim();
    return { thought, command: command || null };
  }

  return { thought: text, command: null };
}

export function MessageRow({
  event,
}: {
  event: {
    idx: number;
    ts: string;
    type: string;
    actor: string;
    content: string;
  };
}) {
  const role = event.type || "unknown";
  let messageText = event.content;

  try {
    const obj = JSON.parse(event.content) as Record<string, unknown>;
    const text =
      typeof obj.system_prompt === "string" && obj.system_prompt
        ? obj.system_prompt
        : typeof obj.text === "string" && obj.text
          ? obj.text
          : null;
    if (text) {
      messageText = text;
    }
  } catch {
    // not JSON, show as-is
  }

  // For AI messages, split into thought + command
  if (role === "ai") {
    const { thought, command } = splitAiMessage(messageText);
    const borderAi = ROLE_STYLES.ai;
    const labelAi = ROLE_LABEL_STYLES.ai;
    const borderCmd = ROLE_STYLES.tool_call;
    const labelCmd = ROLE_LABEL_STYLES.tool_call;

    return (
      <>
        {/* Thought bubble */}
        {thought && (
          <li className={`rounded-lg border px-4 py-3 ${borderAi}`}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                [{event.idx}]
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${labelAi}`}
              >
                ai
              </span>
            </div>
            <div className="mt-2 prose prose-sm dark:prose-invert max-w-none wrap-break-word">
              <Markdown>{thought}</Markdown>
            </div>
          </li>
        )}

        {/* Command / tool call */}
        {command && (
          <li className={`rounded-lg border px-4 py-3 ${borderCmd}`}>
            <div className="flex items-center gap-2">
              {!thought && (
                <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                  [{event.idx}]
                </span>
              )}
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${labelCmd}`}
              >
                tool call
              </span>
            </div>
            <pre className="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-violet-900 dark:text-violet-200 font-mono">
              {command}
            </pre>
          </li>
        )}
      </>
    );
  }

  // For user messages (environment / tool results), label accordingly
  const isToolResult = role === "user" && event.idx > 1;
  const displayRole = isToolResult ? "tool result" : role;
  const borderStyle = ROLE_STYLES[role] ?? ROLE_STYLES.user;
  const labelStyle = ROLE_LABEL_STYLES[role] ?? ROLE_LABEL_STYLES.user;

  return (
    <li className={`rounded-lg border px-4 py-3 ${borderStyle}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
          [{event.idx}]
        </span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${labelStyle}`}
        >
          {displayRole}
        </span>
      </div>
      <pre className="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-zinc-800 dark:text-zinc-200 font-mono">
        {messageText}
      </pre>
    </li>
  );
}
