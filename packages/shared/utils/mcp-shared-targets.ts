import type { McpTargetPreset } from "../types/mcp";

export const SHARED_MCP_PRESET_ID = "pi-agents-nested";
export const SHARED_MCP_RELATIVE_PATH = ".agents/mcp/mcp.json";

export function isSharedMcpTargetPreset(
  preset: Pick<McpTargetPreset, "id" | "scope">,
): boolean {
  return preset.scope === "global" && preset.id === SHARED_MCP_PRESET_ID;
}

export function getSharedMcpConfigPath(
  preset: Pick<McpTargetPreset, "id" | "scope">,
): string | undefined {
  return isSharedMcpTargetPreset(preset)
    ? `~/${SHARED_MCP_RELATIVE_PATH}`
    : undefined;
}
