import fs from "node:fs";
import path from "node:path";
import type {
  PluginLibraryEntry,
  PluginImportChildMcpResult,
} from "@prompthub/shared/types/plugin";
import type { CorePluginLibraryService } from "./plugin-library";
import type { CoreMcpLibraryService } from "./mcp-library";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function safeRealPath(value: string): string | null {
  try {
    return fs.realpathSync(value);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}
function isInsideOrEqualDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    !relative.startsWith(".." + path.sep) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}
const CHILD_MCP_SCAN_IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  "cache",
  "dist",
  "build",
  "node_modules",
  "vendor",
]);

const CHILD_MCP_SCAN_MAX_DEPTH = 5;
const CHILD_MCP_SCAN_MAX_FILES = 40;
const CHILD_MCP_CONFIG_MAX_BYTES = 1024 * 1024;
function splitSafeRelativePath(value: string | undefined): string[] {
  if (!value) return [];
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts.every((part) => part !== "." && part !== "..") ? parts : [];
}
function resolvePluginPackagePath(plugin: PluginLibraryEntry): string | null {
  const candidates: string[] = [];
  const sourcePackageParts = splitSafeRelativePath(plugin.source.packagePath);
  const repositoryPath =
    plugin.localRepositoryPath || plugin.source.localRepositoryPath;
  if (plugin.localPackagePath) candidates.push(plugin.localPackagePath);
  if (repositoryPath && sourcePackageParts.length > 0) {
    candidates.push(path.join(repositoryPath, ...sourcePackageParts));
  }
  if (plugin.source.localPackagePath) {
    candidates.push(plugin.source.localPackagePath);
  }
  if (plugin.managedPath) candidates.push(plugin.managedPath);
  if (repositoryPath) candidates.push(repositoryPath);

  for (const candidate of candidates) {
    try {
      const realPath = fs.realpathSync(path.resolve(candidate));
      if (fs.statSync(realPath).isDirectory()) {
        return realPath;
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        continue;
      throw new Error(
        `Plugin package directory could not be read: ${candidate}`,
      );
    }
  }
  return null;
}

function hasMcpJsonConfigShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["mcpServers", "servers", "mcp"].some((key) => isRecord(value[key]));
}

function looksLikeMcpConfigFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== ".json" && extension !== ".toml") return false;
  if (
    /^(\.mcp|mcp|mcp[-_]servers)\.(json|toml)$/i.test(path.basename(filePath))
  )
    return true;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > CHILD_MCP_CONFIG_MAX_BYTES) {
      return false;
    }
    const content = fs.readFileSync(filePath, "utf8");
    if (extension === ".toml") {
      return /^\s*\[mcp_servers(?:\.|\])/m.test(content);
    }
    return hasMcpJsonConfigShape(JSON.parse(content));
  } catch {
    return false;
  }
}

function collectChildMcpConfigFiles(packageDir: string): string[] {
  const realRootDir = safeRealPath(packageDir);
  if (!realRootDir) return [];
  const files: string[] = [];
  const queue: Array<{ depth: number; dir: string }> = [
    { depth: 0, dir: realRootDir },
  ];

  while (queue.length > 0 && files.length < CHILD_MCP_SCAN_MAX_FILES) {
    const current = queue.shift();
    if (!current) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      throw new Error(
        `Plugin MCP directory could not be scanned: ${current.dir}`,
      );
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".mcp.json") continue;
      if (entry.isSymbolicLink()) continue;
      const candidatePath = path.join(current.dir, entry.name);
      const realCandidate = safeRealPath(candidatePath);
      if (
        !realCandidate ||
        !isInsideOrEqualDirectory(realRootDir, realCandidate)
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        if (
          current.depth < CHILD_MCP_SCAN_MAX_DEPTH &&
          !CHILD_MCP_SCAN_IGNORED_DIRS.has(entry.name)
        ) {
          queue.push({ depth: current.depth + 1, dir: realCandidate });
        }
        continue;
      }
      if (looksLikeMcpConfigFile(realCandidate)) {
        files.push(realCandidate);
      }
      if (files.length >= CHILD_MCP_SCAN_MAX_FILES) break;
    }
  }

  if (files.length >= CHILD_MCP_SCAN_MAX_FILES)
    throw new Error("Plugin MCP configuration scan limit exceeded");
  return files.sort((left, right) => left.localeCompare(right));
}

export function importChildMcpServersForPlugin(
  service: CorePluginLibraryService,
  pluginId: string,
  mcpService: Pick<CoreMcpLibraryService, "importFromFile">,
): PluginImportChildMcpResult {
  const plugin = service.read().plugins.find((entry) => entry.id === pluginId);
  if (!plugin) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }
  const packagePath = resolvePluginPackagePath(plugin);
  if (!packagePath) {
    throw new Error(
      `Plugin has no local package folder: ${plugin.displayName}`,
    );
  }

  const scannedFiles = collectChildMcpConfigFiles(packagePath);
  const result: PluginImportChildMcpResult = {
    imported: [],
    skipped: [],
    scannedFiles,
    failedFiles: [],
  };

  for (const filePath of scannedFiles) {
    try {
      if (fs.statSync(filePath).size > CHILD_MCP_CONFIG_MAX_BYTES)
        throw new Error("MCP configuration exceeds size limit");
      const imported = mcpService.importFromFile(filePath);
      result.imported.push(...imported.imported);
      result.skipped.push(...imported.skipped);
    } catch {
      result.failedFiles.push({
        path: filePath,
        error:
          "MCP configuration could not be imported; check its format, size and file access",
      });
    }
  }

  return result;
}
