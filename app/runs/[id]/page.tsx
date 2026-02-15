import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvents, getRun, getSections } from "@/lib/store";
import { getProjectMeta } from "@/lib/projects";
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
  const events = await getEvents(id);
  const sections = await getSections(id);

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

        <RunViewer
          runId={id}
          events={events}
          initialSections={sections}
        />
      </main>
    </div>
  );
}
