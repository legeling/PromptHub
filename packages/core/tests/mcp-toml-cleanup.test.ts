import { expect, it } from "vitest";
import {
  mergeCodexMcpToml,
  removeCodexMcpTomlServers,
} from "@prompthub/shared/utils/mcp-config";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
it("removes complete managed blocks and preserves unrelated sections and trailing comments", () => {
  const server: McpServerConfig = {
    id: "fixture",
    name: "docs",
    displayName: "Docs",
    transport: "stdio",
    command: "node",
    enabled: true,
    source: { type: "manual" },
    createdAt: 0,
    updatedAt: 0,
  };
  const original =
    'model = "fixture"\n\n[mcp_servers.unrelated]\ncommand = "keep"\n# keep user comment\n';
  let current = original;
  const cycleCount = 3;
  for (let cycle = 0; cycle < cycleCount; cycle++) {
    current = mergeCodexMcpToml(current, [server]);
    current = removeCodexMcpTomlServers(current, ["docs"]);
    expect(current.trimEnd()).toBe(original.trimEnd());
    expect(current).not.toContain("PromptHub MCP managed block");
  }
});
