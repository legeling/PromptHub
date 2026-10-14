import {
  getPlatformMcpRelativePath,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import type { BuiltinAgentOverrideConfig } from "@prompthub/shared/types";

export const ALL_AGENT_EDIT_PATH_FIELDS = [
  "skillsPath",
  "rulesPath",
  "mcpPath",
  "pluginsPath",
  "agentsPath",
  "commandsPath",
  "configPaths",
] as const;

export type AgentEditPathField = (typeof ALL_AGENT_EDIT_PATH_FIELDS)[number];

export type AgentEditPathValues = Record<AgentEditPathField, string>;

interface AgentEditPathFieldOptions {
  platform?: SkillPlatform;
  isCustom?: boolean;
  values?: Partial<AgentEditPathValues>;
}

function isDeclared(
  platform: SkillPlatform,
  field: AgentEditPathField,
): boolean {
  switch (field) {
    case "skillsPath":
      return Boolean(platform.skillsRelativePath);
    case "rulesPath":
      return Boolean(platform.globalRuleFile);
    case "mcpPath":
      return Boolean(platform.mcpRelativePath);
    case "pluginsPath":
      return Boolean(platform.pluginsRelativePath);
    case "agentsPath":
      return Boolean(platform.agentsRelativePath);
    case "commandsPath":
      return Boolean(platform.commandsRelativePath);
    case "configPaths":
      return Boolean(platform.configFiles?.length);
  }
}

export function getAgentEditPathFields({
  platform,
  isCustom = false,
  values = {},
}: AgentEditPathFieldOptions): AgentEditPathField[] {
  if (isCustom) {
    return [...ALL_AGENT_EDIT_PATH_FIELDS];
  }
  if (!platform) {
    return [];
  }

  return ALL_AGENT_EDIT_PATH_FIELDS.filter(
    (field) => isDeclared(platform, field) || Boolean(values[field]?.trim()),
  );
}

function parseConfigPaths(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildBuiltinAgentPathOverride(
  platform: SkillPlatform,
  rootPath: string,
  values: AgentEditPathValues,
): BuiltinAgentOverrideConfig {
  const visible = new Set(getAgentEditPathFields({ platform, values }));
  const override: BuiltinAgentOverrideConfig = { rootPath };

  if (visible.has("skillsPath"))
    override.skillsRelativePath = values.skillsPath;
  if (visible.has("rulesPath")) override.rulesRelativePath = values.rulesPath;
  if (visible.has("mcpPath")) {
    // An explicit root uses the platform's configured-root layout, not its home-relative default.
    override.mcpRelativePath =
      values.mcpPath === platform.mcpRelativePath
        ? getPlatformMcpRelativePath(platform, true)
        : values.mcpPath;
  }
  if (visible.has("pluginsPath")) {
    override.pluginsRelativePath = values.pluginsPath;
  }
  if (visible.has("agentsPath"))
    override.agentsRelativePath = values.agentsPath;
  if (visible.has("commandsPath")) {
    override.commandsRelativePath = values.commandsPath;
  }
  if (visible.has("configPaths")) {
    override.configRelativePaths = parseConfigPaths(values.configPaths);
  }

  return override;
}
