import Link from "next/link";
import { notFound } from "next/navigation";
import { getRunsByTask } from "@/lib/store";
import { getProjectMeta } from "@/lib/projects";
import { parseSWEBenchTask } from "@/lib/github";
import { getRunClusters } from "@/lib/analyze";
import { RunsTable } from "./runs-table";

export default async function ProjectTaskPage({
  params,
}: {
  params: Promise<{ source: string; task: string }>;
}) {
  const { source: rawSource, task: rawTask } = await params;
  const source = decodeURIComponent(rawSource);
  const task = decodeURIComponent(rawTask);
  const meta = getProjectMeta(source);
  const runs = await getRunsByTask(task);
  if (runs.length === 0) notFound();

  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const failed = runs.filter((r) => r.status === "failed").length;

  // Parse GitHub info for SWE-bench tasks
  const githubInfo = source === "custom" ? parseSWEBenchTask(task) : null;

  // Cluster runs by Jina embedding similarity (only runs that have been analyzed)
  const clusters = await getRunClusters({ task, source });

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-zinc-700 dark:hover:text-zinc-300">
            Projects
          </Link>
          <span>›</span>
          <Link
            href={`/projects/${encodeURIComponent(source)}`}
            className="hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            {meta.displayName}
          </Link>
          <span>›</span>
          <span className="text-zinc-400 dark:text-zinc-500 truncate max-w-xs">
            Task
          </span>
        </nav>

        <header className="mt-4 mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {task}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {runs.length} runs in{" "}
            <span className="font-medium">{meta.displayName}</span>
            {" · "}
            <span className="text-emerald-600 dark:text-emerald-400">{succeeded} passed</span>
            {" · "}
            <span className="text-rose-600 dark:text-rose-400">{failed} failed</span>
          </p>
          {githubInfo && (
            <div className="mt-3 flex items-center gap-2">
              <a
                href={githubInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                View PR #{githubInfo.number} on GitHub
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {githubInfo.owner}/{githubInfo.repo}
              </span>
            </div>
          )}
        </header>

        {clusters.length > 0 && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Run clusters
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Analyzed runs only. Each group = runs whose trajectory summaries are similar (pairwise cosine ≥ 0.95). The table below is all runs for this task, not by cluster.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {clusters.map((c) => (
                <div
                  key={c.groupId}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    Group {c.groupId}
                  </span>
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    ({c.runs.length} run{c.runs.length !== 1 ? "s" : ""})
                  </span>
                  {c.summary && (
                    <p className="mt-1 text-xs italic text-zinc-600 dark:text-zinc-400">
                      {c.summary}
                    </p>
                  )}
                  <ul className="mt-1.5 flex flex-wrap gap-1">
                    {c.runIds.slice(0, 8).map((runId) => (
                      <li key={runId}>
                        <Link
                          href={`/runs/${encodeURIComponent(runId)}?source=${encodeURIComponent(source)}`}
                          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {runId.split("-").pop() ?? runId}
                        </Link>
                      </li>
                    ))}
                    {c.runIds.length > 8 && (
                      <li className="text-xs text-zinc-400">
                        +{c.runIds.length - 8} more
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        <RunsTable runs={runs} task={task} source={source} />
      </main>
    </div>
  );
}
