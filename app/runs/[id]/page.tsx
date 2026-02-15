import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvents, getRun, getSections } from "@/lib/store";
import { RunViewer } from "./run-viewer";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();
  const events = await getEvents(id);
  const sections = await getSections(id);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Link
          href={`/tasks/${encodeURIComponent(run.task)}`}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          ← Task runs
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {run.task}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {run.source} · {run.status} · {run.started_at}
          </p>
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
