import Link from "next/link";
import { notFound } from "next/navigation";
import { getRunsByTask } from "@/lib/store";
import { getProjectMeta } from "@/lib/projects";
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
        </header>

        <RunsTable runs={runs} task={task} source={source} />
      </main>
    </div>
  );
}
