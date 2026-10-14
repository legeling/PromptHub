import { describe, expect, it } from "vitest";

import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { parseAgentManagementSettings } from "@prompthub/core/agent-management/agent-settings-contract";
import {
  ALL_AGENT_EDIT_PATH_FIELDS,
  buildBuiltinAgentPathOverride,
  getAgentEditPathFields,
} from "../../../src/renderer/services/agent-edit-adapter";

describe("Agent edit adapter", () => {
  it("uses the configured-root MCP declaration when saving Claude's root", () => {
    const platform = SKILL_PLATFORMS.find(({ id }) => id === "claude")!;
    const values = {
      skillsPath: "skills",
      rulesPath: "CLAUDE.md",
      mcpPath: platform.mcpRelativePath!,
      pluginsPath: "plugins/cache/prompthub",
      agentsPath: "",
      commandsPath: "",
      configPaths: "settings.json",
    };
    const override = buildBuiltinAgentPathOverride(
      platform,
      "/isolated/custom-claude",
      values,
    );
    expect(override.mcpRelativePath).toBe(
      platform.configuredRootMcpRelativePath,
    );
    expect(() =>
      parseAgentManagementSettings({
        builtinAgentOverrides: { claude: override },
      }),
    ).not.toThrow();
    const unsafe = buildBuiltinAgentPathOverride(
      platform,
      "/isolated/custom-claude",
      { ...values, mcpPath: "../other.json" },
    );
    expect(() =>
      parseAgentManagementSettings({
        builtinAgentOverrides: { claude: unsafe },
      }),
    ).toThrow("safe relative path");
  });

  it("maps every built-in Agent to exactly its canonical path declarations", () => {
    for (const platform of SKILL_PLATFORMS) {
      const expected = [
        ...(platform.skillsRelativePath ? ["skillsPath"] : []),
        ...(platform.globalRuleFile ? ["rulesPath"] : []),
        ...(platform.mcpRelativePath ? ["mcpPath"] : []),
        ...(platform.pluginsRelativePath ? ["pluginsPath"] : []),
        ...(platform.agentsRelativePath ? ["agentsPath"] : []),
        ...(platform.commandsRelativePath ? ["commandsPath"] : []),
        ...(platform.configFiles?.length ? ["configPaths"] : []),
      ];

      expect(getAgentEditPathFields({ platform }), platform.id).toEqual(
        expected,
      );
    }
  });

  it("does not invent a Skills path for the DeepSeek Harness profile model", () => {
    const platform = SKILL_PLATFORMS.find(
      ({ id }) => id === "deepseek-harness",
    )!;

    expect(getAgentEditPathFields({ platform })).toEqual([]);
  });

  it("keeps an explicit legacy override visible until the user clears it", () => {
    const platform = SKILL_PLATFORMS.find(({ id }) => id === "workbuddy")!;

    expect(
      getAgentEditPathFields({
        platform,
        values: { agentsPath: "legacy-agents" },
      }),
    ).toContain("agentsPath");
  });

  it("exposes the complete path schema for a custom Agent", () => {
    expect(getAgentEditPathFields({ isCustom: true })).toEqual(
      ALL_AGENT_EDIT_PATH_FIELDS,
    );
  });

  it("returns no built-in fields when the registry platform is unavailable", () => {
    expect(getAgentEditPathFields({})).toEqual([]);
  });

  it("builds a built-in override without undeclared empty path fields", () => {
    const platform = SKILL_PLATFORMS.find(({ id }) => id === "workbuddy")!;
    const override = buildBuiltinAgentPathOverride(platform, "~/.workbuddy", {
      skillsPath: "skills",
      rulesPath: "",
      mcpPath: "mcp.json",
      pluginsPath: "",
      agentsPath: "",
      commandsPath: "",
      configPaths: "mcp.json",
    });

    expect(override).toEqual({
      rootPath: "~/.workbuddy",
      skillsRelativePath: "skills",
      mcpRelativePath: "mcp.json",
      configRelativePaths: ["mcp.json"],
    });
  });

  it("preserves every explicit legacy field until it is cleared", () => {
    const platform = SKILL_PLATFORMS.find(({ id }) => id === "workbuddy")!;
    const override = buildBuiltinAgentPathOverride(platform, "~/.workbuddy", {
      skillsPath: "custom-skills",
      rulesPath: "LEGACY.md",
      mcpPath: "custom-mcp.json",
      pluginsPath: "legacy-plugins",
      agentsPath: "legacy-agents",
      commandsPath: "legacy-commands",
      configPaths: "first.json, , second.toml,",
    });

    expect(override).toEqual({
      rootPath: "~/.workbuddy",
      skillsRelativePath: "custom-skills",
      rulesRelativePath: "LEGACY.md",
      mcpRelativePath: "custom-mcp.json",
      pluginsRelativePath: "legacy-plugins",
      agentsRelativePath: "legacy-agents",
      commandsRelativePath: "legacy-commands",
      configRelativePaths: ["first.json", "second.toml"],
    });
  });
});
