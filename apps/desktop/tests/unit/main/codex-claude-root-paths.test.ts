/** @vitest-environment node */
import path from "node:path";
import { expect, it } from "vitest";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import { getMcpTargetPresets, buildManagedAgents } from "@prompthub/core";
import {
  buildCliManagedAgentInventory,
} from "@prompthub/core/agent-management/agent-inventory";

it("keeps CLI inventory and presets aligned for default, environment and explicit Claude roots", async () => {
  const platform = getPlatformById("claude");
  if (!platform) throw new Error("Missing Claude platform");
  const home = path.resolve("/tmp/claude-inventory-home");
  const selected = path.join(home, "selected");
  const inherited = path.join(home, "inherited");
  const cases = [
    {
      environment: { HOME: home },
      overrides: {},
      root: path.join(home, ".claude"),
      mcp: path.join(home, ".claude.json"),
    },
    {
      environment: { HOME: home, CLAUDE_CONFIG_DIR: inherited },
      overrides: {},
      root: inherited,
      mcp: path.join(inherited, ".claude.json"),
    },
    {
      environment: { HOME: home, CLAUDE_CONFIG_DIR: inherited },
      overrides: { claude: { rootPath: selected } },
      root: selected,
      mcp: path.join(selected, ".claude.json"),
    },
  ];
  for (const entry of cases) {
    const [agent] = await buildCliManagedAgentInventory(
      [platform],
      {
        builtinAgentOverrides: entry.overrides,
        customAgents: [],
        disabledPlatformIds: [],
        agentIdentityPreferences: {},
      },
      {
        environment: entry.environment,
        platform: "darwin",
        pathExists: async () => false,
      },
    );
    expect(agent.paths.root).toBe(entry.root);
    expect(agent.paths.mcp).toBe(entry.mcp);
    expect(
      getMcpTargetPresets(
        home,
        "darwin",
        entry.environment,
        entry.overrides,
      ).find((preset) => preset.id === "claude")?.path,
    ).toBe(entry.mcp);
  }
});

it("preserves an explicit MCP relative-path override under the selected Claude root", () => {
  const home = path.resolve("/tmp/claude-inventory-home");
  const selected = path.join(home, "selected");
  expect(
    getMcpTargetPresets(
      home,
      "darwin",
      { CLAUDE_CONFIG_DIR: path.join(home, "inherited") },
      {
        claude: { rootPath: selected, mcpRelativePath: "custom/mcp.json" },
      },
    ).find((preset) => preset.id === "claude")?.path,
  ).toBe(path.join(selected, "custom", "mcp.json"));
});

it("keeps a current user override authoritative over an older resolved inventory root", () => {
  const platform = getPlatformById("claude");
  if (!platform) throw new Error("Missing Claude platform");
  const [agent] = buildManagedAgents({
    platforms: [{ ...platform, resolvedRootPath: "/previous/claude" }],
    detectedPlatformIds: [],
    pinnedPlatformIds: [],
    osKey: "darwin",
    builtinOverrides: { claude: { rootPath: "/selected/claude" } },
  });
  expect(agent.paths.root).toBe("/selected/claude");
  expect(agent.paths.mcp).toBe("/selected/claude/.claude.json");
});
