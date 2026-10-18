import type { McpServerConfig, McpServerDraft } from "../types/mcp";
import { MCP_REDACTED_VALUE, normalizeMcpServerDraft } from "./mcp-config";

/** Preserve unresolved device credential markers while editing portable definitions. */
export function normalizeStoredMcpDraft(
  draft: McpServerDraft,
  current: McpServerConfig,
): McpServerConfig {
  const server = normalizeMcpServerDraft(draft);
  if (draft.name === current.name) server.name = current.name;
  for (const field of ["env", "headers"] as const) {
    for (const [key, value] of Object.entries(draft[field] ?? {})) {
      if (
        value !== MCP_REDACTED_VALUE ||
        current[field]?.[key] !== MCP_REDACTED_VALUE
      )
        continue;
      Object.defineProperty((server[field] ??= {}), key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return server;
}
