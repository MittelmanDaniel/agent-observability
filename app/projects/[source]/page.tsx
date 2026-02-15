import Link from "next/link";
import { notFound } from "next/navigation";
import { listTaskSummaries } from "@/lib/store";
import { getProjectMeta } from "@/lib/projects";

function PassRateBar({ succeeded, total }: { succeeded: number; total: number }) {
  const pct = total > 0 ? Math.round((succeeded / total) * 100) : 0;
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-20 rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{pct}%</span>
    </div>
  );
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source: rawSource } = await params;
  const source = decodeURIComponent(rawSource);
  const meta = getProjectMeta(source);
  const tasks = await listTaskSummaries(source);
  if (tasks.length === 0) notFound();

  const isTrace = source === "trace";
  const totalRuns = tasks.reduce((s, t) => s + t.runs, 0);
  const totalSucceeded = tasks.reduce((s, t) => s + t.succeeded, 0);
  const totalFailed = tasks.reduce((s, t) => s + t.failed, 0);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          ← Projects
        </Link>

        <header className="mt-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{meta.icon}</span>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {meta.displayName}
            </h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {meta.description}
          </p>
          <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            {tasks.length} tasks · {totalRuns} runs ·{" "}
            <span className="text-emerald-600 dark:text-emerald-400">{totalSucceeded} passed</span> ·{" "}
            <span className="text-rose-600 dark:text-rose-400">{totalFailed} failed</span>
          </p>
        </header>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/50">
                <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Task</th>
                <th className="px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400">Runs</th>
                <th className="px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400">Passed</th>
                <th className="px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400">Failed</th>
                {isTrace && (
                  <th className="px-3 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400">Reward Hack</th>
                )}
                <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Pass Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {tasks.map((task) => (
                <tr
                  key={task.task}
                  className="transition hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/projects/${encodeURIComponent(source)}/tasks/${encodeURIComponent(task.task)}`}
                      className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 hover:underline"
                    >
                      {task.task}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {task.runs}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                    {task.succeeded}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-rose-600 dark:text-rose-400">
                    {task.failed}
                  </td>
                  {isTrace && (
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-amber-600 dark:text-amber-400">
                      {task.reward_hacking || "—"}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <PassRateBar succeeded={task.succeeded} total={task.runs} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
