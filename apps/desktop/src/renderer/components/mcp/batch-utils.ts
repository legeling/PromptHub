import type { McpServerConfig } from "@prompthub/shared/types/mcp";

export type McpBatchTagMode = "add" | "remove";

export function normalizeMcpTag(input: string): string {
  return input.trim().toLowerCase();
}

export function updateMcpTags(
  currentTags: string[] | undefined,
  tag: string,
  mode: McpBatchTagMode,
): string[] {
  const normalized = normalizeMcpTag(tag);
  const existing = currentTags || [];

  if (!normalized) {
    return existing;
  }

  if (mode === "add") {
    return existing.includes(normalized) ? existing : [...existing, normalized];
  }

  return existing.filter((item) => item !== normalized);
}

export function collectMcpTags(servers: McpServerConfig[]): string[] {
  return Array.from(
    new Set(
      servers
        .flatMap((server) => server.tags || [])
        .filter((tag) => tag.trim()),
    ),
  ).sort((left, right) => left.localeCompare(right));
}
