import type {
  SkillPlatform,
  SkillPlatformOsKey,
} from "@prompthub/shared/constants/platforms";
import { getPlatformMcpRelativePath } from "@prompthub/shared/constants/platforms";
import { getAgentPlatformCapabilityInventory } from "@prompthub/shared/constants/agent-platform-capabilities";
import type {
  AgentIdentityChoice,
  AgentIdentityPreference,
  AgentIdentityPreferences,
  BuiltinAgentOverrideConfig,
  ManagedAgentCapability,
  ManagedAgentFilter,
  ManagedAgentSummary,
} from "@prompthub/shared/types";

const COMMON_AGENT_ORDER = [
  "claude",
  "codex",
  "deepseek-harness",
  "antigravity",
  "antigravity-cli",
  "gemini",
  "kimi",
  "qwen",
  "opencode",
  "pi",
  "oh-my-pi",
  "cursor",
  "copilot",
  "windsurf",
  "cline",
  "openclaw",
] as const;

const DISPLAY_NAMES: Record<AgentIdentityChoice, string> = {
  codex: "Codex",
  chatgpt: "ChatGPT",
};

export const DEFAULT_CODEX_IDENTITY: AgentIdentityPreference = Object.freeze({
  name: "codex",
  icon: "codex",
});

export interface BuildManagedAgentsInput {
  platforms: SkillPlatform[];
  detectedPlatformIds: string[];
  pinnedPlatformIds: string[];
  disabledPlatformIds?: string[];
  builtinOverrides: Record<string, BuiltinAgentOverrideConfig>;
  agentIdentityPreferences?: AgentIdentityPreferences;
  osKey: SkillPlatformOsKey;
}

function normalizeChoice(value: unknown): AgentIdentityChoice | undefined {
  return value === "codex" || value === "chatgpt" ? value : undefined;
}

export function normalizeAgentIdentityPreferences(
  value: unknown,
): AgentIdentityPreferences {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const codex =
    record.codex &&
    typeof record.codex === "object" &&
    !Array.isArray(record.codex)
      ? (record.codex as Record<string, unknown>)
      : {};

  return {
    codex: {
      name: normalizeChoice(codex.name) ?? DEFAULT_CODEX_IDENTITY.name,
      icon: normalizeChoice(codex.icon) ?? DEFAULT_CODEX_IDENTITY.icon,
    },
  };
}

export function resolveAgentIdentity(
  platformId: string,
  fallbackName: string,
  preferences: AgentIdentityPreferences | undefined,
): { name: string; iconId: string } {
  if (platformId !== "codex") {
    return { name: fallbackName, iconId: platformId };
  }

  const preference = normalizeAgentIdentityPreferences(preferences).codex!;
  return {
    name: DISPLAY_NAMES[preference.name],
    iconId: preference.icon,
  };
}

function joinPath(basePath: string, relativePath?: string): string | undefined {
  if (!relativePath?.trim()) return undefined;
  const separator = basePath.includes("\\") ? "\\" : "/";
  const base = basePath.replace(/[\\/]+$/, "");
  const combined = `${base}${separator}${relativePath.trim()}`;
  const segments = combined.split(/[\\/]+/).filter(Boolean);
  const normalized: string[] = [];
  const protectedDepth =
    base.startsWith("~") || base.startsWith("%") || /^[A-Za-z]:[\\/]/.test(base)
      ? 1
      : 0;

  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === ".." && normalized.length > protectedDepth) {
      normalized.pop();
      continue;
    }
    if (segment !== "..") normalized.push(segment);
  }

  const prefix = base.startsWith(separator) ? separator : "";
  return `${prefix}${normalized.join(separator)}`;
}

function capability(
  status: ManagedAgentCapability["status"],
  reason?: string,
): ManagedAgentCapability {
  return reason ? { status, reason } : { status };
}

function buildCapabilities(
  platform: SkillPlatform,
): ManagedAgentSummary["capabilities"] {
  const inventory = getAgentPlatformCapabilityInventory(platform);
  const provider =
    inventory.providerModel.status === "supported"
      ? capability("supported")
      : inventory.providerModel.status === "partial"
        ? capability("partial", "model-config-only")
        : capability(inventory.providerModel.status, "adapter-pending");
  const appearance =
    inventory.appearance.status === "supported"
      ? capability("supported")
      : capability(
          inventory.appearance.status,
          "appearance-adapter-unavailable",
        );
  const sessions =
    inventory.sessions.status === "supported"
      ? capability("supported")
      : inventory.sessions.status === "partial"
        ? capability("partial", inventory.sessions.evidence)
        : capability(inventory.sessions.status, "adapter-pending");
  const usage =
    inventory.usage.status === "supported"
      ? capability("supported")
      : capability(inventory.usage.status, "adapter-pending");
  const maintenance =
    inventory.maintenanceCli.status === "partial"
      ? capability("partial", "cli-diagnostics-read-only")
      : capability(
          inventory.maintenanceCli.status,
          "lifecycle-adapter-pending",
        );
  return {
    overview: capability("supported"),
    provider,
    appearance,
    assets: capability("partial", "asset-paths-only"),
    configFiles:
      inventory.configFiles.status === "partial"
        ? capability("partial", "direct-file-editing")
        : capability("unsupported", "no-verified-config-path"),
    sessions,
    usage,
    maintenance,
  };
}

function rankAgent(agent: ManagedAgentSummary): [number, number, number] {
  const curatedIndex = COMMON_AGENT_ORDER.indexOf(
    agent.id as (typeof COMMON_AGENT_ORDER)[number],
  );
  return [
    agent.isPinned ? 0 : 1,
    agent.isDetected || agent.isConfigured ? 0 : 1,
    curatedIndex === -1 ? COMMON_AGENT_ORDER.length : curatedIndex,
  ];
}

export function sortManagedAgents(
  agents: ManagedAgentSummary[],
): ManagedAgentSummary[] {
  return [...agents].sort((left, right) => {
    const leftRank = rankAgent(left);
    const rightRank = rankAgent(right);
    for (let index = 0; index < leftRank.length; index += 1) {
      const delta = leftRank[index] - rightRank[index];
      if (delta !== 0) return delta;
    }
    return left.name.localeCompare(right.name);
  });
}

export function buildManagedAgents({
  platforms,
  detectedPlatformIds,
  pinnedPlatformIds,
  disabledPlatformIds = [],
  builtinOverrides,
  agentIdentityPreferences,
  osKey,
}: BuildManagedAgentsInput): ManagedAgentSummary[] {
  const detected = new Set(detectedPlatformIds);
  const pinned = new Set(pinnedPlatformIds);
  const disabled = new Set(disabledPlatformIds);

  return sortManagedAgents(
    platforms
      .filter((platform) => !disabled.has(platform.id))
      .map((platform) => {
        const identity = resolveAgentIdentity(
          platform.id,
          platform.name,
          agentIdentityPreferences,
        );
        const override = builtinOverrides[platform.id] ?? {};
        const root =
          override.rootPath?.trim() ||
          platform.resolvedRootPath ||
          platform.rootDir[osKey];
        const isDetected = detected.has(platform.id);
        const isConfigured = Boolean(
          platform.isConfigured || platform.isCustom,
        );
        const skillsRelativePath =
          override.skillsRelativePath || platform.skillsRelativePath;
        const configRelativePaths =
          override.configRelativePaths || platform.configFiles || [];

        return {
          id: platform.id,
          name: identity.name,
          icon: platform.icon,
          displayIconId: identity.iconId,
          isCustom: Boolean(platform.isCustom),
          isConfigured,
          isDetected,
          isPinned: pinned.has(platform.id),
          launchable: Boolean(platform.launchPaths?.[osKey]?.length),
          lifecycle: platform.lifecycle,
          replacementPlatformId: platform.replacementPlatformId,
          workspaceKind:
            platform.assetModel === "plugin-harness"
              ? "plugin-harness"
              : "standard",
          status: isDetected
            ? "installed"
            : isConfigured
              ? "configured"
              : "not-detected",
          paths: {
            root,
            skills:
              platform.assetModel === "plugin-harness"
                ? ""
                : joinPath(root, skillsRelativePath) || root,
            profiles: joinPath(root, platform.harnessProfilesRelativePath),
            mcp: joinPath(
              root,
              override.mcpRelativePath ||
                getPlatformMcpRelativePath(
                  platform,
                  Boolean(override.rootPath?.trim()),
                ),
            ),
            plugins: joinPath(
              root,
              override.pluginsRelativePath || platform.pluginsRelativePath,
            ),
            rules: joinPath(
              root,
              override.rulesRelativePath || platform.globalRuleFile,
            ),
            projectRules: platform.projectRuleFile,
            projectRuleKind: platform.projectRuleKind,
            configFiles: configRelativePaths
              .map((relativePath) => joinPath(root, relativePath))
              .filter((path): path is string => Boolean(path)),
            configFileRelativePaths: configRelativePaths,
          },
          capabilities: buildCapabilities(platform),
        };
      }),
  );
}

function matchesFilter(
  agent: ManagedAgentSummary,
  filter: ManagedAgentFilter,
): boolean {
  if (filter === "installed") return agent.isDetected;
  if (filter === "configured") return agent.isConfigured;
  if (filter === "custom") return agent.isCustom;
  if (filter === "not-detected") return !agent.isDetected;
  if (filter === "needs-attention") {
    return agent.isConfigured && !agent.isDetected;
  }
  return true;
}

export function filterManagedAgents(
  agents: ManagedAgentSummary[],
  searchQuery: string,
  filter: ManagedAgentFilter,
): ManagedAgentSummary[] {
  const query = searchQuery.trim().toLocaleLowerCase();
  return agents.filter((agent) => {
    if (!matchesFilter(agent, filter)) return false;
    if (!query) return true;
    return [
      agent.name,
      agent.id,
      agent.paths.root,
      agent.paths.skills,
      agent.paths.mcp,
      agent.paths.plugins,
      agent.paths.rules,
      agent.lifecycle,
      agent.replacementPlatformId,
      ...agent.paths.configFiles,
      ...agent.paths.configFileRelativePaths,
    ]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase().includes(query));
  });
}
