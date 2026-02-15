/** Static metadata for known project sources. */

export interface ProjectMeta {
  displayName: string;
  description: string;
  /** Tailwind border + bg accent classes */
  accent: string;
  accentBorder: string;
  icon: string; // emoji
}

const PROJECT_META: Record<string, ProjectMeta> = {
  custom: {
    displayName: "SWE-Agent",
    description:
      "Software engineering agent trajectories from the Nebius SWE-agent benchmark — real bug-fixing sessions on open-source repos.",
    accent: "bg-blue-50 dark:bg-blue-950/30",
    accentBorder: "border-blue-300 dark:border-blue-700",
    icon: "🔧",
  },
  trace: {
    displayName: "TRACE",
    description:
      "Reward hacking detection dataset from PatronusAI — agent trajectories labeled for specification gaming, reward tampering, sycophancy, and sandbagging.",
    accent: "bg-amber-50 dark:bg-amber-950/30",
    accentBorder: "border-amber-300 dark:border-amber-700",
    icon: "🔍",
  },
};

const DEFAULT_META: ProjectMeta = {
  displayName: "Unknown",
  description: "Agent trajectory data.",
  accent: "bg-zinc-50 dark:bg-zinc-900",
  accentBorder: "border-zinc-300 dark:border-zinc-700",
  icon: "📁",
};

export function getProjectMeta(source: string): ProjectMeta {
  return PROJECT_META[source] ?? { ...DEFAULT_META, displayName: source };
}
