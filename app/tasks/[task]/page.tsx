import Link from "next/link";
import { notFound } from "next/navigation";
import { getRunsByTask } from "@/lib/store";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ task: string }>;
}) {
  const { task: rawTask } = await params;
  const task = decodeURIComponent(rawTask);
  const runs = await getRunsByTask(task);
  if (runs.length === 0) notFound();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          ← Tasks
        </Link>
        <header className="mt-4">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {task}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {runs.length} runs for this task
          </p>
        </header>

        <ul className="mt-6 space-y-2">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/runs/${run.id}`}
                className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                  {run.id}
                </span>
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${
                    run.status === "succeeded"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : run.status === "reward_hacking"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                  }`}
                >
                  {run.status}
                </span>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {run.source} · {run.started_at}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
