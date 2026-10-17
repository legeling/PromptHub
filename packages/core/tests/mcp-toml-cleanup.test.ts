import { expect, it } from "vitest";
import {
  mergeCodexMcpToml,
  removeCodexMcpTomlServers,
} from "@prompthub/shared/utils/mcp-config";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
it("preserves unselected managed servers and their native options on sequential distribution", () => {
  const server: McpServerConfig = {
    id: "one",
    name: "context7",
    displayName: "Context7",
    transport: "streamable-http",
    url: "https://mcp.context7.com/mcp",
    enabled: true,
    source: { type: "manual" },
    createdAt: 0,
    updatedAt: 0,
  };
  const sibling = { ...server, id: "two", name: "docs.local" };
  let current = mergeCodexMcpToml('model = "fixture"\n', [server]);
  current = current.replace(
    "[mcp_servers.context7]",
    "[mcp_servers.context7]\n# native setting\nstartup_timeout_sec = 45",
  );
  const original = current;
  current = mergeCodexMcpToml(current, [sibling]);
  current = mergeCodexMcpToml(current, [
    { ...sibling, url: "https://example.test/mcp" },
  ]);
  expect(current).toContain(
    "[mcp_servers.context7]\n# native setting\nstartup_timeout_sec = 45",
  );
  expect(current).toContain('url = "https://mcp.context7.com/mcp"');
  expect(current.match(/\[mcp_servers\."docs.local"\]/g)).toHaveLength(1);
  expect(current).toContain('url = "https://example.test/mcp"');
  expect(removeCodexMcpTomlServers(current, [sibling.name]).trimEnd()).toBe(
    original.trimEnd(),
  );
});
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
