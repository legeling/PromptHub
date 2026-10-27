import type { ManagedAgentSummary, RuleFileDescriptor } from "../types";

export function normalizeAgentRulePath(filePath: string | undefined): string {
  const normalized = (filePath ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  return /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("//")
    ? normalized.toLowerCase()
    : normalized;
}

/** Shared native files have one Rules record even when multiple Agents consume them. */
export function findAgentGlobalRule(
  agent: ManagedAgentSummary,
  files: RuleFileDescriptor[],
): RuleFileDescriptor | null {
  const expectedPath = normalizeAgentRulePath(agent.paths.rules);
  const globalFiles = files.filter((file) => !file.id.startsWith("project:"));
  const pathMatch = expectedPath
    ? globalFiles.find(
        (file) => normalizeAgentRulePath(file.path) === expectedPath,
      )
    : undefined;
  if (pathMatch) return pathMatch;
  const expectedPlatformId = agent.isCustom ? `custom:${agent.id}` : agent.id;
  return (
    globalFiles.find((file) => file.platformId === expectedPlatformId) ?? null
  );
}
