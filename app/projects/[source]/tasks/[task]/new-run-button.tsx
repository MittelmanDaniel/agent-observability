"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Model IDs are passed to SWE-agent as --agent.model.name; SWE-agent uses litellm.
// These match litellm's completion(model=...) names (see docs.litellm.ai OpenAI + Anthropic).
const MODELS = [
  // OpenAI — litellm OpenAI chat completion table
  { id: "gpt-5", label: "GPT-5", provider: "OpenAI" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI" },
  { id: "gpt-5-nano", label: "GPT-5 Nano", provider: "OpenAI" },
  { id: "gpt-5.2", label: "GPT-5.2", provider: "OpenAI" },
  { id: "gpt-5.2-pro", label: "GPT-5.2 Pro", provider: "OpenAI" },
  { id: "gpt-5-pro", label: "GPT-5 Pro", provider: "OpenAI" },
  { id: "gpt-5-chat-latest", label: "GPT-5 Chat (latest)", provider: "OpenAI" },
  { id: "o4-mini", label: "o4-mini", provider: "OpenAI" },
  { id: "o3-mini", label: "o3-mini", provider: "OpenAI" },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "OpenAI" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "OpenAI" },
  // Anthropic — litellm Anthropic supported models table
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "Anthropic" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5", provider: "Anthropic" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4", provider: "Anthropic" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "Anthropic" },
  { id: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet", provider: "Anthropic" },
  { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", provider: "Anthropic" },
];

export function NewRunButton({ task }: { task: string }) {
  const router = useRouter();
  const [model, setModel] = useState(MODELS[0].id);
  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function handleRun() {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/swe-agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, model }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("done");
        const shortId = data.run_id
          ? `...${String(data.run_id).slice(-8)}`
          : "";
        setMessage(`Queued ${shortId}. It will appear below once complete.`);
        // Refresh page data so the "running" placeholder shows up
        setTimeout(() => router.refresh(), 1500);
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to queue run");
      }
    } catch (e) {
      setStatus("error");
      setMessage(String(e));
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        New SWE-Agent run
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Launch a new SWE-agent run on Modal with a chosen model.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.provider})
            </option>
          ))}
        </select>

        <button
          onClick={handleRun}
          disabled={status === "loading"}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {status === "loading" ? (
            <>
              <svg
                className="h-3.5 w-3.5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Queuing&hellip;
            </>
          ) : (
            <>
              <svg
                className="h-3.5 w-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              Run SWE-Agent
            </>
          )}
        </button>
      </div>

      {message && (
        <p
          className={`mt-2 text-xs ${
            status === "error"
              ? "text-rose-600 dark:text-rose-400"
              : status === "done"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-500"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
