import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { isPlatformRootConfigured } from "@prompthub/core";
import {
  SKILL_PLATFORMS,
  getPlatformMcpRelativePath,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import {
  fileExists,
  getSkillsDirAccessor,
  initSkillsDir,
} from "./skill-installer-internal";
import { saveContentToLocalRepo } from "./skill-installer-repo";
import {
  getPlatformSkillsDir,
  getPlatformRootDir,
  getBuiltinAgentOverride,
  getConfiguredBuiltinAgentPlatformIds,
  getCustomAgentPlatforms,
  validateMCPConfig,
} from "./skill-installer-utils";
import { createNativeCommandRunner } from "./native-command";
import { createSkillPlatformService } from "@prompthub/core/skills/platform-service";
export {
  parsePlatformActivationState,
  PLATFORM_ACTIVATION_STATE_FILE,
  MAX_PLATFORM_ACTIVATION_RECORDS,
} from "@prompthub/core/skills/platform-service";
export type {
  PlatformActivationRecord,
  PlatformActivationMap,
} from "@prompthub/core/skills/platform-service";
// ==================== Config path resolution ====================

function getPlatformConfigPath(platform: "claude" | "cursor"): string {
  const homeDir = os.homedir();
  if (platform === "claude") {
    switch (process.platform) {
      case "darwin":
        return path.join(
          homeDir,
          "Library/Application Support/Claude/claude_desktop_config.json",
        );
      case "win32":
        return path.join(
          homeDir,
          "AppData/Roaming/Claude/claude_desktop_config.json",
        );
      default:
        return path.join(homeDir, ".config/claude/claude_desktop_config.json");
    }
  }
  // cursor uses the same path on all platforms
  return path.join(homeDir, ".cursor/mcp.json");
}

// ==================== Config file locking ====================

/**
 * Per-path mutex to prevent concurrent config file read-modify-write races.
 */
const configLocks = new Map<string, Promise<void>>();

async function withConfigLock<T>(
  configPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Wait for any pending operation on this config file
  const pending = configLocks.get(configPath) ?? Promise.resolve();
  let release: () => void;
  const lock = new Promise<void>((resolve) => {
    release = resolve;
  });
  configLocks.set(configPath, lock);
  await pending;
  try {
    return await fn();
  } finally {
    release!();
    if (configLocks.get(configPath) === lock) {
      configLocks.delete(configPath);
    }
  }
}

// ==================== MCP platform install/uninstall ====================

export async function installToPlatform(
  platform: "claude" | "cursor",
  name: string,
  mcpConfig: unknown,
): Promise<void> {
  if (platform !== "claude" && platform !== "cursor") {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  // Runtime validation of MCP config structure before writing to platform config
  validateMCPConfig(mcpConfig, name);

  const configPath = getPlatformConfigPath(platform);

  return withConfigLock(configPath, async () => {
    if (!(await fileExists(configPath))) {
      // If file doesn't exist, create a basic one
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });
      const initialConfig = { mcpServers: {} };
      await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2));
    }

    try {
      const content = await fs.readFile(configPath, "utf-8");
      // Safe: JSON.parse returns `any`; narrowed to Record for property access
      const config = JSON.parse(content) as Record<string, unknown>;

      // Handle different key variations
      if (!config.mcpServers && !config.mcp_servers && !config.servers) {
        config.mcpServers = {};
      }

      const serversKey = config.mcpServers
        ? "mcpServers"
        : config.mcp_servers
          ? "mcp_servers"
          : "servers";

      // Merge config
      // mcpConfig is expected to be { servers: { name: config } }
      // Safe: mcpConfig is validated by validateMCPConfig before reaching here
      const configObj = mcpConfig as Record<string, unknown>;
      const sourceServers =
        configObj.servers && typeof configObj.servers === "object"
          ? // Safe: guarded by typeof check above
            (configObj.servers as Record<string, unknown>)
          : { [name]: mcpConfig };
      const sourceServerEntries = Object.entries(sourceServers);
      if (
        sourceServerEntries.length !== 1 ||
        sourceServerEntries[0][0] !== name
      ) {
        throw new Error(
          "MCP config must contain exactly one server entry matching the skill name",
        );
      }
      await fs.copyFile(configPath, `${configPath}.bak`);
      config[serversKey] = {
        // Safe: config[serversKey] is initialized above if missing
        ...(config[serversKey] as Record<string, unknown>),
        [name]: sourceServerEntries[0][1],
      };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`Successfully installed skill ${name} to ${platform}`);
    } catch (error) {
      console.error(`Failed to install to ${platform}:`, error);
      throw error;
    }
  });
}

export async function uninstallFromPlatform(
  platform: "claude" | "cursor",
  name: string,
): Promise<void> {
  const configPath = getPlatformConfigPath(platform);

  return withConfigLock(configPath, async () => {
    if (!(await fileExists(configPath))) return;

    try {
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      const serversKey = config.mcpServers
        ? "mcpServers"
        : config.mcp_servers
          ? "mcp_servers"
          : "servers";

      if (config[serversKey] && config[serversKey][name]) {
        delete config[serversKey][name];
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        console.log(`Successfully uninstalled skill ${name} from ${platform}`);
      }
    } catch (e) {
      console.error(`Failed to uninstall from ${platform}:`, e);
      throw e;
    }
  });
}

export async function getPlatformStatus(
  name: string,
): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = { claude: false, cursor: false };

  const check = async (platform: "claude" | "cursor"): Promise<void> => {
    const configPath = getPlatformConfigPath(platform);
    if (!(await fileExists(configPath))) return;
    try {
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);
      const servers =
        config.mcpServers || config.mcp_servers || config.servers || {};
      if (servers[name]) status[platform] = true;
    } catch (e) {
      console.error("Failed to read platform config:", e);
    }
  };

  await check("claude");
  await check("cursor");

  return status;
}

/**
 * Get list of supported platforms.
 */
export function getSupportedPlatforms(): SkillPlatform[] {
  const configuredBuiltinIds = new Set(getConfiguredBuiltinAgentPlatformIds());
  const builtinPlatforms = SKILL_PLATFORMS.map((platform) => {
    const configured = configuredBuiltinIds.has(platform.id)
      ? { ...platform, isConfigured: true }
      : platform;
    if (platform.id !== "claude") return configured;
    const root = getPlatformRootDir(platform);
    return {
      ...configured,
      resolvedRootPath: root,
      mcpRelativePath: getPlatformMcpRelativePath(
        platform,
        isPlatformRootConfigured(platform, root, {
          rootOverride: getBuiltinAgentOverride(platform.id)?.rootPath,
        }),
      ),
    };
  });

  return [...builtinPlatforms, ...getCustomAgentPlatforms()];
}

/**
 * Detect which AI tools are installed on the system.
 */
export interface DetectInstalledPlatformsOptions {
  pathExists?: (candidate: string) => Promise<boolean>;
  resolveExecutable?: (candidate: string) => Promise<string | null>;
}

export async function detectInstalledPlatforms(
  options: DetectInstalledPlatformsOptions = {},
): Promise<string[]> {
  const installed: string[] = [];
  const pathExists = options.pathExists ?? fileExists;
  const resolveExecutable =
    options.resolveExecutable ?? createNativeCommandRunner().resolve;

  for (const platform of getSupportedPlatforms()) {
    if (platform.id === "antigravity") {
      // Shared customizations can be created by the CLI; they are not desktop installation evidence.
      const osKey =
        process.platform === "darwin" || process.platform === "win32"
          ? process.platform
          : "linux";
      const appPaths = (platform.launchPaths?.[osKey] ?? []).map((candidate) =>
        candidate.replace(/^~/, os.homedir()),
      );
      const desktopRuntime = path.resolve(
        getPlatformRootDir(platform),
        "../antigravity",
      );
      if (
        (await Promise.all([...appPaths, desktopRuntime].map(pathExists))).some(
          Boolean,
        )
      )
        installed.push(platform.id);
      continue;
    }
    if (
      platform.assetModel === "plugin-harness" ||
      platform.id === "antigravity-cli"
    ) {
      const rootExists = await pathExists(getPlatformRootDir(platform));
      let cliExists = false;
      for (const candidate of platform.cli?.executableCandidates || []) {
        if (await resolveExecutable(candidate)) {
          cliExists = true;
          break;
        }
      }
      if (rootExists || cliExists) installed.push(platform.id);
      continue;
    }
    const skillsDir = getPlatformSkillsDir(platform);
    // Check if the parent directory exists (e.g., ~/.claude means Claude Code is installed)
    const parentDir = path.dirname(skillsDir);

    if (await pathExists(parentDir)) {
      installed.push(platform.id);
    }
  }

  return installed;
}

const service = createSkillPlatformService({
  getSupportedPlatforms,
  getPlatformSkillsDir,
  getPlatformRootDir,
  saveContentToLocalRepo,
  getSkillsDirAccessor,
  initSkillsDir,
});
export const {
  installSkillMd,
  uninstallSkillMd,
  getSkillMdInstallStatus,
  getSkillMdInstallStatusDetails,
  installSkillMdSymlink,
  installSkillMdForSkill,
  installSkillMdSymlinkForSkill,
  uninstallSkillMdForSkill,
  getSkillMdInstallStatusForSkill,
  getSkillMdInstallStatusDetailsForSkill,
} = service;
