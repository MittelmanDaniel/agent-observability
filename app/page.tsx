import Link from "next/link";
import { listProjects } from "@/lib/store";
import { getProjectMeta } from "@/lib/projects";

export default async function Home() {
  const projects = await listProjects();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Agent Observability
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Select a project to explore agent trajectories.
        </p>

        {projects.length === 0 ? (
          <div className="mt-10 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            No projects yet. Seed some data to get started.
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {projects.map((project) => {
              const meta = getProjectMeta(project.source);
              return (
                <Link
                  key={project.source}
                  href={`/projects/${encodeURIComponent(project.source)}`}
                  className={`
                    group relative flex flex-col rounded-xl border-2 px-6 py-5
                    transition-all hover:shadow-lg hover:-translate-y-0.5
                    ${meta.accentBorder} ${meta.accent}
                  `}
                >
                  {/* Icon + name */}
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{meta.icon}</span>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      {meta.displayName}
                    </h2>
                  </div>

                  {/* Description */}
                  <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {meta.description}
                  </p>

                  {/* Stats row */}
                  <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium">
                    <span className="rounded-full bg-zinc-200/70 px-2.5 py-1 text-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-300">
                      {project.tasks} tasks
                    </span>
                    <span className="rounded-full bg-zinc-200/70 px-2.5 py-1 text-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-300">
                      {project.runs} runs
                    </span>
                    {project.succeeded > 0 && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {project.succeeded} succeeded
                      </span>
                    )}
                    {project.failed > 0 && (
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                        {project.failed} failed
                      </span>
                    )}
                    {project.reward_hacking > 0 && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {project.reward_hacking} reward hacking
                      </span>
                    )}
                  </div>

                  {/* Arrow */}
                  <span className="absolute right-5 top-5 text-zinc-300 transition-transform group-hover:translate-x-1 dark:text-zinc-600">
                    →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
