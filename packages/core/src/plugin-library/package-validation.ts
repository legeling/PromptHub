import fs from "fs";
import path from "path";
import { isAntigravityPluginManifest } from "@prompthub/shared/utils/antigravity-plugin";
import {
  isCodexPortablePluginManifest,
  mergeCodexPortablePluginManifest,
} from "@prompthub/shared/utils/codex-plugin";

import type {
  PluginInventorySummary,
  PluginLibraryFile,
  PluginPackageHealthCheck,
  PluginPackageHealthFinding,
} from "@prompthub/shared/types/plugin";

import {
  CorePluginError,
  LOCAL_PLUGIN_INVENTORY_DIRS,
  LOCAL_PLUGIN_MANIFEST_NESTED_PATH_FIELDS,
  LOCAL_PLUGIN_MANIFEST_PATH_FIELDS,
  LOCAL_PLUGIN_MARKER_PATHS,
  MAX_LOCAL_PLUGIN_MANIFEST_BYTES,
  TARGET_PLUGIN_MARKER_PATHS,
  type RawRecord,
  ensureInsideDirectory,
  getPluginLocalPackagePath,
  isAbsoluteHttpUrl,
  normalizeRelativePosixPath,
  nowIso,
  parseJsonObject,
} from "./shared";
import { extractPluginInventoryFromManifest } from "./marketplace";

function countLocalDirectoryEntries(dirPath: string): number {
  try {
    if (!fs.statSync(dirPath).isDirectory()) {
      return 0;
    }
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".")).length;
  } catch {
    return 0;
  }
}

export function findLocalPluginMarker(packagePath: string): string | null {
  return findLocalPluginMarkers(packagePath)[0] ?? null;
}

export function findLocalPluginMarkers(packagePath: string): string[] {
  const markers: string[] = [];
  for (const markerPath of new Set([
    ...LOCAL_PLUGIN_MARKER_PATHS,
    ...Object.values(TARGET_PLUGIN_MARKER_PATHS),
  ])) {
    const candidatePath = path.join(packagePath, ...markerPath.split("/"));
    if (fs.existsSync(candidatePath)) {
      markers.push(candidatePath);
    }
  }
  const root = path.join(packagePath, "plugin.json");
  if (
    markers.includes(root) &&
    isCodexPortablePluginManifest(readLocalPluginManifest(root).manifest)
  )
    return [root, ...markers.filter((marker) => marker !== root)];
  return markers;
}

export function findLocalPluginMarkerForTarget(
  packagePath: string,
  targetId: string,
): string | null {
  const root = path.join(packagePath, "plugin.json");
  if (
    ["codex", "antigravity", "antigravity-cli", "github-copilot"].includes(
      targetId,
    ) &&
    fs.existsSync(root)
  ) {
    const portable = isCodexPortablePluginManifest(
      readLocalPluginManifest(root).manifest,
    );
    if (portable) return targetId === "codex" ? root : null;
  }
  const markerPath = TARGET_PLUGIN_MARKER_PATHS[targetId];
  if (!markerPath) {
    return null;
  }
  const candidatePath = path.join(packagePath, ...markerPath.split("/"));
  return fs.existsSync(candidatePath) ? candidatePath : null;
}

export function getLocalPluginNativeTargetIds(packagePath: string): string[] {
  return inspectLocalPluginNativeTargets(packagePath).nativeTargetIds;
}

export function inspectLocalPluginNativeTargets(
  packagePath: string,
  validatePackageLinks = true,
): {
  invalidNativeTargetIds: string[];
  nativeTargetIds: string[];
} {
  const targetIds: string[] = [];
  const invalidTargetIds: string[] = [];
  let foundTargetMarker = false;
  for (const targetId of Object.keys(TARGET_PLUGIN_MARKER_PATHS)) {
    const markerPath = findLocalPluginMarkerForTarget(packagePath, targetId);
    if (!markerPath) {
      continue;
    }
    foundTargetMarker = true;
    try {
      const markerStat = fs.lstatSync(markerPath);
      if (!markerStat.isFile()) {
        throw new CorePluginError(
          "INVALID_PATH",
          `Plugin manifest must be a regular file: ${markerPath}`,
        );
      }
      ensureInsideDirectory(
        fs.realpathSync(packagePath),
        fs.realpathSync(markerPath),
      );
      const { manifest } = readLocalPluginManifest(markerPath);
      if (
        ["antigravity", "antigravity-cli"].includes(targetId) &&
        !isAntigravityPluginManifest(manifest)
      ) {
        throw new CorePluginError(
          "INVALID_MANIFEST",
          "Invalid Antigravity native plugin.json",
        );
      }
      validateLocalPluginManifestPaths(packagePath, manifest);
      targetIds.push(targetId);
    } catch {
      invalidTargetIds.push(targetId);
    }
  }
  if (foundTargetMarker && validatePackageLinks) {
    validateLocalPluginSymlinkBoundaries(packagePath);
  }
  return {
    invalidNativeTargetIds: invalidTargetIds,
    nativeTargetIds: targetIds,
  };
}

function parsePowerManifest(content: string): RawRecord {
  const match = /^---\s*\n([\s\S]*?)\n---/m.exec(content);
  if (!match) {
    return {};
  }
  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(line.trim()))
      .filter((entry): entry is RegExpExecArray => Boolean(entry))
      .map((entry) => [entry[1], entry[2].replace(/^["']|["']$/g, "")]),
  );
}

export function readLocalPluginManifest(markerPath: string): {
  manifest: RawRecord;
  markerPath: string;
} {
  const stat = fs.lstatSync(markerPath);
  if (!stat.isFile()) {
    throw new CorePluginError(
      "INVALID_PATH",
      `Plugin manifest must be a regular file: ${markerPath}`,
    );
  }
  if (stat.size > MAX_LOCAL_PLUGIN_MANIFEST_BYTES) {
    throw new CorePluginError(
      "PACKAGE_TOO_LARGE",
      `Plugin manifest exceeds ${MAX_LOCAL_PLUGIN_MANIFEST_BYTES} bytes: ${markerPath}`,
    );
  }
  if (path.basename(markerPath) === "POWER.md") {
    return {
      markerPath,
      manifest: parsePowerManifest(fs.readFileSync(markerPath, "utf8")),
    };
  }
  const manifest = parseJsonObject(
    fs.readFileSync(markerPath, "utf8"),
    "Local Plugin manifest",
  );
  if (
    path.basename(markerPath) !== "plugin.json" ||
    !isCodexPortablePluginManifest(manifest)
  )
    return { markerPath, manifest };
  const extensions = manifest.extensions;
  const inline =
    extensions && typeof extensions === "object"
      ? Reflect.get(extensions, "com.openai")
      : undefined;
  const legacy = path.join(
    path.dirname(markerPath),
    ".codex-plugin",
    "plugin.json",
  );
  const overlay =
    inline === undefined && fs.existsSync(legacy)
      ? readLocalPluginManifest(legacy).manifest
      : {};
  return {
    markerPath,
    manifest: mergeCodexPortablePluginManifest(manifest, overlay),
  };
}

export function extractLocalPluginInventory(
  packagePath: string,
  manifest: RawRecord,
  markerPath: string,
): PluginInventorySummary {
  const inventory = extractPluginInventoryFromManifest(manifest);
  for (const { key, dirs } of LOCAL_PLUGIN_INVENTORY_DIRS) {
    const count = dirs.reduce(
      (sum, dirName) =>
        sum + countLocalDirectoryEntries(path.join(packagePath, dirName)),
      0,
    );
    inventory[key] = Math.max(inventory[key], count);
  }
  if (fs.existsSync(path.join(packagePath, ".mcp.json"))) {
    inventory.mcpServers = Math.max(inventory.mcpServers, 1);
  }
  if (
    isCodexPortablePluginManifest(manifest) &&
    fs.existsSync(path.join(packagePath, "mcp.json"))
  ) {
    const config = parseJsonObject(
      fs.readFileSync(path.join(packagePath, "mcp.json"), "utf8"),
      "Portable MCP config",
    );
    const servers = config.mcpServers;
    if (servers && typeof servers === "object" && !Array.isArray(servers))
      inventory.mcpServers = Math.max(
        inventory.mcpServers,
        Object.keys(servers).length,
      );
  }
  if (
    markerPath === path.join(packagePath, "plugin.json") &&
    isAntigravityPluginManifest(manifest)
  ) {
    if (fs.existsSync(path.join(packagePath, "mcp_config.json"))) {
      inventory.mcpServers = Math.max(inventory.mcpServers, 1);
    }
    if (fs.existsSync(path.join(packagePath, "hooks.json"))) {
      inventory.hooks = Math.max(inventory.hooks, 1);
    }
  }
  if (path.basename(markerPath) === "POWER.md") {
    inventory.docs = Math.max(inventory.docs, 1);
  }
  return inventory;
}

function validateLocalPluginManifestPathValue(
  packagePath: string,
  rawValue: string,
): void {
  const value = rawValue.trim();
  if (!value || isAbsoluteHttpUrl(value)) {
    return;
  }
  const safeRelativePath = normalizeRelativePosixPath(value);
  const targetPath = path.join(packagePath, ...safeRelativePath.split("/"));
  ensureInsideDirectory(packagePath, targetPath);
}

function validateLocalPluginManifestPathList(
  packagePath: string,
  value: unknown,
): void {
  if (typeof value === "string") {
    validateLocalPluginManifestPathValue(packagePath, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      validateLocalPluginManifestPathList(packagePath, item);
    }
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  for (const nestedValue of Object.values(value as RawRecord)) {
    if (typeof nestedValue === "string") {
      validateLocalPluginManifestPathValue(packagePath, nestedValue);
    } else {
      validateLocalPluginManifestPathList(packagePath, nestedValue);
    }
  }
}

function validateLocalPluginManifestNestedPaths(
  packagePath: string,
  value: unknown,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      validateLocalPluginManifestNestedPaths(packagePath, item);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nestedValue] of Object.entries(value as RawRecord)) {
    if (
      LOCAL_PLUGIN_MANIFEST_NESTED_PATH_FIELDS.has(key) &&
      typeof nestedValue === "string"
    ) {
      validateLocalPluginManifestPathValue(packagePath, nestedValue);
      continue;
    }
    validateLocalPluginManifestNestedPaths(packagePath, nestedValue);
  }
}

function validateLocalPluginManifestPaths(
  packagePath: string,
  manifest: RawRecord,
): void {
  for (const [key, value] of Object.entries(manifest)) {
    if (LOCAL_PLUGIN_MANIFEST_PATH_FIELDS.has(key)) {
      validateLocalPluginManifestPathList(packagePath, value);
      continue;
    }
    validateLocalPluginManifestNestedPaths(packagePath, value);
  }
}

function validateLocalPluginSymlinkBoundaries(packagePath: string): void {
  const root = fs.realpathSync(packagePath);
  const queue = [packagePath];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        let targetPath: string;
        try {
          targetPath = fs.realpathSync(entryPath);
        } catch {
          throw new CorePluginError(
            "INVALID_PATH",
            `Plugin 软链接目标无效: ${entryPath}`,
          );
        }
        ensureInsideDirectory(root, targetPath);
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(entryPath);
      }
    }
  }
}

export function validateLocalPluginPackage(
  packagePath: string,
  manifest: RawRecord,
): void {
  validateLocalPluginManifestPaths(packagePath, manifest);
  validateLocalPluginSymlinkBoundaries(packagePath);
}

export function createPluginPackageHealthFinding(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  targetPath?: string,
): PluginPackageHealthFinding {
  if (error instanceof CorePluginError) {
    return {
      code: error.code,
      severity: "error",
      message: error.message,
      path: targetPath,
    };
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      severity: "error",
      message: error.message || fallbackMessage,
      path: targetPath,
    };
  }
  return {
    code: fallbackCode,
    severity: "error",
    message: fallbackMessage,
    path: targetPath,
  };
}

function assertReadablePluginDirectory(
  directoryPath: string,
  label: string,
): void {
  const stat = fs.existsSync(directoryPath)
    ? fs.statSync(directoryPath)
    : undefined;
  if (!directoryPath.trim() || !stat?.isDirectory()) {
    throw new CorePluginError(
      "MISSING_SOURCE",
      `${label} 不存在或不是目录: ${directoryPath}`,
    );
  }
}

function missingPluginPackageCheck(
  pluginId: string,
  checkedAt: string,
  displayName: string,
  packagePath: string,
): PluginPackageHealthCheck {
  return {
    status: "missing-package",
    pluginId,
    checkedAt,
    packagePath: packagePath || undefined,
    findings: [
      {
        code: "MISSING_PACKAGE",
        severity: "error",
        message: `${displayName} 本地 Plugin 包不存在`,
        path: packagePath || undefined,
      },
    ],
  };
}

function notInstalledPackageCheck(
  pluginId: string,
  checkedAt: string,
): PluginPackageHealthCheck {
  return {
    status: "not-installed",
    pluginId,
    checkedAt,
    findings: [
      {
        code: "NOT_FOUND",
        severity: "error",
        message: `Plugin 不存在: ${pluginId}`,
      },
    ],
  };
}

function unreadablePluginPackageCheck(
  pluginId: string,
  checkedAt: string,
  displayName: string,
  packagePath: string,
  error: unknown,
): PluginPackageHealthCheck {
  return {
    status: "missing-package",
    pluginId,
    checkedAt,
    packagePath,
    findings: [
      createPluginPackageHealthFinding(
        error,
        "MISSING_PACKAGE",
        `${displayName} 本地 Plugin 包不可读`,
        packagePath,
      ),
    ],
  };
}

function missingPluginManifestCheck(
  pluginId: string,
  checkedAt: string,
  packagePath: string,
): PluginPackageHealthCheck {
  return {
    status: "missing-manifest",
    pluginId,
    checkedAt,
    packagePath,
    findings: [
      {
        code: "MISSING_MANIFEST",
        severity: "error",
        message: `没有找到可识别的 Plugin manifest: ${packagePath}`,
        path: packagePath,
      },
    ],
  };
}

function validateInstalledManifest(
  pluginId: string,
  checkedAt: string,
  displayName: string,
  packagePath: string,
  markerPath: string,
): PluginPackageHealthCheck {
  try {
    const { manifest } = readLocalPluginManifest(markerPath);
    validateLocalPluginPackage(packagePath, manifest);
    return {
      status: "ok",
      pluginId,
      checkedAt,
      packagePath,
      manifestPath: markerPath,
      findings: [],
    };
  } catch (error) {
    return {
      status: "invalid",
      pluginId,
      checkedAt,
      packagePath,
      manifestPath: markerPath,
      findings: [
        createPluginPackageHealthFinding(
          error,
          "INVALID_PACKAGE",
          `${displayName} Plugin 包检查失败`,
          markerPath,
        ),
      ],
    };
  }
}

export function checkInstalledPluginPackage(
  library: PluginLibraryFile,
  pluginId: string,
): PluginPackageHealthCheck {
  const checkedAt = nowIso();
  const plugin = library.plugins.find((entry) => entry.id === pluginId);
  if (!plugin) {
    return notInstalledPackageCheck(pluginId, checkedAt);
  }

  const rawPackagePath = getPluginLocalPackagePath(plugin);
  const packagePath = rawPackagePath ? path.resolve(rawPackagePath) : "";
  if (!packagePath || !fs.existsSync(packagePath)) {
    return missingPluginPackageCheck(
      pluginId,
      checkedAt,
      plugin.displayName,
      packagePath,
    );
  }

  try {
    assertReadablePluginDirectory(
      packagePath,
      `${plugin.displayName} 本地 Plugin 包`,
    );
  } catch (error) {
    return unreadablePluginPackageCheck(
      pluginId,
      checkedAt,
      plugin.displayName,
      packagePath,
      error,
    );
  }

  const markerPath = findLocalPluginMarker(packagePath);
  return markerPath
    ? validateInstalledManifest(
        pluginId,
        checkedAt,
        plugin.displayName,
        packagePath,
        markerPath,
      )
    : missingPluginManifestCheck(pluginId, checkedAt, packagePath);
}
