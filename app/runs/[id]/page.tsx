import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvents, getRun, getSections } from "@/lib/store";
import { MessageRow } from "./message-row";
import { AnalyzeButton } from "./analyze-button";

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
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link
          href={`/tasks/${encodeURIComponent(run.task)}`}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          ← Task runs
        </Link>
        <header className="mt-4">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {run.task}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {run.source} · {run.status} · {run.started_at}
          </p>
        </header>

        {/* Sections (analysis) */}
        <section className="mt-8">
          <AnalyzeButton runId={id} initialSections={sections} />
        </section>

        {/* Raw timeline */}
        <section className="mt-8">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Timeline ({events.length} events)
          </h2>
          <ol className="mt-3 space-y-3">
            {events.map((event) => (
              <MessageRow key={`${event.idx}-${event.ts}`} event={event} />
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
