/**
 * Parse a SWE-bench task ID to extract GitHub info.
 * Format: {owner}__{repo}-{pr_number}
 * Example: networkx__networkx-7024 → networkx/networkx PR #7024
 */
export function parseSWEBenchTask(taskId: string): {
  owner: string;
  repo: string;
  number: string;
  url: string;
} | null {
  const parts = taskId.split("-");
  if (parts.length < 2) return null;

  const number = parts[parts.length - 1];
  const repoPath = parts.slice(0, -1).join("-");
  const [owner, repo] = repoPath.split("__");

  if (!owner || !repo || !number) return null;

  return {
    owner,
    repo,
    number,
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}

/**
 * Get a human-readable description for common SWE-bench tasks.
 * For now, just returns a generic description based on the task ID.
 * Could be enhanced to fetch from GitHub API or a local mapping.
 */
export function getSWEBenchDescription(taskId: string): string | null {
  const parsed = parseSWEBenchTask(taskId);
  if (!parsed) return null;

  return `Fix for ${parsed.repo} issue tracked in PR #${parsed.number}`;
}
