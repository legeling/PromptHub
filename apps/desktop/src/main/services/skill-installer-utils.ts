import { AgentSettingsRepository } from "@prompthub/core/agent-management/agent-settings-repository";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  sanitizeSkillPackageDiagnostic,
  sanitizeSkillPackageSourceUrl,
} from "@prompthub/core/skills/package-operation";
import { getDatabase } from "../database";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { getErrorCode } from "./skill-installer-internal";
import {
  isPrivateAddress,
  resolvePublicAddress,
} from "./skill-installer-remote";
import type { MCPServerConfig } from "@prompthub/shared/types/skill";
import {
  getPlatformById,
  getPlatformMcpRelativePath,
  getPlatformPluginsRelativePath,
  normalizeLegacySkillPathToRootTemplate,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import type {
  BuiltinAgentOverrideConfig,
  CustomAgentConfig,
} from "@prompthub/shared/types";

export function validateMCPServerConfig(
  config: unknown,
  serverName: string,
): asserts config is MCPServerConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(
      `Invalid MCP server config for "${serverName}": expected an object`,
    );
  }
  const candidate = config as Record<string, unknown>;
  if (typeof candidate.command !== "string" || !candidate.command.trim()) {
    throw new Error(
      `Invalid MCP server config for "${serverName}": "command" must be a non-empty string`,
    );
  }
  if (candidate.args !== undefined) {
    if (
      !Array.isArray(candidate.args) ||
      !candidate.args.every((value) => typeof value === "string")
    ) {
      throw new Error(
        `Invalid MCP server config for "${serverName}": "args" must be a string array`,
      );
    }
  }
  if (candidate.env !== undefined) {
    if (
      !candidate.env ||
      typeof candidate.env !== "object" ||
      Array.isArray(candidate.env)
    ) {
      throw new Error(
        `Invalid MCP server config for "${serverName}": "env" must be an object`,
      );
    }
    for (const [key, value] of Object.entries(
      candidate.env as Record<string, unknown>,
    )) {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid MCP server config for "${serverName}": env["${key}"] must be a string`,
        );
      }
    }
  }
}

export function validateMCPConfig(config: unknown, name: string): void {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(
      `Invalid MCP config for "${name}": expected an object, got ${Array.isArray(config) ? "array" : typeof config}`,
    );
  }

  const candidate = config as Record<string, unknown>;
  if (candidate.servers !== undefined) {
    if (
      !candidate.servers ||
      typeof candidate.servers !== "object" ||
      Array.isArray(candidate.servers)
    ) {
      throw new Error(
        `Invalid MCP config for "${name}": "servers" must be an object`,
      );
    }
    for (const [serverName, serverConfig] of Object.entries(
      candidate.servers,
    )) {
      validateMCPServerConfig(serverConfig, serverName);
    }
    return;
  }

  validateMCPServerConfig(config, name);
}

const GIT_CLONE_TIMEOUT_MS = 60_000; // 60 seconds
const GIT_REMOTE_TIMEOUT_MS = 30_000; // 30 seconds

export class GitExecutableUnavailableError extends Error {
  constructor() {
    super(
      "GIT_EXECUTABLE_UNAVAILABLE: Git is not installed or is not available in PATH",
    );
    this.name = "GitExecutableUnavailableError";
  }
}

function createGitLaunchError(error: unknown, operation: string): Error {
  const code = getErrorCode(error);
  if (code === "ENOENT" || code === "EACCES") {
    return new GitExecutableUnavailableError();
  }
  return new Error(`${operation}: ${sanitizeSkillPackageDiagnostic(error)}`);
}

function normalizeRemoteGitUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed);
      if (parsedUrl.protocol !== "https:") {
        return trimmed;
      }
    } catch {
      return trimmed;
    }
  }
  const parsedRepo = parseGitRepo(trimmed);
  return parsedRepo?.cloneUrl ?? trimmed;
}

function isSshStyleGitUrl(url: string): boolean {
  return /^git@[^:]+:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(url);
}

async function validateRemoteGitTransportUrl(
  normalizedUrl: string,
  operation: "clone" | "remote",
): Promise<void> {
  if (isSshStyleGitUrl(normalizedUrl)) {
    return;
  }

  const parsedUrl = new URL(normalizedUrl);
  if (parsedUrl.protocol === "https:") {
    return;
  }
  if (parsedUrl.protocol === "http:") {
    const resolvedAddress = await resolvePublicAddress(parsedUrl.hostname, {
      allowPrivateNetwork: true,
    });
    if (isPrivateAddress(resolvedAddress.address)) {
      return;
    }
  }

  const noun = operation === "clone" ? "clone" : "remote";
  throw new Error(
    `Only HTTPS, private-network HTTP, or git@<host> SSH ${noun} URLs are allowed`,
  );
}

export function gitClone(
  url: string,
  destDir: string,
  branch?: string,
): Promise<void> {
  if (!url.trim()) {
    throw new Error("Git clone URL cannot be empty");
  }
  if (url.startsWith("-")) {
    throw new Error("Git clone URL cannot start with '-'");
  }

  const normalizedUrl = normalizeRemoteGitUrl(url);

  return validateRemoteGitTransportUrl(normalizedUrl, "clone").then(
    () =>
      new Promise((resolve, reject) => {
        const cloneArgs = ["clone", "--depth", "1"];
        if (branch?.trim()) {
          cloneArgs.push("--branch", branch.trim());
        }
        cloneArgs.push("--", normalizedUrl, destDir);
        const proc = childProcess.spawn("git", cloneArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stderr = "";
        let settled = false;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            proc.kill("SIGKILL");
            reject(
              new Error(
                `Git clone timed out after ${GIT_CLONE_TIMEOUT_MS / 1000}s for URL: ${sanitizeSkillPackageSourceUrl(url)}`,
              ),
            );
          }
        }, GIT_CLONE_TIMEOUT_MS);

        proc.stderr?.on("data", (data) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `Git clone failed with code ${code}: ${sanitizeSkillPackageDiagnostic(stderr)}`,
              ),
            );
          }
        });

        proc.on("error", (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(createGitLaunchError(error, "Git clone error"));
        });
      }),
  );
}

export function gitListRemoteBranches(url: string): Promise<string[]> {
  if (!url.trim()) {
    throw new Error("Git remote URL cannot be empty");
  }
  if (url.startsWith("-")) {
    throw new Error("Git remote URL cannot start with '-'");
  }

  const normalizedUrl = normalizeRemoteGitUrl(url);

  return validateRemoteGitTransportUrl(normalizedUrl, "remote").then(
    () =>
      new Promise((resolve, reject) => {
        const proc = childProcess.spawn(
          "git",
          ["ls-remote", "--heads", "--", normalizedUrl],
          { stdio: ["ignore", "pipe", "pipe"] },
        );

        let stdout = "";
        let stderr = "";
        let settled = false;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            proc.kill("SIGKILL");
            reject(
              new Error(
                `Git remote branch listing timed out after ${GIT_REMOTE_TIMEOUT_MS / 1000}s for URL: ${sanitizeSkillPackageSourceUrl(url)}`,
              ),
            );
          }
        }, GIT_REMOTE_TIMEOUT_MS);

        proc.stdout?.on("data", (data) => {
          stdout += data.toString();
        });

        proc.stderr?.on("data", (data) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (code !== 0) {
            reject(
              new Error(
                `Git remote branch listing failed with code ${code}: ${sanitizeSkillPackageDiagnostic(stderr)}`,
              ),
            );
            return;
          }

          const branches = stdout
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => line.split(/\s+/u)[1] ?? "")
            .filter((ref) => ref.startsWith("refs/heads/"))
            .map((ref) => ref.replace(/^refs\/heads\//u, ""))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));

          resolve(branches);
        });

        proc.on("error", (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(
            createGitLaunchError(error, "Git remote branch listing error"),
          );
        });
      }),
  );
}

export function gitGetCurrentBranch(repoDir: string): Promise<string | null> {
  if (!repoDir.trim()) {
    throw new Error("Git repository directory cannot be empty");
  }

  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn("git", ["branch", "--show-current"], {
      cwd: repoDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        reject(
          new Error(
            `Git current branch lookup timed out after ${GIT_REMOTE_TIMEOUT_MS / 1000}s in: ${repoDir}`,
          ),
        );
      }
    }, GIT_REMOTE_TIMEOUT_MS);

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new Error(
            `Git current branch lookup failed with code ${code}: ${stderr}`,
          ),
        );
        return;
      }

      const branch = stdout.trim();
      resolve(branch || null);
    });

    proc.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(createGitLaunchError(error, "Git current branch lookup error"));
    });
  });
}

export function resolvePlatformPath(template: string): string {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const localAppData =
    process.env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local");
  return template
    .replace(/^~/, home)
    .replace(/%USERPROFILE%/gi, home)
    .replace(/%APPDATA%/gi, appData)
    .replace(/%LOCALAPPDATA%/gi, localAppData);
}

let _customRootPathsCache: Record<string, string> | null = null;
let _customRootPathsCacheTs = 0;
const CUSTOM_PATHS_CACHE_TTL = 5000; // 5 seconds

function joinRootRelativePath(rootDir: string, relativePath: string): string {
  return path.join(rootDir, ...relativePath.split(/[\\/]+/).filter(Boolean));
}

export function getDefaultMcpRelativePath(
  platformId?: string,
): string | undefined {
  return platformId ? getPlatformMcpRelativePath(platformId) : "mcp.json";
}

export function getDefaultPluginsRelativePath(
  platformId?: string,
): string | undefined {
  return platformId ? getPlatformPluginsRelativePath(platformId) : undefined;
}

function deriveRootPathMap(
  overrides: Record<string, BuiltinAgentOverrideConfig>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(overrides).flatMap(([platformId, value]) =>
      typeof value.rootPath === "string" && value.rootPath.trim().length > 0
        ? [[platformId, value.rootPath.trim()] as const]
        : [],
    ),
  );
}

function hasBuiltinAgentOverrideConfig(
  override: BuiltinAgentOverrideConfig | undefined,
): boolean {
  if (!override) {
    return false;
  }

  return (
    Boolean(override.rootPath?.trim()) ||
    Boolean(override.skillsRelativePath?.trim()) ||
    Boolean(override.mcpRelativePath?.trim()) ||
    Boolean(override.pluginsRelativePath?.trim()) ||
    Boolean(override.rulesRelativePath?.trim()) ||
    Boolean(override.agentsRelativePath?.trim()) ||
    Boolean(override.commandsRelativePath?.trim()) ||
    Boolean(
      override.configRelativePaths?.some((entry) => entry.trim().length > 0),
    )
  );
}

function readBuiltinAgentOverridesFromSettings(): Record<
  string,
  BuiltinAgentOverrideConfig
> {
  return new AgentSettingsRepository(getDatabase()).read()
    .builtinAgentOverrides;
}

function readPlatformRootPathsFromSettings(): Record<string, string> {
  const now = Date.now();
  if (
    _customRootPathsCache &&
    now - _customRootPathsCacheTs < CUSTOM_PATHS_CACHE_TTL
  ) {
    return _customRootPathsCache;
  }
  _customRootPathsCache = deriveRootPathMap(
    readBuiltinAgentOverridesFromSettings(),
  );
  _customRootPathsCacheTs = now;
  return _customRootPathsCache;
}

export function readCustomAgentsFromSettings(): CustomAgentConfig[] {
  return new AgentSettingsRepository(getDatabase()).read().customAgents;
}

export function getCustomAgentPlatforms(): SkillPlatform[] {
  return readCustomAgentsFromSettings()
    .filter((agent) => agent.enabled !== false)
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      icon: "Bot",
      rootDir: {
        darwin: agent.rootPath,
        win32: agent.rootPath,
        linux: agent.rootPath,
      },
      skillsRelativePath: agent.skillsRelativePath || "skills",
      mcpRelativePath: agent.mcpRelativePath || undefined,
      pluginsRelativePath: agent.pluginsRelativePath || undefined,
      globalRuleFile: agent.rulesRelativePath || undefined,
      configFiles: agent.configRelativePaths || [],
      isCustom: true,
    }));
}

export function getConfiguredBuiltinAgentPlatformIds(): string[] {
  return Object.entries(readBuiltinAgentOverridesFromSettings())
    .filter(([, override]) => hasBuiltinAgentOverrideConfig(override))
    .map(([platformId]) => platformId);
}

/**
 * Invalidate the cached custom platform paths so the next call reads from DB.
 */
export function invalidateCustomPathsCache(): void {
  _customRootPathsCache = null;
  _customRootPathsCacheTs = 0;
}

export function getBuiltinAgentOverride(
  platformId: string,
): BuiltinAgentOverrideConfig | undefined {
  return readBuiltinAgentOverridesFromSettings()[platformId];
}

export function getPlatformRootDir(
  platform: SkillPlatform,
  overrides?: Record<string, string>,
  options: {
    environment?: NodeJS.ProcessEnv;
    pathExists?: (candidate: string) => boolean;
    cwd?: string;
  } = {},
): string {
  const builtinOverride = getBuiltinAgentOverride(platform.id);
  const overridePath =
    overrides?.[platform.id] ??
    builtinOverride?.rootPath ??
    readPlatformRootPathsFromSettings()[platform.id];

  if (typeof overridePath === "string" && overridePath.trim()) {
    return resolvePlatformPath(overridePath.trim());
  }

  const osKey = process.platform as "darwin" | "win32" | "linux";
  const template = platform.rootDir[osKey] || platform.rootDir.linux;
  const primaryRoot = resolvePlatformPath(template);
  if (!platform.rootEnvironmentVariable && !platform.rootDirFallbacks) {
    return primaryRoot;
  }

  const environment = options.environment ?? process.env;
  const pathExists = options.pathExists ?? fs.existsSync;
  const currentEnvironmentRoot = normalizeEnvironmentRoot(
    environment[platform.rootEnvironmentVariable || ""],
    platform.environmentRootRelativeToCwd,
    options.cwd,
  );
  if (currentEnvironmentRoot) return currentEnvironmentRoot;
  if (pathExists(primaryRoot)) return primaryRoot;

  const legacyEnvironmentRoot = normalizeEnvironmentRoot(
    environment[platform.legacyRootEnvironmentVariable || ""],
    false,
    options.cwd,
  );
  if (legacyEnvironmentRoot) return legacyEnvironmentRoot;

  for (const fallback of platform.rootDirFallbacks?.[osKey] || []) {
    const candidate = resolvePlatformPath(fallback);
    if (pathExists(candidate)) return candidate;
  }
  return primaryRoot;
}

function normalizeEnvironmentRoot(
  value: string | undefined,
  allowRelative = false,
  cwd = process.cwd(),
): string | null {
  if (!value?.trim() || value.includes("\0")) return null;
  const resolved = resolvePlatformPath(value.trim());
  if (path.isAbsolute(resolved)) return path.normalize(resolved);
  return allowRelative ? path.resolve(cwd, resolved) : null;
}

export function getPlatformSkillsDir(
  platform: SkillPlatform,
  overrides?: Record<string, string>,
): string {
  const rootDir = getPlatformRootDir(platform, overrides);
  const relativePath =
    getBuiltinAgentOverride(platform.id)?.skillsRelativePath ||
    platform.skillsRelativePath;

  return joinRootRelativePath(rootDir, relativePath);
}

export function getPlatformGlobalRulePath(
  platform: SkillPlatform,
  overrides?: Record<string, string>,
): string | null {
  const relativePath =
    getBuiltinAgentOverride(platform.id)?.rulesRelativePath ||
    platform.globalRuleFile;

  if (!relativePath) {
    return null;
  }

  const rootDir = getPlatformRootDir(platform, overrides);
  return joinRootRelativePath(rootDir, relativePath);
}

export function getPlatformPluginDir(
  platform: SkillPlatform,
  overrides?: Record<string, string>,
): string {
  const rootDir = getPlatformRootDir(platform, overrides);
  const relativePath =
    getBuiltinAgentOverride(platform.id)?.pluginsRelativePath ||
    getDefaultPluginsRelativePath(platform.id);

  if (!relativePath) {
    throw new Error(`${platform.name} does not support Agent Plugin packages`);
  }

  return joinRootRelativePath(rootDir, relativePath);
}

export function migrateLegacySkillPathToRootPath(
  platform: SkillPlatform,
  legacySkillPath: string,
): string {
  return resolvePlatformPath(
    normalizeLegacySkillPathToRootTemplate(platform, legacySkillPath),
  );
}
