import type { McpTargetStatusEntry } from "../types/mcp";

export function mergeMcpTargetObservations(
  previous: McpTargetStatusEntry[],
  next: McpTargetStatusEntry[],
): McpTargetStatusEntry[] {
  return next.map((entry) => {
    const last = previous.find((value) => value.presetId === entry.presetId);
    return entry.error && last ? { ...last, error: entry.error } : entry;
  });
}
