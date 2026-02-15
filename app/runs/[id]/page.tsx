import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvents, getRun, getSections } from "@/lib/store";
import { getProjectMeta } from "@/lib/projects";
import { findSimilarRuns } from "@/lib/analyze";
import { RunViewer } from "./run-viewer";

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { id } = await params;
  const { source: sourceParam } = await searchParams;
  const run = await getRun(id);
  if (!run) notFound();
  const [events, sections, similarRuns] = await Promise.all([
    getEvents(id),
    getSections(id),
    findSimilarRuns(id, 8),
  ]);

  const source = sourceParam ?? run.source;
  const meta = getProjectMeta(source);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-7xl px-4 py-8">
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
          <Link
            href={`/projects/${encodeURIComponent(source)}/tasks/${encodeURIComponent(run.task)}`}
            className="hover:text-zinc-700 dark:hover:text-zinc-300 truncate max-w-xs"
          >
            Task
          </Link>
          <span>›</span>
          <span className="text-zinc-400 dark:text-zinc-500 truncate max-w-[120px]">
            {run.id}
          </span>
        </nav>

        <header className="mt-4 mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {run.task}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {meta.displayName}
            {run.model_name && <> · <span className="text-zinc-700 dark:text-zinc-300 font-medium">{run.model_name}</span></>}
            {" · "}{run.status}
            {run.exit_status && <> · <span className="text-zinc-400 dark:text-zinc-500">{run.exit_status}</span></>}
          </p>
          {run.source === "trace" && run.trace_label_description && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 dark:border-rose-800 dark:bg-rose-950/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 dark:text-rose-400">
                TRACE Label
              </span>
              <span className="text-xs text-rose-700 dark:text-rose-300">
                {run.trace_label_description}
              </span>
            </div>
          )}
        </header>

        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Find similar runs
          </h2>
          {similarRuns.length > 0 ? (
            <>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Runs with similar trajectory summaries (Jina embedding, same task).
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {similarRuns.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/runs/${encodeURIComponent(r.id)}?source=${encodeURIComponent(r.source)}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      <span className="font-medium">{r.status}</span>
                      {r.model_name && (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {r.model_name}
                        </span>
                      )}
                      <span className="truncate max-w-[140px] text-zinc-500 dark:text-zinc-400">
                        {r.id}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Analyze this run (Sections block below) to compute its embedding; similar runs will appear here.
            </p>
          )}
        </div>

        <RunViewer
          runId={id}
          events={events}
          initialSections={sections}
        />
      </main>
    </div>
  );
}
