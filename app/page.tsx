import Link from "next/link";
import { listTaskSummaries } from "@/lib/store";

export default async function Home() {
  const tasks = await listTaskSummaries();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Agent Observability
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Click a task to investigate multiple runs.
        </p>
        <ul className="mt-6 space-y-2">
          {tasks.length === 0 ? (
            <li className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              No tasks yet.
            </li>
          ) : (
            tasks.map((task) => (
              <li key={task.task}>
                <Link
                  href={`/tasks/${encodeURIComponent(task.task)}`}
                  className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {task.task}
                  </span>
                  <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {task.runs} runs
                  </span>
                  <span className="mt-1 block text-xs text-zinc-400 dark:text-zinc-500">
                    {task.succeeded} succeeded · {task.failed} failed
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </main>
    </div>
  );
}
