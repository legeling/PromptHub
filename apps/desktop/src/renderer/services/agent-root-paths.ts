import {
  SKILL_PLATFORMS,
  getPlatformMcpRelativePath,
  getPlatformPluginsRelativePath,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import type {
  AgentAssetConfig,
  BuiltinAgentOverrideConfig,
  CustomAgentConfig,
} from "@prompthub/shared/types";

function joinRootPath(rootPath: string, relativePath: string): string {
  const normalizedRoot = rootPath.trim().replace(/[\\/]+$/, "");
  if (!normalizedRoot) {
    return "";
  }

  const rootSegments = normalizedRoot.split(/[\\/]+/).filter(Boolean);
  const relativeSegments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (relativeSegments.length === 0) {
    return normalizedRoot;
  }

  const separator = normalizedRoot.includes("\\") ? "\\" : "/";
  const leadingSlash = normalizedRoot.startsWith("/") ? separator : "";
  const segments = [...rootSegments];

  for (const segment of relativeSegments) {
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (
        segments.length > 1 ||
        (segments.length === 1 && segments[0] !== "~")
      ) {
        segments.pop();
      }
      continue;
    }
    segments.push(segment);
  }

  return `${leadingSlash}${segments.join(separator)}`;
}

function normalizeRelativePath(relativePath: string | undefined): string {
  return (relativePath ?? "")
    .trim()
    .replace(/^[\\/]+/, "")
    .replace(/[\\/]+$/, "");
}

function uniqNonEmptyRelativePaths(values: string[] | undefined): string[] {
  return uniqPaths(
    (values ?? [])
      .filter((value): value is string => typeof value === "string")
      .map((value) => normalizeRelativePath(value)),
  );
}

function compactAgentAssetConfig<T extends AgentAssetConfig>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== undefined;
    }),
  ) as T;
}

export function normalizeAgentRootPath(pathValue: string): string {
  return pathValue.trim().replace(/[\\/]+$/, "");
}

export function normalizeAgentAssetConfig<T extends AgentAssetConfig>(
  input: T,
): T {
  return compactAgentAssetConfig({
    ...input,
    rootPath:
      typeof input.rootPath === "string"
        ? normalizeAgentRootPath(input.rootPath)
        : input.rootPath,
    skillsRelativePath:
      normalizeRelativePath(input.skillsRelativePath) || undefined,
    mcpRelativePath: normalizeRelativePath(input.mcpRelativePath) || undefined,
    pluginsRelativePath:
      normalizeRelativePath(input.pluginsRelativePath) || undefined,
    rulesRelativePath:
      normalizeRelativePath(input.rulesRelativePath) || undefined,
    agentsRelativePath:
      normalizeRelativePath(input.agentsRelativePath) || undefined,
    commandsRelativePath:
      normalizeRelativePath(input.commandsRelativePath) || undefined,
    configRelativePaths: uniqNonEmptyRelativePaths(input.configRelativePaths),
  });
}

export function normalizeBuiltinAgentOverride(
  override: BuiltinAgentOverrideConfig | undefined,
): BuiltinAgentOverrideConfig {
  return normalizeAgentAssetConfig(override ?? {});
}

export function normalizeBuiltinAgentOverrides(
  overrides: Record<string, BuiltinAgentOverrideConfig> | undefined,
): Record<string, BuiltinAgentOverrideConfig> {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }

  return Object.entries(overrides).reduce<
    Record<string, BuiltinAgentOverrideConfig>
  >((acc, [platformId, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return acc;
    }
    const normalized = normalizeBuiltinAgentOverride(value);
    if (Object.keys(normalized).length > 0) {
      acc[platformId] = normalized;
    }
    return acc;
  }, {});
}

export interface EffectiveBuiltinAgentConfig extends AgentAssetConfig {
  id: string;
  name: string;
}

export function getEffectiveBuiltinAgentConfig(
  platform: SkillPlatform,
  defaultRootPath: string,
  override: BuiltinAgentOverrideConfig | undefined,
): EffectiveBuiltinAgentConfig {
  const normalizedOverride = normalizeBuiltinAgentOverride(override);

  return {
    id: platform.id,
    name: platform.name,
    rootPath:
      normalizedOverride.rootPath || normalizeAgentRootPath(defaultRootPath),
    skillsRelativePath:
      normalizedOverride.skillsRelativePath ||
      normalizeRelativePath(platform.skillsRelativePath) ||
      undefined,
    rulesRelativePath:
      normalizedOverride.rulesRelativePath ||
      normalizeRelativePath(platform.globalRuleFile) ||
      undefined,
    mcpRelativePath:
      normalizedOverride.mcpRelativePath ||
      getDefaultMcpRelativePath(platform.id) ||
      undefined,
    pluginsRelativePath:
      normalizedOverride.pluginsRelativePath ||
      getDefaultPluginsRelativePath(platform.id) ||
      undefined,
    agentsRelativePath:
      normalizedOverride.agentsRelativePath ||
      normalizeRelativePath("agents") ||
      undefined,
    commandsRelativePath:
      normalizedOverride.commandsRelativePath ||
      normalizeRelativePath("commands") ||
      undefined,
    configRelativePaths: normalizedOverride.configRelativePaths?.length
      ? normalizedOverride.configRelativePaths
      : uniqNonEmptyRelativePaths(platform.configFiles),
  };
}

function uniqPaths(values: string[]): string[] {
  return Array.from(
    new Set(
      values.map(normalizeAgentRootPath).filter((value) => value.length > 0),
    ),
  );
}

const KNOWN_SKILL_RELATIVE_PATHS = uniqPaths(
  SKILL_PLATFORMS.map((platform) => platform.skillsRelativePath),
);

const KNOWN_RULE_RELATIVE_PATHS = uniqPaths(
  SKILL_PLATFORMS.map((platform) => platform.globalRuleFile ?? ""),
);

const KNOWN_CONFIG_RELATIVE_PATHS = uniqPaths(
  SKILL_PLATFORMS.flatMap((platform) => platform.configFiles ?? []),
);

function getDefaultMcpRelativePath(platformId?: string): string | undefined {
  return platformId ? getPlatformMcpRelativePath(platformId) : "mcp.json";
}

export function getDefaultPluginsRelativePath(
  platformId?: string,
): string | undefined {
  return platformId ? getPlatformPluginsRelativePath(platformId) : undefined;
}

export interface AgentRootAssetPreview {
  rootPath: string;
  skillScanPaths: string[];
  mcpConfigPaths: string[];
  pluginDirectories: string[];
  ruleCandidates: string[];
  agentDirectories: string[];
  configCandidates: string[];
}

export function normalizeCustomAgentDraft(input: {
  id?: string;
  name: string;
  rootPath: string;
  enabled?: boolean;
  skillsRelativePath?: string;
  mcpRelativePath?: string;
  pluginsRelativePath?: string;
  rulesRelativePath?: string;
  agentsRelativePath?: string;
  commandsRelativePath?: string;
  configRelativePaths?: string[];
}): CustomAgentConfig {
  const normalized = normalizeAgentAssetConfig({
    id:
      input.id?.trim() ||
      `agent_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    name: input.name.trim(),
    rootPath: normalizeAgentRootPath(input.rootPath),
    enabled: input.enabled !== false,
    skillsRelativePath: input.skillsRelativePath,
    mcpRelativePath: input.mcpRelativePath,
    pluginsRelativePath: input.pluginsRelativePath,
    rulesRelativePath: input.rulesRelativePath,
    agentsRelativePath: input.agentsRelativePath,
    commandsRelativePath: input.commandsRelativePath,
    configRelativePaths: input.configRelativePaths,
  });

  return {
    ...normalized,
    id: normalized.id,
    name: normalized.name,
    rootPath: normalized.rootPath || "",
    enabled: normalized.enabled !== false,
  };
}

export function normalizeCustomAgents(
  agents: CustomAgentConfig[] | undefined,
): CustomAgentConfig[] {
  const seenRoots = new Set<string>();
  const normalized: CustomAgentConfig[] = [];

  for (const agent of agents ?? []) {
    if (!agent || typeof agent !== "object") {
      continue;
    }

    const next = normalizeCustomAgentDraft(agent);
    const rootKey = next.rootPath.toLowerCase();
    if (!next.name || !next.rootPath || seenRoots.has(rootKey)) {
      continue;
    }

    seenRoots.add(rootKey);
    normalized.push(next);
  }

  return normalized;
}

export function deriveSkillScanPathsFromAgentRoots(
  rootPaths: string[],
): string[] {
  const normalizedRoots = uniqPaths(rootPaths);
  const derived: string[] = [];

  for (const rootPath of normalizedRoots) {
    derived.push(rootPath);
    for (const relativePath of KNOWN_SKILL_RELATIVE_PATHS) {
      derived.push(joinRootPath(rootPath, relativePath));
    }
  }

  return uniqPaths(derived);
}

export function deriveSkillScanPathsFromCustomAgents(
  agents: CustomAgentConfig[],
): string[] {
  const derived: string[] = [];

  for (const agent of normalizeCustomAgents(agents)) {
    derived.push(agent.rootPath);
    if (agent.skillsRelativePath) {
      derived.push(joinRootPath(agent.rootPath, agent.skillsRelativePath));
      continue;
    }
    for (const relativePath of KNOWN_SKILL_RELATIVE_PATHS) {
      derived.push(joinRootPath(agent.rootPath, relativePath));
    }
  }

  return uniqPaths(derived);
}

export function buildAgentRootAssetPreview(
  agent: Pick<
    CustomAgentConfig,
    | "rootPath"
    | "skillsRelativePath"
    | "mcpRelativePath"
    | "pluginsRelativePath"
    | "rulesRelativePath"
    | "agentsRelativePath"
    | "commandsRelativePath"
    | "configRelativePaths"
  >,
): AgentRootAssetPreview {
  const normalizedRoot = normalizeAgentRootPath(agent.rootPath);
  const skillPaths = agent.skillsRelativePath
    ? [joinRootPath(normalizedRoot, agent.skillsRelativePath)]
    : deriveSkillScanPathsFromAgentRoots([normalizedRoot]);
  const ruleCandidates = agent.rulesRelativePath
    ? [joinRootPath(normalizedRoot, agent.rulesRelativePath)]
    : uniqPaths(
        KNOWN_RULE_RELATIVE_PATHS.map((relativePath) =>
          joinRootPath(normalizedRoot, relativePath),
        ),
      );
  const mcpConfigPaths = agent.mcpRelativePath
    ? [joinRootPath(normalizedRoot, agent.mcpRelativePath)]
    : [];
  const pluginDirectories = agent.pluginsRelativePath
    ? [joinRootPath(normalizedRoot, agent.pluginsRelativePath)]
    : [];
  const agentDirectories = [
    joinRootPath(normalizedRoot, agent.agentsRelativePath || "agents"),
  ];
  const configCandidates =
    agent.configRelativePaths && agent.configRelativePaths.length > 0
      ? uniqPaths(
          agent.configRelativePaths.map((relativePath) =>
            joinRootPath(normalizedRoot, relativePath),
          ),
        )
      : uniqPaths(
          KNOWN_CONFIG_RELATIVE_PATHS.map((relativePath) =>
            joinRootPath(normalizedRoot, relativePath),
          ),
        );

  return {
    rootPath: normalizedRoot,
    skillScanPaths: uniqPaths(skillPaths),
    mcpConfigPaths: uniqPaths(mcpConfigPaths),
    pluginDirectories: uniqPaths(pluginDirectories),
    ruleCandidates: uniqPaths(ruleCandidates),
    agentDirectories: uniqPaths(agentDirectories),
    configCandidates: uniqPaths(configCandidates),
  };
}
