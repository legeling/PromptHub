import fs from "fs/promises";
import os from "os";
import path from "path";

import type {
  SkillPlatform,
  SkillPlatformOsKey,
} from "@prompthub/shared/constants/platforms";
import { getPlatformMcpRelativePath } from "@prompthub/shared/constants/platforms";
import { isPlatformRootConfigured } from "../platform-paths";
import type {
  BuiltinAgentOverrideConfig,
  CustomAgentConfig,
  ManagedAgentFilter,
  ManagedAgentSummary,
} from "@prompthub/shared/types";

import { buildManagedAgents, filterManagedAgents } from "./agent-query";
import type { AgentManagementSettings } from "./agent-settings-repository";

export interface CliManagedAgent extends ManagedAgentSummary {
  enabled: boolean;
}

export interface AgentInventoryOptions {
  filter?: ManagedAgentFilter;
  includeDisabled?: boolean;
  search?: string;
  environment?: NodeJS.ProcessEnv;
  cwd?: string;
  platform?: NodeJS.Platform;
  pathExists?: (candidate: string) => Promise<boolean>;
}

function osKey(platform: NodeJS.Platform): SkillPlatformOsKey {
  if (platform === "darwin" || platform === "win32") return platform;
  return "linux";
}

function expandRootTemplate(
  template: string,
  environment: NodeJS.ProcessEnv,
): string {
  const home = environment.HOME || environment.USERPROFILE || os.homedir();
  const appData = environment.APPDATA || path.join(home, "AppData", "Roaming");
  const localAppData =
    environment.LOCALAPPDATA || path.join(home, "AppData", "Local");
  return template
    .replace(/^~/, home)
    .replace(/%USERPROFILE%/gi, home)
    .replace(/%APPDATA%/gi, appData)
    .replace(/%LOCALAPPDATA%/gi, localAppData);
}

function normalizeEnvironmentRoot(
  value: string | undefined,
  environment: NodeJS.ProcessEnv,
  allowRelative: boolean,
  cwd: string,
): string | null {
  if (!value?.trim() || value.includes("\0")) return null;
  const expanded = expandRootTemplate(value.trim(), environment);
  if (path.isAbsolute(expanded)) return path.normalize(expanded);
  return allowRelative ? path.resolve(cwd, expanded) : null;
}

async function defaultPathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function resolveAgentPlatformRoot(
  platform: SkillPlatform,
  override: BuiltinAgentOverrideConfig | undefined,
  options: AgentInventoryOptions = {},
): Promise<string> {
  const environment = options.environment ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const targetPlatform = options.platform ?? process.platform;
  const pathExists = options.pathExists ?? defaultPathExists;
  if (override?.rootPath?.trim()) {
    return path.normalize(
      expandRootTemplate(override.rootPath.trim(), environment),
    );
  }

  const platformKey = osKey(targetPlatform);
  const primary = path.normalize(
    expandRootTemplate(
      platform.rootDir[platformKey] || platform.rootDir.linux,
      environment,
    ),
  );
  const currentEnvironmentRoot = normalizeEnvironmentRoot(
    environment[platform.rootEnvironmentVariable || ""],
    environment,
    Boolean(platform.environmentRootRelativeToCwd),
    cwd,
  );
  if (currentEnvironmentRoot) {
    return path.join(
      currentEnvironmentRoot, platform.rootEnvironmentSubdirectory ?? "",
    );
  }
  if (await pathExists(primary)) return primary;

  const legacyEnvironmentRoot = normalizeEnvironmentRoot(
    environment[platform.legacyRootEnvironmentVariable || ""],
    environment,
    false,
    cwd,
  );
  if (legacyEnvironmentRoot) return legacyEnvironmentRoot;

  for (const fallback of platform.rootDirFallbacks?.[platformKey] ?? []) {
    const candidate = path.normalize(expandRootTemplate(fallback, environment));
    if (await pathExists(candidate)) return candidate;
  }
  return primary;
}

export function customAgentToPlatform(agent: CustomAgentConfig): SkillPlatform {
  return {
    id: agent.id,
    name: agent.name,
    icon: "Bot",
    rootDir: {
      darwin: agent.rootPath,
      win32: agent.rootPath,
      linux: agent.rootPath,
    },
    skillsRelativePath: agent.skillsRelativePath || "skills",
    mcpRelativePath: agent.mcpRelativePath,
    pluginsRelativePath: agent.pluginsRelativePath,
    agentsRelativePath: agent.agentsRelativePath,
    commandsRelativePath: agent.commandsRelativePath,
    globalRuleFile: agent.rulesRelativePath,
    configFiles: agent.configRelativePaths || [],
    isCustom: true,
    isConfigured: true,
  };
}

function isConfiguredOverride(
  override: BuiltinAgentOverrideConfig | undefined,
): boolean {
  return Boolean(override && Object.keys(override).length > 0);
}

export async function buildCliManagedAgentInventory(
  builtinPlatforms: SkillPlatform[],
  settings: AgentManagementSettings,
  options: AgentInventoryOptions = {},
): Promise<CliManagedAgent[]> {
  const pathExists = options.pathExists ?? defaultPathExists;
  const customPlatforms = settings.customAgents.map(customAgentToPlatform);
  const allPlatforms = [...builtinPlatforms, ...customPlatforms];
  const resolved = await Promise.all(
    allPlatforms.map(async (platform) => {
      const override = platform.isCustom
        ? undefined
        : settings.builtinAgentOverrides[platform.id];
      const root = await resolveAgentPlatformRoot(platform, override, options);
      return {
        ...platform,
        resolvedRootPath: root,
        mcpRelativePath: getPlatformMcpRelativePath(
          platform,
          isPlatformRootConfigured(platform, root, {
            rootOverride: override?.rootPath,
            environment: options.environment,
            targetPlatform: options.platform,
            homeDir:
              options.environment?.HOME || options.environment?.USERPROFILE,
          }),
        ),
        isConfigured:
          platform.isCustom ||
          platform.isConfigured ||
          isConfiguredOverride(override),
        root,
        detected: await pathExists(root),
      };
    }),
  );
  const detectedPlatformIds = resolved
    .filter((entry) => entry.detected)
    .map((entry) => entry.id);
  const effectiveOverrides = Object.fromEntries(
    resolved
      .filter((entry) => !entry.isCustom)
      .map((entry) => [
        entry.id,
        {
          ...settings.builtinAgentOverrides[entry.id],
          rootPath: entry.root,
          mcpRelativePath:
            settings.builtinAgentOverrides[entry.id]?.mcpRelativePath ||
            entry.mcpRelativePath,
        },
      ]),
  );
  const customEnabled = new Map(
    settings.customAgents.map((agent) => [agent.id, agent.enabled !== false]),
  );
  const disabled = new Set(settings.disabledPlatformIds);
  const agents = buildManagedAgents({
    platforms: resolved,
    detectedPlatformIds,
    pinnedPlatformIds: [],
    builtinOverrides: effectiveOverrides,
    agentIdentityPreferences: settings.agentIdentityPreferences,
    osKey: osKey(options.platform ?? process.platform),
  }).map(
    (agent): CliManagedAgent => ({
      ...agent,
      enabled: agent.isCustom
        ? (customEnabled.get(agent.id) ?? true) && !disabled.has(agent.id)
        : !disabled.has(agent.id),
    }),
  );
  const visible = options.includeDisabled
    ? agents
    : agents.filter((agent) => agent.enabled);
  return filterManagedAgents(
    visible,
    options.search ?? "",
    options.filter ?? "all",
  ) as CliManagedAgent[];
}
