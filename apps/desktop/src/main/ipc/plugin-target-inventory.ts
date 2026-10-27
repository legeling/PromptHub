import fs from "fs";
import path from "path";
import { emptyPluginInventory } from "@prompthub/core";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import { isAntigravityPluginManifest } from "@prompthub/shared/utils/antigravity-plugin";
import { isCodexPortablePluginManifest } from "@prompthub/shared/utils/codex-plugin";
import { readLocalPluginManifest } from "@prompthub/core/plugin-library/package-validation";
import type {
  PluginCapabilityKind,
  PluginInventorySummary,
  PluginTargetInstalledPlugin,
} from "@prompthub/shared/types/plugin";
import {
  getDefaultPluginsRelativePath,
  getPlatformPluginDir,
  getPlatformRootDir,
} from "../services/skill-installer-utils";
import { normalizePluginDirectorySegment } from "./plugin-target-paths";
import { getDirectPluginScanEntries } from "./plugin-target-links";

const COMMON_ROOT_IGNORED_DIRS = new Set([
  ".git",
  ".claude",
  "agents",
  "backups",
  "cache",
  "commands",
  "debug",
  "file-history",
  "hooks",
  "ide",
  "image-cache",
  "paste-cache",
  "plans",
  "plugins",
  "projects",
  "rules",
  "session-env",
  "sessions",
  "shell-snapshots",
  "skills",
  "tasks",
  "telemetry",
  "transcripts",
  "uploads",
]);

const PLUGIN_JSON_MAX_BYTES = 1024 * 1024;

const PLUGIN_DIR_INVENTORY: Array<{
  key: PluginCapabilityKind;
  dirs: string[];
}> = [
  { key: "skills", dirs: ["skills", "workflow-skills"] },
  { key: "mcpServers", dirs: ["mcp", "mcpServers"] },
  { key: "commands", dirs: ["commands"] },
  { key: "hooks", dirs: ["hooks"] },
  { key: "agents", dirs: ["agents"] },
  { key: "assets", dirs: ["assets"] },
  { key: "docs", dirs: ["docs", "references", "templates", "workflows"] },
  { key: "scripts", dirs: ["scripts", "bin"] },
];

interface PluginTargetScanConfig {
  targetId: string;
  platformId: string;
  markerPaths: string[];
  recursiveRoots: Array<
    "platform-plugin-dir" | "root-plugin-cache" | "root-plugins"
  >;
  manualRoot?: boolean;
  directPackages?: boolean;
  registry?: "claude-installed-plugins" | "oh-my-pi-installed-plugins";
}

const PLUGIN_TARGET_SCAN_CONFIGS: PluginTargetScanConfig[] = [
  {
    targetId: "claude-code",
    platformId: "claude",
    markerPaths: [".claude-plugin/plugin.json"],
    recursiveRoots: ["root-plugin-cache"],
    manualRoot: true,
    registry: "claude-installed-plugins",
  },
  {
    targetId: "cursor",
    platformId: "cursor",
    markerPaths: [".cursor-plugin/plugin.json"],
    recursiveRoots: ["platform-plugin-dir"],
  },
  {
    targetId: "gemini-cli",
    platformId: "gemini",
    markerPaths: ["gemini-extension.json"],
    recursiveRoots: ["platform-plugin-dir"],
  },
  {
    targetId: "antigravity",
    platformId: "antigravity",
    markerPaths: ["plugin.json"],
    recursiveRoots: [],
    directPackages: true,
  },
  {
    targetId: "antigravity-cli",
    platformId: "antigravity-cli",
    markerPaths: ["plugin.json"],
    recursiveRoots: [],
    directPackages: true,
  },
  {
    targetId: "kiro",
    platformId: "kiro",
    markerPaths: ["POWER.md"],
    recursiveRoots: ["platform-plugin-dir"],
  },
  {
    targetId: "github-copilot",
    platformId: "copilot",
    markerPaths: [
      "plugin.json",
      ".plugin/plugin.json",
      ".github/plugin/plugin.json",
    ],
    recursiveRoots: ["platform-plugin-dir", "root-plugins"],
  },
  {
    targetId: "qwen",
    platformId: "qwen",
    markerPaths: ["qwen-extension.json"],
    recursiveRoots: ["platform-plugin-dir"],
  },
  {
    targetId: "oh-my-pi",
    platformId: "oh-my-pi",
    markerPaths: [
      ".omp-plugin/plugin.json",
      ".claude-plugin/plugin.json",
      "plugin.json",
    ],
    recursiveRoots: [],
    registry: "oh-my-pi-installed-plugins",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const stat = fs.lstatSync(filePath);
    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.size > PLUGIN_JSON_MAX_BYTES
    ) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isInsideDirectory(parentDir: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentDir, candidatePath);
  return Boolean(relativePath) && !relativePath.startsWith("..");
}

function isInsideOrEqualDirectory(
  parentDir: string,
  candidatePath: string,
): boolean {
  const relativePath = path.relative(parentDir, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function getContainedPath(
  packageDir: string,
  candidatePath: string,
): string | null {
  const realPackageDir = safeRealPath(packageDir);
  const realCandidatePath = safeRealPath(candidatePath);
  if (
    !realPackageDir ||
    !realCandidatePath ||
    !isInsideOrEqualDirectory(realPackageDir, realCandidatePath)
  ) {
    return null;
  }
  return realCandidatePath;
}

function getContainedDirectoryPath(
  packageDir: string,
  dirName: string,
): string | null {
  try {
    const dirPath = getContainedPath(
      packageDir,
      path.join(packageDir, dirName),
    );
    return dirPath && fs.statSync(dirPath).isDirectory() ? dirPath : null;
  } catch {
    return null;
  }
}

function getContainedFilePath(
  packageDir: string,
  filePath: string,
): string | null {
  try {
    const containedPath = getContainedPath(packageDir, filePath);
    return containedPath && fs.statSync(containedPath).isFile()
      ? containedPath
      : null;
  } catch {
    return null;
  }
}

function countContainedDirectoryEntries(
  packageDir: string,
  dirName: string,
): number {
  const dirPath = getContainedDirectoryPath(packageDir, dirName);
  if (!dirPath) return 0;
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".")).length;
  } catch {
    return 0;
  }
}

function getManifestInventoryCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string" && value.trim()) return 1;
  if (isRecord(value)) return Object.keys(value).length;
  return 0;
}

function getPackageMarkerPath(
  packageDir: string,
  markerPaths: string[],
): string | null {
  const portablePath = getContainedFilePath(
    packageDir,
    path.join(packageDir, "plugin.json"),
  );
  const portable = Boolean(
    portablePath && isCodexPortablePluginManifest(readJsonObject(portablePath)),
  );
  if (portable && markerPaths.includes(".codex-plugin/plugin.json"))
    return portablePath;
  for (const markerPath of markerPaths) {
    if (portable && markerPath === "plugin.json") continue;
    const candidatePath = path.join(packageDir, ...markerPath.split("/"));
    const containedMarkerPath = getContainedFilePath(packageDir, candidatePath);
    if (containedMarkerPath) return candidatePath;
  }
  return null;
}

function looksLikeManualPluginPackage(
  packageDir: string,
  markerPaths: string[],
): boolean {
  if (getPackageMarkerPath(packageDir, markerPaths)) return true;
  const hasRecognizedCapability = PLUGIN_DIR_INVENTORY.some(({ dirs }) =>
    dirs.some(
      (dirName) => getContainedDirectoryPath(packageDir, dirName) !== null,
    ),
  );
  if (getContainedFilePath(packageDir, path.join(packageDir, "package.json"))) {
    return hasRecognizedCapability;
  }

  const populatedCapabilityKinds = PLUGIN_DIR_INVENTORY.filter(({ dirs }) =>
    dirs.some(
      (dirName) => countContainedDirectoryEntries(packageDir, dirName) > 0,
    ),
  ).length;
  return populatedCapabilityKinds >= 2;
}

function getPluginInventory(
  packageDir: string,
  manifest: Record<string, unknown> | null,
  markerPath: string | null,
): PluginInventorySummary {
  const inventory = emptyPluginInventory();

  if (manifest) {
    for (const key of Object.keys(inventory) as PluginCapabilityKind[]) {
      inventory[key] = Math.max(
        inventory[key],
        getManifestInventoryCount(manifest[key]),
      );
    }
  }

  for (const { key, dirs } of PLUGIN_DIR_INVENTORY) {
    const count = dirs.reduce(
      (sum, dirName) =>
        sum + countContainedDirectoryEntries(packageDir, dirName),
      0,
    );
    inventory[key] = Math.max(inventory[key], count);
  }

  if (getContainedFilePath(packageDir, path.join(packageDir, ".mcp.json"))) {
    inventory.mcpServers = Math.max(inventory.mcpServers, 1);
  }
  if (isCodexPortablePluginManifest(manifest)) {
    const mcp = getContainedFilePath(
      packageDir,
      path.join(packageDir, "mcp.json"),
    );
    const config = mcp ? readJsonObject(mcp) : null;
    if (isRecord(config?.mcpServers))
      inventory.mcpServers = Math.max(
        inventory.mcpServers,
        Object.keys(config.mcpServers).length,
      );
  }
  if (
    markerPath === path.join(packageDir, "plugin.json") &&
    isAntigravityPluginManifest(manifest)
  ) {
    if (
      getContainedFilePath(packageDir, path.join(packageDir, "mcp_config.json"))
    ) {
      inventory.mcpServers = Math.max(inventory.mcpServers, 1);
    }
    if (getContainedFilePath(packageDir, path.join(packageDir, "hooks.json"))) {
      inventory.hooks = Math.max(inventory.hooks, 1);
    }
  }
  if (markerPath && path.basename(markerPath) === "POWER.md") {
    inventory.docs = Math.max(inventory.docs, 1);
  }

  return inventory;
}

export function pluginInventoryTotal(
  inventory: PluginInventorySummary,
): number {
  return Object.values(inventory).reduce((sum, count) => sum + count, 0);
}

function getClaudePluginNameFromRegistryKey(key: string): string {
  return key.split("@")[0]?.trim() || key;
}

export function buildTargetPlugin(
  targetId: string,
  packageDir: string,
  fallbackName: string,
  markerPaths: string[],
  allowManualPackage: boolean,
): PluginTargetInstalledPlugin | null {
  try {
    if (!fs.statSync(packageDir).isDirectory()) return null;
  } catch {
    return null;
  }
  if (!allowManualPackage && !getPackageMarkerPath(packageDir, markerPaths)) {
    return null;
  }
  if (
    allowManualPackage &&
    !looksLikeManualPluginPackage(packageDir, markerPaths)
  ) {
    return null;
  }

  const markerPath = getPackageMarkerPath(packageDir, markerPaths);
  const manifest =
    markerPath && path.basename(markerPath) !== "POWER.md"
      ? isCodexPortablePluginManifest(readJsonObject(markerPath))
        ? readLocalPluginManifest(markerPath).manifest
        : readJsonObject(markerPath)
      : null;
  const interfaceRecord = isRecord(manifest?.interface)
    ? manifest.interface
    : {};
  const name =
    safeString(manifest?.name) ||
    safeString(fallbackName) ||
    path.basename(packageDir);
  const displayName =
    safeString(interfaceRecord.displayName) ||
    safeString(manifest?.displayName) ||
    name;
  const description =
    safeString(interfaceRecord.shortDescription) ||
    safeString(manifest?.description);
  const inventory = getPluginInventory(packageDir, manifest, markerPath);

  if (targetId === "antigravity" || targetId === "antigravity-cli") {
    if (!isAntigravityPluginManifest(manifest)) return null;
  } else if (pluginInventoryTotal(inventory) === 0) return null;

  return {
    id: `${targetId}:${normalizePluginDirectorySegment(name)}:${normalizePluginDirectorySegment(packageDir)}`,
    name,
    displayName,
    description,
    version: safeString(manifest?.version),
    sourcePath: packageDir,
    inventory,
  };
}

function safeRealPath(dirPath: string): string | null {
  try {
    return fs.realpathSync(path.resolve(dirPath));
  } catch {
    return null;
  }
}

function collectMarkerPackages(
  rootDir: string,
  markerPaths: string[],
  maxDepth = 5,
): string[] {
  const realRootDir = safeRealPath(rootDir);
  if (!realRootDir) return [];
  const packages: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [
    { dir: realRootDir, depth: 0 },
  ];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (getPackageMarkerPath(current.dir, markerPaths)) {
      packages.push(current.dir);
      continue;
    }
    if (current.depth >= maxDepth) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      queue.push({
        dir: path.join(current.dir, entry.name),
        depth: current.depth + 1,
      });
    }
  }
  return packages;
}

function addTargetPluginPackage(params: {
  allowManualPackage: boolean;
  containmentRootDir: string;
  fallbackName: string;
  markerPaths: string[];
  packageDir: string;
  plugins: PluginTargetInstalledPlugin[];
  seenRealPaths: Set<string>;
  targetId: string;
}): void {
  const realPackageDir = safeRealPath(params.packageDir);
  if (!realPackageDir) return;
  if (!isInsideOrEqualDirectory(params.containmentRootDir, realPackageDir))
    return;
  if (params.seenRealPaths.has(realPackageDir)) return;
  const plugin = buildTargetPlugin(
    params.targetId,
    params.packageDir,
    params.fallbackName,
    params.markerPaths,
    params.allowManualPackage,
  );
  if (!plugin) return;
  params.seenRealPaths.add(realPackageDir);
  params.plugins.push(plugin);
}

function getScanRootPath(
  rootDir: string,
  pluginDir: string,
  rootKind: PluginTargetScanConfig["recursiveRoots"][number],
): string {
  if (rootKind === "platform-plugin-dir") return pluginDir;
  if (rootKind === "root-plugin-cache")
    return path.join(rootDir, "plugins", "cache");
  return path.join(rootDir, "plugins");
}

function getPluginDirForScan(
  platformId: string,
  rootDir: string,
  rootPathOverride?: string,
): string | null {
  const platform = getPlatformById(platformId);
  if (!platform) return null;
  if (!rootPathOverride) return getPlatformPluginDir(platform);

  const relativePath = getDefaultPluginsRelativePath(platformId);
  if (!relativePath) return null;
  return path.join(rootDir, ...relativePath.split(/[\\/]+/).filter(Boolean));
}

export function scanInstalledPluginsForTarget(
  targetId: string,
  rootPathOverride?: string,
): PluginTargetInstalledPlugin[] {
  const config = PLUGIN_TARGET_SCAN_CONFIGS.find(
    (entry) => entry.targetId === targetId,
  );
  if (!config) return [];
  const platform = getPlatformById(config.platformId);
  if (!platform) return [];
  const rootDir = rootPathOverride ?? getPlatformRootDir(platform);
  const plugins = scanInstalledPluginsAtRoot(targetId, rootPathOverride);
  const seen = new Set(
    plugins.map((plugin) => safeRealPath(plugin.sourcePath)),
  );
  for (const relativeRoot of platform.pluginDiscoveryRootRelativePaths ?? []) {
    for (const plugin of scanInstalledPluginsAtRoot(
      targetId,
      path.resolve(rootDir, relativeRoot),
    )) {
      const realPath = safeRealPath(plugin.sourcePath);
      if (seen.has(realPath)) continue;
      seen.add(realPath);
      plugins.push(plugin);
    }
  }
  return plugins;
}

function scanInstalledPluginsAtRoot(
  targetId: string,
  rootPathOverride?: string,
): PluginTargetInstalledPlugin[] {
  const config = PLUGIN_TARGET_SCAN_CONFIGS.find(
    (entry) => entry.targetId === targetId,
  );
  if (!config) return [];
  const platform = getPlatformById(config.platformId);
  if (!platform) return [];
  const configuredRoot = rootPathOverride ?? getPlatformRootDir(platform);
  const resolvedRootDir = safeRealPath(configuredRoot);
  if (!resolvedRootDir && !config.directPackages) return [];
  const rootDir = resolvedRootDir ?? path.resolve(configuredRoot);
  const pluginDir = getPluginDirForScan(
    config.platformId,
    rootDir,
    rootPathOverride,
  );
  if (!pluginDir) return [];
  const seenRealPaths = new Set<string>();
  const plugins: PluginTargetInstalledPlugin[] = [];
  const hasClaudeInstalledRegistry =
    config.registry === "claude-installed-plugins" &&
    fs.existsSync(path.join(rootDir, "plugins", "installed_plugins.json"));

  if (config.directPackages && fs.existsSync(pluginDir)) {
    for (const entry of getDirectPluginScanEntries(
      pluginDir,
      fs.realpathSync(pluginDir),
      targetId,
    )) {
      addTargetPluginPackage({
        allowManualPackage: false,
        containmentRootDir: entry.containmentRootDir,
        fallbackName: entry.name,
        markerPaths: config.markerPaths,
        packageDir: path.join(pluginDir, entry.name),
        plugins,
        seenRealPaths,
        targetId,
      });
    }
  }

  if (config.registry === "claude-installed-plugins") {
    const installedRegistry = readJsonObject(
      path.join(rootDir, "plugins", "installed_plugins.json"),
    );
    const registryPlugins = isRecord(installedRegistry?.plugins)
      ? installedRegistry.plugins
      : {};
    for (const [registryKey, installs] of Object.entries(registryPlugins)) {
      if (!Array.isArray(installs)) continue;
      for (const install of installs) {
        if (!isRecord(install)) continue;
        const installPath = safeString(install.installPath);
        if (installPath) {
          addTargetPluginPackage({
            allowManualPackage: false,
            containmentRootDir: rootDir,
            fallbackName: getClaudePluginNameFromRegistryKey(registryKey),
            markerPaths: config.markerPaths,
            packageDir: installPath,
            plugins,
            seenRealPaths,
            targetId,
          });
        }
      }
    }
  }

  if (config.registry === "oh-my-pi-installed-plugins") {
    const realPluginDir = safeRealPath(pluginDir);
    const installedRegistry = realPluginDir
      ? readJsonObject(path.join(realPluginDir, "installed_plugins.json"))
      : null;
    const registryPlugins =
      installedRegistry?.version === 2 && isRecord(installedRegistry.plugins)
        ? installedRegistry.plugins
        : {};
    for (const [registryKey, installs] of Object.entries(registryPlugins)) {
      if (!realPluginDir || !Array.isArray(installs)) continue;
      for (const install of installs) {
        if (!isRecord(install) || install.scope !== "user") continue;
        const installPath = safeString(install.installPath);
        if (!installPath) continue;
        addTargetPluginPackage({
          allowManualPackage: true,
          containmentRootDir: realPluginDir,
          fallbackName: getClaudePluginNameFromRegistryKey(registryKey),
          markerPaths: config.markerPaths,
          packageDir: installPath,
          plugins,
          seenRealPaths,
          targetId,
        });
      }
    }
  }

  for (const rootKind of config.recursiveRoots) {
    // Claude retains downloaded cache packages after uninstall; its registry owns installed state.
    if (
      hasClaudeInstalledRegistry &&
      (rootKind === "root-plugin-cache" || rootKind === "platform-plugin-dir")
    )
      continue;
    const scanRoot = getScanRootPath(rootDir, pluginDir, rootKind);
    for (const packageDir of collectMarkerPackages(
      scanRoot,
      config.markerPaths,
    )) {
      addTargetPluginPackage({
        allowManualPackage: false,
        containmentRootDir: rootDir,
        fallbackName: path.basename(packageDir),
        markerPaths: config.markerPaths,
        packageDir,
        plugins,
        seenRealPaths,
        targetId,
      });
    }
  }

  if (config.manualRoot) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch {
      return plugins;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (COMMON_ROOT_IGNORED_DIRS.has(entry.name)) continue;
      addTargetPluginPackage({
        allowManualPackage: true,
        containmentRootDir: rootDir,
        fallbackName: entry.name,
        markerPaths: config.markerPaths,
        packageDir: path.join(rootDir, entry.name),
        plugins,
        seenRealPaths,
        targetId,
      });
    }
  }

  return plugins.sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}
