import fs from "fs";
import path from "path";
import * as childProcess from "child_process";
import * as crypto from "crypto";

import type {
  SkillSafetyFinding,
  SkillSafetyLevel,
  SkillSafetyReport,
} from "@prompthub/shared/types/skill";
import type {
  PluginAuthor,
  PluginDeleteOptions,
  PluginDistributeMode,
  PluginDistributeRequest,
  PluginDistributeResult,
  PluginImportLocalRequest,
  PluginImportSourceRequest,
  PluginInstallResult,
  PluginInventorySummary,
  PluginLibrarySnapshot,
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketPolicy,
  PluginMarketPreview,
  PluginMarketSource,
  PluginMetadataUpdate,
  PluginPackageHealthCheck,
  PluginPackageHealthFinding,
  PluginPackageSource,
  PluginPackageSnapshot,
  PluginSemanticClassification,
  PluginSourceKind,
  PluginSourceUpdateCheck,
  PluginSourceUpdateResult,
  PluginTargetCompatibility,
  PluginTrustLevel,
  PluginUndistributeRequest,
  PluginUndistributeResult,
  PluginVersion,
  PluginVersionFile,
  PluginVersionRollbackResult,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";

import { getConfigDir, getDataDir } from "./runtime-paths";

const PLUGIN_LIBRARY_FILE_NAME = "library.json";
const PLUGIN_MARKET_CACHE_FILE_NAME = "market-cache.json";
const PLUGIN_VERSION_FILE_NAME = "versions.json";
const LEGACY_PLUGIN_LIBRARY_FILE_NAME = "plugin-library.json";
const LEGACY_PLUGIN_MARKET_CACHE_FILE_NAME = "plugin-market-cache.json";
const PLUGIN_MARKETPLACE_FILE = ".agents/plugins/marketplace.json";
const CODEX_PLUGIN_MANIFEST_FILE = ".codex-plugin/plugin.json";
const MAX_PLUGIN_PACKAGE_SNAPSHOT_FILES = 2000;
const MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES = 5 * 1024 * 1024;
const PLUGIN_PACKAGE_SNAPSHOT_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "__pycache__",
  ".cache",
]);
const LOCAL_PLUGIN_MARKER_PATHS = [
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  "gemini-extension.json",
  "plugin.json",
  ".plugin/plugin.json",
  ".github/plugin/plugin.json",
  "POWER.md",
];
const LOCAL_PLUGIN_INVENTORY_DIRS: Array<{
  key: keyof PluginInventorySummary;
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
const LOCAL_PLUGIN_MANIFEST_PATH_FIELDS = new Set([
  "skills",
  "commands",
  "hooks",
  "agents",
  "assets",
  "docs",
  "documentation",
  "scripts",
]);
const LOCAL_PLUGIN_MANIFEST_NESTED_PATH_FIELDS = new Set([
  "path",
  "file",
  "dir",
  "directory",
  "source",
]);
const TARGET_PLUGIN_MARKER_PATHS: Record<string, string> = {
  codex: CODEX_PLUGIN_MANIFEST_FILE,
  "claude-code": ".claude-plugin/plugin.json",
  cursor: ".cursor-plugin/plugin.json",
  "gemini-cli": "gemini-extension.json",
  kiro: "POWER.md",
  "github-copilot": "plugin.json",
};
const ADAPTER_MANIFEST_CAPABILITY_FIELDS: Array<{
  fallbackPaths: string[];
  outputKey: keyof PluginInventorySummary;
  sourceKeys: string[];
}> = [
  {
    outputKey: "skills",
    sourceKeys: ["skills"],
    fallbackPaths: ["skills", "workflow-skills"],
  },
  {
    outputKey: "mcpServers",
    sourceKeys: ["mcpServers", "mcp_servers", "mcp"],
    fallbackPaths: [".mcp.json", "mcp.json", "mcp", "mcpServers"],
  },
  {
    outputKey: "apps",
    sourceKeys: ["apps", "app"],
    fallbackPaths: ["apps", ".app.json"],
  },
  {
    outputKey: "commands",
    sourceKeys: ["commands"],
    fallbackPaths: ["commands"],
  },
  {
    outputKey: "hooks",
    sourceKeys: ["hooks"],
    fallbackPaths: ["hooks"],
  },
  {
    outputKey: "agents",
    sourceKeys: ["agents"],
    fallbackPaths: ["agents"],
  },
  {
    outputKey: "assets",
    sourceKeys: ["assets"],
    fallbackPaths: ["assets"],
  },
  {
    outputKey: "docs",
    sourceKeys: ["docs", "documentation"],
    fallbackPaths: ["docs", "references", "templates", "workflows"],
  },
  {
    outputKey: "lspServers",
    sourceKeys: ["lspServers", "lsp_servers"],
    fallbackPaths: ["lspServers", "lsp"],
  },
  {
    outputKey: "scripts",
    sourceKeys: ["scripts"],
    fallbackPaths: ["scripts", "bin"],
  },
];

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}>;

interface CorePluginLibraryServiceOptions {
  fetchFn?: FetchLike;
  marketSources?: PluginMarketSource[];
  materializePackages?: boolean;
  materializePackageFn?: PackageMaterializer;
  materializeSourcePackageFn?: SourcePackageMaterializer;
  resolvePluginTargetPath?: PluginTargetPathResolver;
}

type RawRecord = Record<string, unknown>;

interface PluginMarketCacheFile {
  kind: "prompthub-plugin-market-cache";
  version: 1;
  updatedAt: string;
  entries: Record<string, PluginMarketPreviewCacheEntry>;
}

interface PluginMarketPreviewCacheEntry {
  id: string;
  marketplaceId: string;
  name: string;
  displayName: string;
  description?: string;
  longDescription?: string;
  iconUrl?: string;
  logoUrl?: string;
  brandColor?: string;
  version?: string;
  author?: PluginAuthor;
  category?: string;
  inventory: PluginInventorySummary;
  classification: PluginSemanticClassification;
  tags: string[];
  homepage?: string;
  repository?: string;
  codexDetailUrl?: string;
  manifestUrl?: string;
  canInstall: boolean;
  unsupportedReason?: string;
  cachedAt: string;
}

interface MaterializedPluginPackage {
  managedPath: string;
  localRepositoryPath: string;
  localPackagePath: string;
}

interface MaterializedPluginSourcePackage {
  cleanupPath?: string;
  localRepositoryPath: string;
  sourcePath: string;
}

interface NormalizedPluginSourceRequest {
  branch?: string;
  kind: PluginSourceKind;
  label?: string;
  packagePath?: string;
  sourceId: string;
  url: string;
}

type PackageMaterializer = (
  entry: PluginMarketEntry,
  pluginId: string,
) => Promise<MaterializedPluginPackage>;

type SourcePackageMaterializer = (
  request: NormalizedPluginSourceRequest,
) => Promise<MaterializedPluginSourcePackage>;

type PluginTargetPathResolver = (
  targetId: string,
  plugin: PluginLibraryEntry,
) => string | undefined;

interface GitHubRepositoryRef {
  owner: string;
  repo: string;
  branch: string;
}

export class CorePluginError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CorePluginError";
    this.code = code;
  }
}

export const BUILTIN_PLUGIN_MARKET_SOURCES: PluginMarketSource[] = [
  {
    id: "prompthub-official",
    displayName: "PromptHub Official",
    repository: "https://github.com/legeling/PromptHub",
    marketplaceFile: PLUGIN_MARKETPLACE_FILE,
    rawJsonUrl:
      "https://raw.githubusercontent.com/legeling/PromptHub/main/.agents/plugins/marketplace.json",
    trustLevel: "official",
    description: "PromptHub official plugin marketplace.",
  },
  {
    id: "openai-curated",
    displayName: "Codex official",
    repository: "https://github.com/openai/plugins",
    marketplaceFile: PLUGIN_MARKETPLACE_FILE,
    rawJsonUrl:
      "https://raw.githubusercontent.com/openai/plugins/main/.agents/plugins/marketplace.json",
    trustLevel: "official",
    description: "OpenAI curated Codex plugin marketplace.",
  },
];

export function getPluginLibraryFilePath(): string {
  return path.join(getManagedPluginsDir(), PLUGIN_LIBRARY_FILE_NAME);
}

export function getLegacyPluginLibraryFilePath(): string {
  return path.join(getConfigDir(), LEGACY_PLUGIN_LIBRARY_FILE_NAME);
}

export function getPluginMarketCacheFilePath(): string {
  return path.join(getManagedPluginsDir(), PLUGIN_MARKET_CACHE_FILE_NAME);
}

export function getPluginVersionFilePath(): string {
  return path.join(getManagedPluginsDir(), PLUGIN_VERSION_FILE_NAME);
}

export function getLegacyPluginMarketCacheFilePath(): string {
  return path.join(getConfigDir(), LEGACY_PLUGIN_MARKET_CACHE_FILE_NAME);
}

function getManagedPluginsDir(): string {
  return path.join(getDataDir(), "plugins");
}

export function emptyPluginInventory(): PluginInventorySummary {
  return Object.fromEntries(
    PLUGIN_INVENTORY_KEYS.map((key) => [key, 0]),
  ) as PluginInventorySummary;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowMs(): number {
  return Date.now();
}

function defaultLibrary(): PluginLibraryFile {
  return {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: nowIso(),
    plugins: [],
  };
}

function defaultMarketCache(): PluginMarketCacheFile {
  return {
    kind: "prompthub-plugin-market-cache",
    version: 1,
    updatedAt: nowIso(),
    entries: {},
  };
}

function defaultPluginVersions(): PluginVersionFile {
  return {
    kind: "prompthub-plugin-versions",
    version: 1,
    updatedAt: nowIso(),
    versions: [],
  };
}

function writeJsonFileAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function createPluginId(sourceId: string | undefined, name: string): string {
  const normalizedSource = normalizeSlug(sourceId || "custom") || "custom";
  const normalizedName = normalizeSlug(name) || "plugin";
  return `${normalizedSource}:${normalizedName}`;
}

function getPluginLocalPackagePath(plugin: PluginLibraryEntry): string {
  return (
    plugin.localPackagePath ||
    plugin.source.localPackagePath ||
    plugin.managedPath ||
    plugin.localRepositoryPath ||
    plugin.source.localRepositoryPath ||
    ""
  );
}

function isGitTransportSourceKind(kind: PluginSourceKind): boolean {
  return kind === "git" || kind === "ssh" || kind === "http";
}

function normalizeDistributedTargetIds(targetIds: string[]): string[] {
  return Array.from(
    new Set(
      targetIds
        .filter((targetId): targetId is string => typeof targetId === "string")
        .map((targetId) => targetId.trim())
        .filter((targetId) => targetId.length > 0),
    ),
  );
}

function assertSupportedPluginTargets(targetIds: string[]): void {
  const targetMatrix = getPluginTargetMatrix();
  const targetsById = new Map(
    targetMatrix.map((target) => [target.id, target]),
  );
  for (const targetId of targetIds) {
    const target = targetsById.get(targetId);
    if (!target) {
      throw new CorePluginError(
        "UNSUPPORTED_TARGET",
        `Plugin 目标不存在: ${targetId}`,
      );
    }
    if (!target.enabled) {
      throw new CorePluginError(
        "UNSUPPORTED_TARGET",
        target.unsupportedReason ||
          `${target.displayName} 暂不支持 Plugin 分发`,
      );
    }
  }
}

function assertReadableDirectory(directoryPath: string, label: string): void {
  if (!directoryPath.trim()) {
    throw new CorePluginError("MISSING_SOURCE", `${label} 路径为空`);
  }
  const stat = fs.existsSync(directoryPath) ? fs.statSync(directoryPath) : null;
  if (!stat?.isDirectory()) {
    throw new CorePluginError(
      "MISSING_SOURCE",
      `${label} 不存在或不是目录: ${directoryPath}`,
    );
  }
}

function copyPluginPackageDirectoryToTarget(
  sourcePath: string,
  targetPath: string,
): void {
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true,
    dereference: false,
  });
}

function findPluginPackageMarkerPath(packagePath: string): string | undefined {
  const markerPaths = Array.from(
    new Set([
      ...LOCAL_PLUGIN_MARKER_PATHS,
      ...Object.values(TARGET_PLUGIN_MARKER_PATHS),
    ]),
  );
  return markerPaths.find((markerPath) =>
    fs.existsSync(path.join(packagePath, ...markerPath.split("/"))),
  );
}

function isDirectoryEmpty(directoryPath: string): boolean {
  try {
    return fs.readdirSync(directoryPath).length === 0;
  } catch {
    return false;
  }
}

function isSafeExistingPluginTarget(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) {
    return true;
  }

  const targetStat = fs.lstatSync(targetPath);
  if (targetStat.isSymbolicLink()) {
    try {
      const realTarget = fs.realpathSync(targetPath);
      return (
        fs.statSync(realTarget).isDirectory() &&
        Boolean(findPluginPackageMarkerPath(realTarget))
      );
    } catch {
      const linkTarget = fs.readlinkSync(targetPath);
      const resolvedLinkTarget = path.resolve(
        path.dirname(targetPath),
        linkTarget,
      );
      return isInsideManagedPluginsDir(resolvedLinkTarget);
    }
  }

  if (!targetStat.isDirectory()) {
    return false;
  }

  return (
    isDirectoryEmpty(targetPath) ||
    Boolean(findPluginPackageMarkerPath(targetPath))
  );
}

function assertSafeExistingPluginTarget(
  targetPath: string,
  operation: "remove" | "write",
): void {
  if (isSafeExistingPluginTarget(targetPath)) {
    return;
  }
  throw new CorePluginError(
    "UNSAFE_TARGET_PATH",
    `Agent Plugin 目标路径不是可${operation === "write" ? "覆盖" : "删除"}的 Plugin 包，已拒绝操作: ${targetPath}`,
  );
}

function writePluginPackageToTarget(
  sourcePath: string,
  targetPath: string,
  mode: PluginDistributeMode,
): void {
  if (!targetPath.trim()) {
    throw new CorePluginError("MISSING_TARGET_PATH", "Plugin 目标目录为空");
  }
  assertSafeExistingPluginTarget(targetPath, "write");
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (mode === "symlink") {
    fs.symlinkSync(
      sourcePath,
      targetPath,
      process.platform === "win32" ? "junction" : "dir",
    );
    return;
  }
  copyPluginPackageDirectoryToTarget(sourcePath, targetPath);
}

function isRawRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getFirstManifestValue(manifest: RawRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (manifest[key] !== undefined) {
      return manifest[key];
    }
  }
  return undefined;
}

function normalizeAdapterManifestValue(value: unknown): unknown {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const entries = value.filter(
      (entry): entry is string | RawRecord =>
        (typeof entry === "string" && entry.trim().length > 0) ||
        isRawRecord(entry),
    );
    return entries.length > 0 ? entries : undefined;
  }
  if (isRawRecord(value) && Object.keys(value).length > 0) {
    return value;
  }
  return undefined;
}

function findExistingAdapterCapabilityPath(
  sourcePath: string,
  fallbackPaths: string[],
): string | undefined {
  for (const fallbackPath of fallbackPaths) {
    const relativePath = normalizeRelativePosixPath(fallbackPath);
    const candidatePath = path.join(sourcePath, ...relativePath.split("/"));
    try {
      ensureInsideDirectory(sourcePath, candidatePath);
      if (fs.existsSync(candidatePath)) {
        return `./${relativePath}`;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function readPluginManifestForAdapter(sourcePath: string): RawRecord {
  const markerPath = findLocalPluginMarker(sourcePath);
  if (!markerPath) {
    return {};
  }
  try {
    return readLocalPluginManifest(markerPath).manifest;
  } catch {
    return {};
  }
}

function buildAdapterPluginManifest(
  plugin: PluginLibraryEntry,
  sourceManifest: RawRecord,
  sourcePath: string,
): RawRecord {
  const sourceInterface = isRawRecord(sourceManifest.interface)
    ? sourceManifest.interface
    : {};
  const name =
    safeString(sourceManifest.name) ||
    safeString(plugin.name) ||
    normalizeSlug(plugin.displayName) ||
    normalizeSlug(plugin.id) ||
    "plugin";
  const displayName =
    safeString(sourceManifest.displayName) ||
    safeString(sourceInterface.displayName) ||
    safeString(plugin.displayName) ||
    name;
  const description =
    safeString(sourceManifest.description) ||
    safeString(sourceInterface.shortDescription) ||
    safeString(plugin.description);
  const longDescription =
    safeString(sourceInterface.longDescription) ||
    safeString(plugin.longDescription);
  const version =
    safeString(sourceManifest.version) || safeString(plugin.version);
  const manifest: RawRecord = {
    name,
    displayName,
    interface: {
      displayName,
      ...(description ? { shortDescription: description } : {}),
      ...(longDescription ? { longDescription } : {}),
    },
    prompthub: {
      sourcePluginId: plugin.id,
      generatedAt: nowIso(),
    },
  };

  if (description) {
    manifest.description = description;
  }
  if (version) {
    manifest.version = version;
  }

  for (const field of ADAPTER_MANIFEST_CAPABILITY_FIELDS) {
    const sourceValue = normalizeAdapterManifestValue(
      getFirstManifestValue(sourceManifest, field.sourceKeys),
    );
    const fallbackValue = findExistingAdapterCapabilityPath(
      sourcePath,
      field.fallbackPaths,
    );
    const value = sourceValue ?? fallbackValue;
    if (value !== undefined) {
      manifest[field.outputKey] = value;
    }
  }

  return manifest;
}

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

function buildKiroPowerDocument(
  plugin: PluginLibraryEntry,
  manifest: RawRecord,
): string {
  const name =
    safeString(manifest.name) ||
    safeString(plugin.name) ||
    normalizeSlug(plugin.displayName) ||
    "plugin";
  const displayName =
    safeString(manifest.displayName) || safeString(plugin.displayName) || name;
  const description =
    safeString(manifest.description) ||
    safeString(plugin.description) ||
    `${displayName} Plugin package`;
  const lines = [
    "---",
    `name: ${yamlQuoted(name)}`,
    `description: ${yamlQuoted(description)}`,
  ];
  const version = safeString(manifest.version) || safeString(plugin.version);
  if (version) {
    lines.push(`version: ${yamlQuoted(version)}`);
  }
  lines.push("---", "", `# ${displayName}`, "");
  lines.push(description, "");
  lines.push(
    "This Power was generated by PromptHub from an installed Plugin package.",
  );
  return `${lines.join("\n")}\n`;
}

function writeGeneratedPluginMarker(
  sourcePath: string,
  targetPath: string,
  targetId: string,
  plugin: PluginLibraryEntry,
): void {
  const markerPath = TARGET_PLUGIN_MARKER_PATHS[targetId];
  if (!markerPath) {
    throw new CorePluginError(
      "UNSUPPORTED_TARGET",
      `Plugin 目标不存在: ${targetId}`,
    );
  }
  const sourceManifest = readPluginManifestForAdapter(sourcePath);
  const manifest = buildAdapterPluginManifest(
    plugin,
    sourceManifest,
    sourcePath,
  );
  const markerFilePath = path.join(targetPath, ...markerPath.split("/"));
  ensureInsideDirectory(targetPath, markerFilePath);
  if (markerPath === "POWER.md") {
    fs.mkdirSync(path.dirname(markerFilePath), { recursive: true });
    fs.writeFileSync(
      markerFilePath,
      buildKiroPowerDocument(plugin, manifest),
      "utf8",
    );
    return;
  }
  writeJsonFileAtomic(markerFilePath, manifest);
}

function canPassthroughNativePluginPackage(
  sourcePath: string,
  targetId: string,
): boolean {
  if (targetId !== "codex") {
    return false;
  }
  return fs.existsSync(
    path.join(sourcePath, ...CODEX_PLUGIN_MANIFEST_FILE.split("/")),
  );
}

function writePluginPackageToAgentTarget(
  sourcePath: string,
  targetPath: string,
  mode: PluginDistributeMode,
  targetId: string,
  plugin: PluginLibraryEntry,
): PluginDistributeMode {
  if (canPassthroughNativePluginPackage(sourcePath, targetId)) {
    writePluginPackageToTarget(sourcePath, targetPath, mode);
    return mode;
  }
  if (!targetPath.trim()) {
    throw new CorePluginError("MISSING_TARGET_PATH", "Plugin 目标目录为空");
  }
  assertSafeExistingPluginTarget(targetPath, "write");
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  copyPluginPackageDirectoryToTarget(sourcePath, targetPath);
  writeGeneratedPluginMarker(sourcePath, targetPath, targetId, plugin);
  return "copy";
}

function deletePluginPackageTarget(targetPath: string): void {
  if (!targetPath.trim()) {
    return;
  }
  const resolvedTarget = path.resolve(targetPath);
  const root = path.parse(resolvedTarget).root;
  if (
    resolvedTarget === root ||
    resolvedTarget === path.dirname(resolvedTarget)
  ) {
    return;
  }
  assertSafeExistingPluginTarget(resolvedTarget, "remove");
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

function copyPluginPackageToManagedPath(
  sourcePath: string,
  pluginId: string,
): MaterializedPluginPackage {
  const managedPath = path.join(
    getManagedPluginsDir(),
    normalizeSlug(pluginId) || "plugin",
  );
  const tempPath = `${managedPath}.tmp-${process.pid}-${Date.now()}`;
  const localPackagePath = path.join(managedPath, "package");
  try {
    fs.rmSync(tempPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(managedPath), { recursive: true });
    fs.mkdirSync(tempPath, { recursive: true });
    fs.cpSync(sourcePath, path.join(tempPath, "package"), {
      recursive: true,
      force: true,
      dereference: false,
    });
    fs.rmSync(managedPath, { recursive: true, force: true });
    fs.renameSync(tempPath, managedPath);
    return {
      managedPath,
      localRepositoryPath: managedPath,
      localPackagePath,
    };
  } catch (error) {
    fs.rmSync(tempPath, { recursive: true, force: true });
    throw error;
  }
}

function isInsideManagedPluginsDir(candidatePath: string): boolean {
  try {
    ensureInsideDirectory(getManagedPluginsDir(), candidatePath);
    return true;
  } catch {
    return false;
  }
}

function getPluginSnapshotPackagePath(
  plugin: PluginLibraryEntry,
): string | undefined {
  const packagePath =
    plugin.localPackagePath || plugin.source.localPackagePath || "";
  if (!packagePath.trim() || !isInsideManagedPluginsDir(packagePath)) {
    return undefined;
  }
  try {
    return fs.statSync(packagePath).isDirectory()
      ? path.resolve(packagePath)
      : undefined;
  } catch {
    return undefined;
  }
}

function readPluginPackageSnapshot(
  plugin: PluginLibraryEntry,
): PluginPackageSnapshot | undefined {
  const packagePath = getPluginSnapshotPackagePath(plugin);
  if (!packagePath) {
    return undefined;
  }

  const files: PluginPackageSnapshot["files"] = [];
  const queue = [packagePath];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!PLUGIN_PACKAGE_SNAPSHOT_IGNORED_DIRS.has(entry.name)) {
          queue.push(entryPath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const stat = fs.statSync(entryPath);
      if (stat.size > MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES) {
        throw new CorePluginError(
          "PACKAGE_TOO_LARGE",
          `Plugin 文件超过同步上限: ${plugin.displayName}/${entry.name}`,
        );
      }
      if (files.length >= MAX_PLUGIN_PACKAGE_SNAPSHOT_FILES) {
        throw new CorePluginError(
          "PACKAGE_TOO_LARGE",
          `Plugin 文件数量超过同步上限: ${plugin.displayName}`,
        );
      }
      const relativePath = normalizeRelativePosixPath(
        path.relative(packagePath, entryPath),
      );
      files.push({
        relativePath,
        contentBase64: fs.readFileSync(entryPath).toString("base64"),
        size: stat.size,
      });
    }
  }

  return {
    pluginId: plugin.id,
    files,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as RawRecord)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getPreviewFingerprintPayload(preview: PluginMarketPreview): RawRecord {
  return {
    name: preview.entry.name,
    displayName: preview.displayName,
    description: preview.description,
    longDescription: preview.longDescription,
    iconUrl: preview.iconUrl,
    logoUrl: preview.logoUrl,
    brandColor: preview.brandColor,
    version: preview.version,
    author: preview.author,
    category: preview.category,
    inventory: preview.inventory,
    classification: preview.classification,
    tags: preview.tags,
    homepage: preview.homepage,
    repository: preview.repository,
    source: getSourceFingerprintPayload(preview.entry.source),
  };
}

function getPluginFingerprintPayload(plugin: PluginLibraryEntry): RawRecord {
  return {
    name: plugin.name,
    displayName: plugin.displayName,
    description: plugin.description,
    longDescription: plugin.longDescription,
    iconUrl: plugin.iconUrl,
    logoUrl: plugin.logoUrl,
    brandColor: plugin.brandColor,
    version: plugin.version,
    author: plugin.author,
    category: plugin.category,
    inventory: plugin.inventory,
    classification: plugin.classification,
    tags: plugin.tags ?? [],
    homepage: plugin.homepage,
    repository: plugin.repository,
    source: getSourceFingerprintPayload(plugin.source),
  };
}

function getSourceFingerprintPayload(source: PluginPackageSource): RawRecord {
  return {
    kind: source.kind,
    sourceId: source.sourceId,
    repository: source.repository,
    rawJsonUrl: source.rawJsonUrl,
    marketplaceFile: source.marketplaceFile,
    packagePath: source.packagePath,
    manifestPath: source.manifestPath,
    url: source.url,
    branch: source.branch,
  };
}

function computePluginPreviewFingerprint(preview: PluginMarketPreview): string {
  return sha256Text(stableJson(getPreviewFingerprintPayload(preview)));
}

function computePluginEntryManifestFingerprint(
  plugin: PluginLibraryEntry,
): string {
  return sha256Text(stableJson(getPluginFingerprintPayload(plugin)));
}

function computePluginPackageFingerprint(
  packagePath: string | undefined,
): string | undefined {
  if (!packagePath?.trim() || !fs.existsSync(packagePath)) return undefined;
  if (!fs.statSync(packagePath).isDirectory()) return undefined;

  const root = path.resolve(packagePath);
  const hash = crypto.createHash("sha256");
  const queue = [root];
  let fileCount = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!PLUGIN_PACKAGE_SNAPSHOT_IGNORED_DIRS.has(entry.name)) {
          queue.push(entryPath);
        }
        continue;
      }
      const relativePath = normalizeRelativePosixPath(
        path.relative(root, entryPath),
      );
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        hash.update(`symlink:${relativePath}:${fs.readlinkSync(entryPath)}\n`);
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.size > MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES) {
        throw new CorePluginError("PACKAGE_TOO_LARGE", relativePath);
      }
      if (++fileCount > MAX_PLUGIN_PACKAGE_SNAPSHOT_FILES) {
        throw new CorePluginError("PACKAGE_TOO_LARGE", root);
      }
      hash.update(`file:${relativePath}:${stat.size}\n`);
      hash.update(fs.readFileSync(entryPath));
      hash.update("\n");
    }
  }
  return hash.digest("hex");
}

function getPluginUpdateStatus(
  localModified: boolean,
  remoteChanged: boolean,
): PluginSourceUpdateCheck["status"] {
  if (localModified && remoteChanged) return "conflict";
  if (localModified) return "local-modified";
  if (remoteChanged) return "update-available";
  return "up-to-date";
}

function buildUpdatedPluginFromPreview(
  plugin: PluginLibraryEntry,
  preview: PluginMarketPreview,
  materialized: MaterializedPluginPackage | undefined,
  remoteManifestHash: string | undefined,
  timestamp: number,
): PluginLibraryEntry {
  const localPackagePath =
    materialized?.localPackagePath ?? plugin.localPackagePath;
  const localRepositoryPath =
    materialized?.localRepositoryPath ?? plugin.localRepositoryPath;
  const source = {
    ...preview.entry.source,
    label: preview.entry.source.label ?? plugin.source.label,
    localRepositoryPath,
    localPackagePath,
    url: preview.entry.source.url ?? plugin.source.url,
  };
  return {
    ...plugin,
    name: preview.entry.name,
    displayName: preview.displayName,
    description: preview.description,
    longDescription: preview.longDescription,
    iconUrl: preview.iconUrl,
    logoUrl: preview.logoUrl,
    brandColor: preview.brandColor,
    version: preview.version,
    author: preview.author,
    category: preview.category,
    inventory: preview.inventory,
    classification: preview.classification,
    source,
    isFavorite: plugin.isFavorite === true,
    tags: preview.tags,
    userTags: safePluginUserTags(plugin.userTags),
    userNotes: safePluginUserNotes(plugin.userNotes),
    safetyReport: normalizePluginSafetyReport(plugin.safetyReport),
    homepage: preview.homepage,
    repository: preview.repository,
    managedPath: materialized?.managedPath ?? plugin.managedPath,
    localRepositoryPath,
    localPackagePath,
    installedManifestHash: remoteManifestHash,
    installedPackageHash: computePluginPackageFingerprint(localPackagePath),
    updatedFromSourceAt: timestamp,
    updatedAt: timestamp,
  };
}

function getRestoredPluginManagedPath(pluginId: string): string {
  return path.join(getManagedPluginsDir(), normalizeSlug(pluginId) || "plugin");
}

function writePluginPackageSnapshot(snapshot: PluginPackageSnapshot): {
  localPackagePath: string;
  managedPath: string;
} {
  const managedPath = getRestoredPluginManagedPath(snapshot.pluginId);
  const tempPath = `${managedPath}.sync-tmp-${process.pid}-${Date.now()}`;
  const localPackagePath = path.join(tempPath, "package");

  try {
    fs.rmSync(tempPath, { recursive: true, force: true });
    fs.mkdirSync(localPackagePath, { recursive: true });
    for (const file of snapshot.files) {
      const relativePath = normalizeRelativePosixPath(file.relativePath);
      const targetPath = path.join(
        localPackagePath,
        ...relativePath.split("/"),
      );
      ensureInsideDirectory(localPackagePath, targetPath);
      const buffer = Buffer.from(file.contentBase64, "base64");
      if (buffer.length !== file.size) {
        throw new CorePluginError(
          "INVALID_PACKAGE_SNAPSHOT",
          `Plugin 文件快照大小不匹配: ${snapshot.pluginId}/${relativePath}`,
        );
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, buffer);
    }
    fs.rmSync(managedPath, { recursive: true, force: true });
    fs.renameSync(tempPath, managedPath);
    return {
      managedPath,
      localPackagePath: path.join(managedPath, "package"),
    };
  } catch (error) {
    fs.rmSync(tempPath, { recursive: true, force: true });
    throw error;
  }
}

function remapRestoredPluginPackage(
  plugin: PluginLibraryEntry,
  restoredPackage:
    | {
        localPackagePath: string;
        managedPath: string;
      }
    | undefined,
): PluginLibraryEntry {
  if (!restoredPackage) {
    return plugin;
  }

  return {
    ...plugin,
    managedPath: restoredPackage.managedPath,
    localRepositoryPath: restoredPackage.managedPath,
    localPackagePath: restoredPackage.localPackagePath,
    source: {
      ...plugin.source,
      localRepositoryPath: restoredPackage.managedPath,
      localPackagePath: restoredPackage.localPackagePath,
    },
  };
}

function normalizeRelativePosixPath(value: string): string {
  if (value.includes("\0")) {
    throw new CorePluginError("INVALID_PATH", "Plugin 路径包含非法空字节");
  }

  const slashPath = value.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(slashPath)) {
    throw new CorePluginError("INVALID_PATH", `Plugin 路径不安全: ${value}`);
  }
  const normalized = path.posix.normalize(slashPath);
  const withoutPrefix = normalized.replace(/^\.\//, "");
  if (
    !withoutPrefix ||
    withoutPrefix.startsWith("../") ||
    withoutPrefix === ".." ||
    path.posix.isAbsolute(withoutPrefix)
  ) {
    throw new CorePluginError("INVALID_PATH", `Plugin 路径不安全: ${value}`);
  }
  return withoutPrefix;
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function safePluginBrandColor(value: unknown): string | undefined {
  const color = safeString(value);
  if (!color) {
    return undefined;
  }
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(color)
    ? color
    : undefined;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function hasExplicitUrlProtocol(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function safePluginUserTags(value: unknown): string[] {
  return Array.from(
    new Set(
      safeStringArray(value)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function safePluginUserNotes(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizePluginSafetyFinding(
  value: unknown,
): SkillSafetyFinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as RawRecord;
  const code = safeString(record.code);
  const title = safeString(record.title);
  const detail = safeString(record.detail);
  const severity = record.severity;
  if (
    !code ||
    !title ||
    !detail ||
    (severity !== "info" && severity !== "warn" && severity !== "high")
  ) {
    return null;
  }

  return {
    code,
    severity,
    title,
    detail,
    filePath: safeString(record.filePath),
    evidence: safeString(record.evidence),
  };
}

function normalizePluginSafetyReport(
  value: unknown,
): SkillSafetyReport | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as RawRecord;
  const level = record.level as SkillSafetyLevel;
  if (
    level !== "safe" &&
    level !== "warn" &&
    level !== "high-risk" &&
    level !== "blocked"
  ) {
    return undefined;
  }

  const summary = safeString(record.summary);
  const recommendedAction = record.recommendedAction;
  const scannedAt = record.scannedAt;
  const checkedFileCount = record.checkedFileCount;
  if (
    !summary ||
    (recommendedAction !== "allow" &&
      recommendedAction !== "review" &&
      recommendedAction !== "block") ||
    typeof scannedAt !== "number" ||
    !Number.isFinite(scannedAt) ||
    typeof checkedFileCount !== "number" ||
    !Number.isFinite(checkedFileCount) ||
    checkedFileCount < 0 ||
    record.scanMethod !== "ai"
  ) {
    return undefined;
  }

  const findings = Array.isArray(record.findings)
    ? record.findings.flatMap((finding) => {
        const normalized = normalizePluginSafetyFinding(finding);
        return normalized ? [normalized] : [];
      })
    : [];
  const score =
    typeof record.score === "number" && Number.isFinite(record.score)
      ? Math.max(0, Math.min(100, Math.round(record.score)))
      : undefined;

  return {
    level,
    summary,
    findings,
    recommendedAction,
    scannedAt,
    checkedFileCount,
    scanMethod: "ai",
    score,
  };
}

function normalizeTrustLevel(value: unknown): PluginTrustLevel {
  return value === "verified" || value === "community" || value === "custom"
    ? value
    : "official";
}

function normalizeAuthor(value: unknown): PluginAuthor | undefined {
  if (typeof value === "string" && value.trim()) {
    return { name: value.trim() };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as RawRecord;
  const name = safeString(record.name);
  if (!name) {
    return undefined;
  }
  return {
    name,
    email: safeString(record.email),
    url: safeString(record.url),
  };
}

function normalizeMarketPolicy(value: unknown): PluginMarketPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as RawRecord;
  const installation = safeString(record.installation);
  const authentication = safeString(record.authentication);
  if (!installation && !authentication) {
    return undefined;
  }
  return { installation, authentication };
}

function normalizeInventory(raw: unknown): PluginInventorySummary {
  const inventory = emptyPluginInventory();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return inventory;
  }
  const record = raw as Partial<PluginInventorySummary>;
  for (const key of PLUGIN_INVENTORY_KEYS) {
    const value = record[key];
    inventory[key] = typeof value === "number" && value > 0 ? value : 0;
  }
  return inventory;
}

function normalizeMarketCache(
  raw: Partial<PluginMarketCacheFile>,
): PluginMarketCacheFile {
  const cache = defaultMarketCache();
  const rawEntries =
    raw.entries &&
    typeof raw.entries === "object" &&
    !Array.isArray(raw.entries)
      ? raw.entries
      : {};
  for (const [id, value] of Object.entries(rawEntries)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value as Partial<PluginMarketPreviewCacheEntry>;
    const marketplaceId = safeString(record.marketplaceId);
    const name = safeString(record.name);
    const displayName = safeString(record.displayName);
    if (!marketplaceId || !name || !displayName) {
      continue;
    }
    cache.entries[id] = {
      id,
      marketplaceId,
      name,
      displayName,
      description: safeString(record.description),
      longDescription: safeString(record.longDescription),
      iconUrl: safeString(record.iconUrl),
      logoUrl: safeString(record.logoUrl),
      brandColor: safePluginBrandColor(record.brandColor),
      version: safeString(record.version),
      author: normalizeAuthor(record.author),
      category: safeString(record.category),
      inventory: normalizeInventory(record.inventory),
      classification:
        record.classification === "single-skill" ||
        record.classification === "runtime-module" ||
        record.classification === "invalid"
          ? record.classification
          : "bundle",
      tags: safeStringArray(record.tags),
      homepage: safeString(record.homepage),
      repository: safeString(record.repository),
      codexDetailUrl: safeString(record.codexDetailUrl),
      manifestUrl: safeString(record.manifestUrl),
      canInstall: record.canInstall !== false,
      unsupportedReason: safeString(record.unsupportedReason),
      cachedAt: safeString(record.cachedAt) ?? nowIso(),
    };
  }
  return {
    ...cache,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
}

function buildPreviewCacheEntry(
  preview: PluginMarketPreview,
): PluginMarketPreviewCacheEntry {
  return {
    id: preview.entry.id,
    marketplaceId: preview.entry.marketplaceId,
    name: preview.entry.name,
    displayName: preview.displayName,
    description: preview.description,
    longDescription: preview.longDescription,
    iconUrl: preview.iconUrl,
    logoUrl: preview.logoUrl,
    brandColor: safePluginBrandColor(preview.brandColor),
    version: preview.version,
    author: normalizeAuthor(preview.author),
    category: preview.category,
    inventory: preview.inventory,
    classification: preview.classification,
    tags: preview.tags,
    homepage: preview.homepage,
    repository: preview.repository,
    codexDetailUrl: preview.codexDetailUrl,
    manifestUrl: preview.manifestUrl,
    canInstall: preview.canInstall,
    unsupportedReason: preview.unsupportedReason,
    cachedAt: nowIso(),
  };
}

function applyPreviewCacheToEntry(
  entry: PluginMarketEntry,
  cached: PluginMarketPreviewCacheEntry | undefined,
): PluginMarketEntry {
  if (
    !cached ||
    cached.marketplaceId !== entry.marketplaceId ||
    cached.name !== entry.name
  ) {
    return entry;
  }
  return {
    ...entry,
    displayName: cached.displayName || entry.displayName,
    description: cached.description ?? entry.description,
    iconUrl: cached.iconUrl ?? entry.iconUrl,
    logoUrl: cached.logoUrl ?? entry.logoUrl,
    brandColor: cached.brandColor ?? entry.brandColor,
    version: cached.version ?? entry.version,
    author: cached.author ?? entry.author,
    category: entry.category ?? cached.category,
    inventory: cached.inventory,
    classification: cached.classification,
    codexDetailUrl: cached.codexDetailUrl ?? entry.codexDetailUrl,
  };
}

function countManifestField(value: unknown): number {
  if (typeof value === "string") {
    return value.trim() ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return 0;
}

function manifestFieldStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value as RawRecord)
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }
  return [];
}

function looksLikeDirectoryManifestPath(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized) {
    return false;
  }
  if (normalized.endsWith("/")) {
    return true;
  }
  return !path.posix.basename(normalized).includes(".");
}

function parseGitHubRepositoryRef(
  repository: string | undefined,
  rawJsonUrl?: string,
): GitHubRepositoryRef | null {
  const rawRepositoryRef = parseGitHubRawUrlRepositoryRef(rawJsonUrl);
  if (rawRepositoryRef) {
    return rawRepositoryRef;
  }

  if (!repository) {
    return null;
  }

  const trimmed = repository.trim();
  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(
    trimmed,
  );
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2], branch: "main" };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() !== "github.com") {
      return null;
    }
    const parts = parsed.pathname
      .replace(/\/+$/g, "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/i, ""),
      branch: "main",
    };
  } catch {
    return null;
  }
}

function parseGitHubRawUrlRepositoryRef(
  rawJsonUrl: string | undefined,
): GitHubRepositoryRef | null {
  if (!rawJsonUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawJsonUrl);
    if (parsed.hostname.toLowerCase() !== "raw.githubusercontent.com") {
      return null;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 3) {
      return null;
    }
    return { owner: parts[0], repo: parts[1], branch: parts[2] };
  } catch {
    return null;
  }
}

function buildGitHubTreeUrl(ref: GitHubRepositoryRef): string {
  return `https://api.github.com/repos/${encodeURIComponent(
    ref.owner,
  )}/${encodeURIComponent(ref.repo)}/git/trees/${encodeURIComponent(
    ref.branch,
  )}?recursive=1`;
}

function extractGitHubTreePaths(tree: RawRecord): string[] {
  const entries = Array.isArray(tree.tree) ? tree.tree : [];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return undefined;
      }
      const record = entry as RawRecord;
      if (record.type !== "blob") {
        return undefined;
      }
      return safeString(record.path);
    })
    .filter((entry): entry is string => Boolean(entry));
}

function withoutTrailingPosixSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function isSkillFileUnderDirectory(
  filePath: string,
  skillDirectory: string,
): boolean {
  const safeFilePath = normalizeRelativePosixPath(filePath);
  const safeSkillDirectory = withoutTrailingPosixSlash(
    normalizeRelativePosixPath(skillDirectory),
  );
  return (
    safeFilePath.startsWith(`${safeSkillDirectory}/`) &&
    path.posix.basename(safeFilePath) === "SKILL.md"
  );
}

export function extractPluginInventoryFromManifest(
  manifest: RawRecord,
): PluginInventorySummary {
  const inventory = emptyPluginInventory();
  inventory.skills = countManifestField(manifest.skills);
  inventory.mcpServers = countManifestField(
    manifest.mcpServers ?? manifest.mcp_servers ?? manifest.mcp,
  );
  inventory.apps = countManifestField(manifest.apps ?? manifest.app);
  inventory.commands = countManifestField(manifest.commands);
  inventory.hooks = countManifestField(manifest.hooks);
  inventory.agents = countManifestField(manifest.agents);
  inventory.assets = countManifestField(manifest.assets);
  inventory.docs = countManifestField(manifest.docs ?? manifest.documentation);
  inventory.lspServers = countManifestField(
    manifest.lspServers ?? manifest.lsp_servers,
  );
  inventory.scripts = countManifestField(manifest.scripts);
  return inventory;
}

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

function findLocalPluginMarker(packagePath: string): string | null {
  for (const markerPath of LOCAL_PLUGIN_MARKER_PATHS) {
    const candidatePath = path.join(packagePath, ...markerPath.split("/"));
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return null;
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

function readLocalPluginManifest(markerPath: string): {
  manifest: RawRecord;
  markerPath: string;
} {
  if (path.basename(markerPath) === "POWER.md") {
    return {
      markerPath,
      manifest: parsePowerManifest(fs.readFileSync(markerPath, "utf8")),
    };
  }
  return {
    markerPath,
    manifest: parseJsonObject(
      fs.readFileSync(markerPath, "utf8"),
      "Local Plugin manifest",
    ),
  };
}

function extractLocalPluginInventory(
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

function validateLocalPluginPackage(
  packagePath: string,
  manifest: RawRecord,
): void {
  validateLocalPluginManifestPaths(packagePath, manifest);
  validateLocalPluginSymlinkBoundaries(packagePath);
}

function createPluginPackageHealthFinding(
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

export function classifyPluginInventory(
  inventory: PluginInventorySummary,
): PluginSemanticClassification {
  const total = PLUGIN_INVENTORY_KEYS.reduce(
    (sum, key) => sum + inventory[key],
    0,
  );
  if (total >= 2) {
    return "bundle";
  }
  if (total === 1 && inventory.skills === 1) {
    return "single-skill";
  }
  if (
    total === 1 &&
    (inventory.commands === 1 ||
      inventory.hooks === 1 ||
      inventory.scripts === 1)
  ) {
    return "runtime-module";
  }
  return "invalid";
}

function assertBundlePlugin(
  classification: PluginSemanticClassification,
  name: string,
): void {
  if (classification === "bundle") {
    return;
  }

  const reason = getPluginSemanticUnsupportedReason(classification);
  throw new CorePluginError(
    "UNSUPPORTED_PLUGIN_SEMANTIC",
    `${name} 未通过 Plugin 语义检查：${reason}`,
  );
}

function getPluginSemanticUnsupportedReason(
  classification: PluginSemanticClassification,
): string | undefined {
  if (classification === "bundle") {
    return undefined;
  }
  if (classification === "single-skill") {
    return "只有单个 Skill，不是完整 Plugin 能力包";
  }
  if (classification === "runtime-module") {
    return "只有运行时模块/Hook，不是完整 Plugin 能力包";
  }
  return "没有可识别的多能力 inventory";
}

function normalizeLibrary(raw: Partial<PluginLibraryFile>): PluginLibraryFile {
  return {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
    plugins: Array.isArray(raw.plugins)
      ? raw.plugins
          .filter((plugin): plugin is PluginLibraryEntry =>
            Boolean(
              plugin &&
              typeof plugin === "object" &&
              typeof plugin.id === "string" &&
              typeof plugin.name === "string",
            ),
          )
          .map((plugin) => ({
            id: plugin.id!,
            name: plugin.name!,
            displayName: plugin.displayName || plugin.name!,
            description: plugin.description,
            longDescription: plugin.longDescription,
            iconUrl: plugin.iconUrl,
            logoUrl: plugin.logoUrl,
            brandColor: safePluginBrandColor(plugin.brandColor),
            version: plugin.version,
            author: normalizeAuthor(plugin.author),
            category: plugin.category,
            trustLevel: normalizeTrustLevel(plugin.trustLevel),
            inventory: normalizeInventory(plugin.inventory),
            classification:
              plugin.classification === "single-skill" ||
              plugin.classification === "runtime-module" ||
              plugin.classification === "invalid"
                ? plugin.classification
                : "bundle",
            source: {
              kind: plugin.source?.kind || "market",
              sourceId: plugin.source?.sourceId,
              label: plugin.source?.label,
              repository: plugin.source?.repository,
              rawJsonUrl: plugin.source?.rawJsonUrl,
              marketplaceFile: plugin.source?.marketplaceFile,
              packagePath: plugin.source?.packagePath,
              manifestPath: plugin.source?.manifestPath,
              localRepositoryPath: plugin.source?.localRepositoryPath,
              localPackagePath: plugin.source?.localPackagePath,
              url: plugin.source?.url,
              branch: safeString(plugin.source?.branch),
            },
            isFavorite: plugin.isFavorite === true,
            tags: safeStringArray(plugin.tags),
            userTags: safePluginUserTags(plugin.userTags),
            userNotes: safePluginUserNotes(plugin.userNotes),
            safetyReport: normalizePluginSafetyReport(plugin.safetyReport),
            homepage: plugin.homepage,
            repository: plugin.repository,
            distributedTargetIds: safeStringArray(plugin.distributedTargetIds),
            managedPath: plugin.managedPath,
            localRepositoryPath: plugin.localRepositoryPath,
            localPackagePath: plugin.localPackagePath,
            installedManifestHash: plugin.installedManifestHash,
            installedPackageHash: plugin.installedPackageHash,
            updatedFromSourceAt:
              typeof plugin.updatedFromSourceAt === "number"
                ? plugin.updatedFromSourceAt
                : undefined,
            installedAt:
              typeof plugin.installedAt === "number"
                ? plugin.installedAt
                : nowMs(),
            updatedAt:
              typeof plugin.updatedAt === "number" ? plugin.updatedAt : nowMs(),
          }))
      : [],
  };
}

function normalizePluginPackageSnapshot(
  value: unknown,
  pluginId: string,
): PluginPackageSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Partial<PluginPackageSnapshot>;
  if (!Array.isArray(record.files)) {
    return undefined;
  }
  return {
    pluginId,
    files: record.files.flatMap((file) => {
      if (!file || typeof file !== "object") {
        return [];
      }
      const item = file as Partial<PluginPackageSnapshot["files"][number]>;
      if (
        typeof item.relativePath !== "string" ||
        typeof item.contentBase64 !== "string" ||
        typeof item.size !== "number" ||
        !Number.isFinite(item.size) ||
        item.size < 0
      ) {
        return [];
      }
      return [
        {
          relativePath: normalizeRelativePosixPath(item.relativePath),
          contentBase64: item.contentBase64,
          size: item.size,
        },
      ];
    }),
  };
}

function normalizePluginVersion(value: unknown): PluginVersion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Partial<PluginVersion>;
  const id = safeString(record.id);
  const pluginId = safeString(record.pluginId);
  const version = record.version;
  const createdAt = safeString(record.createdAt);
  if (
    !id ||
    !pluginId ||
    typeof version !== "number" ||
    !Number.isFinite(version) ||
    version < 1 ||
    !createdAt
  ) {
    return null;
  }
  const plugin = normalizeLibrary({
    plugins: [record.plugin as PluginLibraryEntry],
  }).plugins[0];
  if (!plugin || plugin.id !== pluginId) {
    return null;
  }
  return {
    id,
    pluginId,
    version,
    note: safeString(record.note),
    createdAt,
    plugin,
    packageSnapshot: normalizePluginPackageSnapshot(
      record.packageSnapshot,
      pluginId,
    ),
  };
}

function normalizePluginVersionsFile(
  raw: Partial<PluginVersionFile>,
): PluginVersionFile {
  const versions = Array.isArray(raw.versions)
    ? raw.versions.flatMap((version) => {
        const normalized = normalizePluginVersion(version);
        return normalized ? [normalized] : [];
      })
    : [];
  return {
    kind: "prompthub-plugin-versions",
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
    versions,
  };
}

function sortPluginVersions(versions: PluginVersion[]): PluginVersion[] {
  return [...versions].sort((left, right) => {
    if (right.version !== left.version) {
      return right.version - left.version;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

function getNextPluginVersionNumber(
  versions: PluginVersion[],
  pluginId: string,
): number {
  const latest = versions
    .filter((version) => version.pluginId === pluginId)
    .reduce((max, version) => Math.max(max, version.version), 0);
  return latest + 1;
}

function createPluginVersionId(pluginId: string, version: number): string {
  const random =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  return `${normalizeSlug(pluginId) || "plugin"}-v${version}-${random}`;
}

function parseJsonObject(content: string, label: string): RawRecord {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CorePluginError("INVALID_JSON", `${label} 不是 JSON 对象`);
  }
  return parsed as RawRecord;
}

function getMarketplaceDisplayName(
  marketplace: RawRecord,
  source: PluginMarketSource,
): string {
  const rawInterface = marketplace.interface;
  if (rawInterface && typeof rawInterface === "object") {
    const displayName = safeString((rawInterface as RawRecord).displayName);
    if (displayName) {
      return displayName;
    }
  }
  return source.displayName;
}

function buildRawPluginFileUrl(
  source: PluginMarketSource,
  relativePath: string,
): string {
  const safeRelativePath = normalizeRelativePosixPath(relativePath);
  const safeMarketplacePath = normalizeRelativePosixPath(
    source.marketplaceFile,
  );
  if (!source.rawJsonUrl.endsWith(safeMarketplacePath)) {
    throw new CorePluginError(
      "INVALID_SOURCE",
      `无法从 ${source.rawJsonUrl} 推导插件文件地址`,
    );
  }
  const baseUrl = source.rawJsonUrl.slice(0, -safeMarketplacePath.length);
  return new URL(safeRelativePath, baseUrl).toString();
}

function resolveManifestAssetUrl(
  source: PluginMarketSource,
  entry: PluginMarketEntry,
  value: unknown,
): string | undefined {
  const assetPath = safeString(value);
  if (!assetPath) {
    return undefined;
  }
  if (isAbsoluteHttpUrl(assetPath)) {
    return assetPath;
  }
  if (hasExplicitUrlProtocol(assetPath)) {
    return undefined;
  }

  try {
    const packagePath = entry.source.packagePath
      ? normalizeRelativePosixPath(entry.source.packagePath)
      : entry.source.manifestPath
        ? normalizeRelativePosixPath(
            path.posix.dirname(entry.source.manifestPath),
          )
        : undefined;
    if (!packagePath) {
      return undefined;
    }

    const safeAssetPath = normalizeRelativePosixPath(assetPath);
    const resolvedPath = normalizeRelativePosixPath(
      path.posix.join(packagePath, safeAssetPath),
    );
    if (
      resolvedPath !== packagePath &&
      !resolvedPath.startsWith(`${packagePath}/`)
    ) {
      return undefined;
    }
    return buildRawPluginFileUrl(source, resolvedPath);
  } catch {
    return undefined;
  }
}

function buildCodexPluginDetailUrl(
  name: string,
  marketplaceId: string,
): string {
  return `codex://plugins/${encodeURIComponent(name)}@${encodeURIComponent(
    marketplaceId,
  )}`;
}

function ensureInsideDirectory(parent: string, child: string): void {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  if (
    resolvedChild !== resolvedParent &&
    !resolvedChild.startsWith(`${resolvedParent}${path.sep}`)
  ) {
    throw new CorePluginError("INVALID_PATH", `路径不在受控目录内: ${child}`);
  }
}

function runGit(args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn("git", args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (error) => {
      reject(new CorePluginError("GIT_FAILED", error.message));
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new CorePluginError(
          "GIT_FAILED",
          `Git 命令执行失败 (${code ?? "unknown"}): ${stderr.trim()}`,
        ),
      );
    });
  });
}

function inferPluginSourceKind(url: string): PluginSourceKind {
  const lower = url.toLowerCase();
  if (lower.startsWith("git@") || lower.startsWith("ssh://")) {
    return "ssh";
  }
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return "http";
  }
  return "git";
}

function normalizeOptionalSourcePackagePath(
  packagePath: string | undefined,
): string | undefined {
  const trimmed = packagePath?.trim() ?? "";
  if (!trimmed || trimmed === "." || trimmed === "./") {
    return undefined;
  }
  return normalizeRelativePosixPath(trimmed);
}

function normalizeSourceBranch(branch: string | undefined): string | undefined {
  const trimmed = branch?.trim() ?? "";
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.includes("\0")) {
    throw new CorePluginError("INVALID_SOURCE", "Plugin source branch 非法");
  }
  return trimmed;
}

function normalizePluginSourceImportRequest(
  request: PluginImportSourceRequest,
): NormalizedPluginSourceRequest {
  const url = request.url.trim();
  if (!url || url.includes("\0")) {
    throw new CorePluginError("INVALID_SOURCE", "Plugin source URL 非法");
  }
  const packagePath = normalizeOptionalSourcePackagePath(request.packagePath);
  const branch = normalizeSourceBranch(request.branch);
  const kind = inferPluginSourceKind(url);
  const fingerprint = crypto
    .createHash("sha256")
    .update([kind, url, branch ?? "", packagePath ?? ""].join("\0"))
    .digest("hex")
    .slice(0, 10);
  return {
    branch,
    kind,
    label: request.label?.trim() || undefined,
    packagePath,
    sourceId: `${kind}-${fingerprint}`,
    url,
  };
}

async function materializeGitSourcePackage(
  request: NormalizedPluginSourceRequest,
): Promise<MaterializedPluginSourcePackage> {
  const tempRoot = path.join(
    getManagedPluginsDir(),
    `.source-${request.sourceId}.tmp-${process.pid}-${Date.now()}`,
  );
  const repoDir = path.join(tempRoot, "repo");
  const cloneArgs = ["clone", "--depth", "1", "--filter=blob:none"];
  if (request.packagePath) {
    cloneArgs.push("--sparse");
  }
  if (request.branch) {
    cloneArgs.push("--branch", request.branch);
  }
  cloneArgs.push("--", request.url, repoDir);

  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(tempRoot), { recursive: true });
    await runGit(cloneArgs);
    if (request.packagePath) {
      await runGit(
        ["sparse-checkout", "set", "--no-cone", request.packagePath],
        repoDir,
      );
    }

    const sourcePath = request.packagePath
      ? path.join(repoDir, ...request.packagePath.split("/"))
      : repoDir;
    ensureInsideDirectory(repoDir, sourcePath);
    return {
      cleanupPath: tempRoot,
      localRepositoryPath: repoDir,
      sourcePath,
    };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function materializeGitPackage(
  entry: PluginMarketEntry,
  pluginId: string,
): Promise<MaterializedPluginPackage> {
  if (!entry.source.repository || !entry.source.packagePath) {
    throw new CorePluginError(
      "MISSING_SOURCE",
      `${entry.displayName} 没有可下载的 Git source`,
    );
  }

  const pluginRoot = path.join(
    getManagedPluginsDir(),
    normalizeSlug(pluginId) || "plugin",
  );
  const tempRoot = `${pluginRoot}.tmp-${process.pid}-${Date.now()}`;
  const repoDir = path.join(tempRoot, "repo");
  const safePackagePath = normalizeRelativePosixPath(entry.source.packagePath);

  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(pluginRoot), { recursive: true });
    await runGit([
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      "--",
      entry.source.repository,
      repoDir,
    ]);
    await runGit(
      ["sparse-checkout", "set", "--no-cone", safePackagePath],
      repoDir,
    );

    const localPackagePath = path.join(repoDir, ...safePackagePath.split("/"));
    ensureInsideDirectory(repoDir, localPackagePath);
    if (
      !fs.existsSync(path.join(localPackagePath, CODEX_PLUGIN_MANIFEST_FILE))
    ) {
      throw new CorePluginError(
        "MISSING_MANIFEST",
        `${entry.displayName} 下载后没有找到 Plugin manifest`,
      );
    }

    fs.rmSync(pluginRoot, { recursive: true, force: true });
    fs.renameSync(tempRoot, pluginRoot);
    return {
      managedPath: pluginRoot,
      localRepositoryPath: path.join(pluginRoot, "repo"),
      localPackagePath: path.join(
        pluginRoot,
        "repo",
        ...safePackagePath.split("/"),
      ),
    };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function normalizeMarketEntry(
  raw: unknown,
  source: PluginMarketSource,
  marketplaceDisplayName: string,
): PluginMarketEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as RawRecord;
  const name = safeString(record.name);
  if (!name) {
    return null;
  }

  const rawSource =
    record.source && typeof record.source === "object"
      ? (record.source as RawRecord)
      : {};
  const sourceKind = safeString(rawSource.source);
  const rawPath = safeString(rawSource.path);
  const packagePath = rawPath ? normalizeRelativePosixPath(rawPath) : undefined;
  const manifestPath = packagePath
    ? normalizeRelativePosixPath(
        path.posix.join(packagePath, CODEX_PLUGIN_MANIFEST_FILE),
      )
    : undefined;
  const rawInterface =
    record.interface && typeof record.interface === "object"
      ? (record.interface as RawRecord)
      : {};
  const displayName =
    safeString(rawInterface.displayName) ||
    safeString(record.displayName) ||
    name;
  const iconUrl =
    safeString(rawInterface.composerIcon) || safeString(rawInterface.icon);
  const logoUrl = safeString(rawInterface.logo);

  return {
    id: createPluginId(source.id, name),
    marketplaceId: source.id,
    name,
    displayName,
    description:
      safeString(rawInterface.shortDescription) ||
      safeString(record.description),
    iconUrl: iconUrl && isAbsoluteHttpUrl(iconUrl) ? iconUrl : undefined,
    logoUrl: logoUrl && isAbsoluteHttpUrl(logoUrl) ? logoUrl : undefined,
    brandColor: safePluginBrandColor(rawInterface.brandColor),
    category: safeString(record.category) || safeString(rawInterface.category),
    trustLevel: source.trustLevel,
    source: {
      kind: sourceKind === "local" ? "market" : "git",
      sourceId: source.id,
      label: marketplaceDisplayName,
      repository: source.repository,
      rawJsonUrl: source.rawJsonUrl,
      marketplaceFile: source.marketplaceFile,
      packagePath,
      manifestPath,
      url: safeString(rawSource.url),
    },
    policy: normalizeMarketPolicy(record.policy),
    codexDetailUrl: buildCodexPluginDetailUrl(name, source.id),
  };
}

function readLocalPromptHubMarketplace(
  source: PluginMarketSource,
): string | null {
  if (source.id !== "prompthub-official") {
    return null;
  }
  const localPath = path.resolve(process.cwd(), PLUGIN_MARKETPLACE_FILE);
  if (!fs.existsSync(localPath)) {
    return null;
  }
  return fs.readFileSync(localPath, "utf8");
}

export function getPluginTargetMatrix(): PluginTargetCompatibility[] {
  return [
    {
      id: "codex",
      displayName: "Codex",
      status: "native",
      enabled: true,
      nativeMarker: ".codex-plugin/plugin.json",
      installSurface: "codex plugin / .agents/plugins/marketplace.json",
      description: "Native PromptHub Plugin target for Codex plugin bundles.",
    },
    {
      id: "claude-code",
      displayName: "Claude Code",
      status: "adapter",
      enabled: true,
      nativeMarker: ".claude-plugin/plugin.json",
      installSurface: "claude plugin / --plugin-dir / --plugin-url",
      adapterOutput: "Generate Claude Code plugin package from inventory.",
    },
    {
      id: "cursor",
      displayName: "Cursor",
      status: "adapter",
      enabled: true,
      nativeMarker: ".cursor-plugin/plugin.json",
      installSurface: ".cursor-plugin/marketplace.json",
      adapterOutput: "Generate Cursor plugin package from inventory.",
    },
    {
      id: "gemini-cli",
      displayName: "Gemini CLI",
      status: "adapter",
      enabled: true,
      nativeMarker: "gemini-extension.json",
      installSurface: "gemini extensions install",
      adapterOutput: "Generate Gemini extension package from inventory.",
    },
    {
      id: "kiro",
      displayName: "Kiro",
      status: "adapter",
      enabled: true,
      nativeMarker: "POWER.md",
      installSurface: "Kiro power package",
      adapterOutput: "Generate Kiro power package with bundled assets.",
    },
    {
      id: "github-copilot",
      displayName: "GitHub Copilot / VS Code",
      status: "adapter",
      enabled: true,
      nativeMarker: "plugin.json",
      installSurface: "copilot plugin / VS Code Agent Plugins",
      adapterOutput: "Generate Copilot or VS Code agent plugin package.",
    },
    {
      id: "opencode",
      displayName: "OpenCode",
      status: "runtime-only",
      enabled: false,
      nativeMarker: ".opencode/plugins",
      installSurface: "opencode.json plugin modules",
      unsupportedReason:
        "Runtime JS/TS plugin modules are not full Plugin bundle inventory.",
    },
    {
      id: "cline",
      displayName: "Cline",
      status: "runtime-only",
      enabled: false,
      nativeMarker: "AgentPlugin entrypoint",
      installSurface: "cline plugin install",
      unsupportedReason:
        "AgentPlugin runtime entrypoints are not full Plugin bundle inventory.",
    },
    {
      id: "windsurf",
      displayName: "Windsurf / Devin",
      status: "composite",
      enabled: false,
      installSurface: "Separate skills, workflows, hooks and MCP surfaces",
      unsupportedReason:
        "No confirmed single native bundle package; requires composite adapter.",
    },
    {
      id: "roo-code",
      displayName: "Roo Code",
      status: "composite",
      enabled: false,
      installSurface: "Skills, rules, commands and MCP-like config surfaces",
      unsupportedReason:
        "No confirmed single plugin package; requires decomposition.",
    },
    {
      id: "cherry-studio",
      displayName: "Cherry Studio",
      status: "composite",
      enabled: false,
      installSurface: "Local skill and agent registries",
      unsupportedReason:
        "No confirmed single plugin package; requires decomposition.",
    },
    {
      id: "amp",
      displayName: "Amp / Other Agents",
      status: "pending",
      enabled: false,
      unsupportedReason:
        "Public evidence is insufficient for a stable adapter.",
    },
  ];
}

export class CorePluginLibraryService {
  private fetchFn: FetchLike;
  private marketSources: PluginMarketSource[];
  private materializePackages: boolean;
  private materializePackageFn: PackageMaterializer;
  private materializeSourcePackageFn: SourcePackageMaterializer;
  private resolvePluginTargetPath?: PluginTargetPathResolver;
  private githubTreePathCache = new Map<string, Promise<string[]>>();

  constructor(options: CorePluginLibraryServiceOptions = {}) {
    this.fetchFn =
      options.fetchFn ??
      (globalThis.fetch as unknown as FetchLike | undefined) ??
      (async () => {
        throw new CorePluginError(
          "FETCH_UNAVAILABLE",
          "当前运行环境不支持 fetch",
        );
      });
    this.marketSources = options.marketSources ?? BUILTIN_PLUGIN_MARKET_SOURCES;
    this.materializePackages = options.materializePackages ?? false;
    this.materializePackageFn =
      options.materializePackageFn ?? materializeGitPackage;
    this.materializeSourcePackageFn =
      options.materializeSourcePackageFn ?? materializeGitSourcePackage;
    this.resolvePluginTargetPath = options.resolvePluginTargetPath;
  }

  read(): PluginLibraryFile {
    const primaryPath = getPluginLibraryFilePath();
    if (fs.existsSync(primaryPath)) {
      const raw = parseJsonObject(
        fs.readFileSync(primaryPath, "utf8"),
        "Plugin library",
      );
      return normalizeLibrary(raw);
    }

    const legacyPath = getLegacyPluginLibraryFilePath();
    if (!fs.existsSync(legacyPath)) {
      return defaultLibrary();
    }

    const raw = parseJsonObject(
      fs.readFileSync(legacyPath, "utf8"),
      "Plugin library",
    );
    const migrated = normalizeLibrary(raw);
    writeJsonFileAtomic(primaryPath, migrated);
    return migrated;
  }

  write(library: PluginLibraryFile): PluginLibraryFile {
    const next = normalizeLibrary({
      ...library,
      updatedAt: nowIso(),
    });
    writeJsonFileAtomic(getPluginLibraryFilePath(), next);
    return next;
  }

  readVersions(): PluginVersionFile {
    const versionPath = getPluginVersionFilePath();
    if (!fs.existsSync(versionPath)) {
      return defaultPluginVersions();
    }
    const raw = parseJsonObject(
      fs.readFileSync(versionPath, "utf8"),
      "Plugin versions",
    );
    return normalizePluginVersionsFile(raw);
  }

  writeVersions(versionsFile: PluginVersionFile): PluginVersionFile {
    const next = normalizePluginVersionsFile({
      ...versionsFile,
      updatedAt: nowIso(),
    });
    writeJsonFileAtomic(getPluginVersionFilePath(), next);
    return next;
  }

  getPluginVersions(pluginId: string): PluginVersion[] {
    const normalizedPluginId = safeString(pluginId);
    if (!normalizedPluginId) {
      throw new CorePluginError("INVALID_INPUT", "Plugin ID 不能为空");
    }
    return sortPluginVersions(
      this.readVersions().versions.filter(
        (version) => version.pluginId === normalizedPluginId,
      ),
    );
  }

  createPluginVersion(pluginId: string, note?: string): PluginVersion {
    const normalizedPluginId = safeString(pluginId);
    if (!normalizedPluginId) {
      throw new CorePluginError("INVALID_INPUT", "Plugin ID 不能为空");
    }
    const library = this.read();
    const plugin = library.plugins.find(
      (entry) => entry.id === normalizedPluginId,
    );
    if (!plugin) {
      throw new CorePluginError("NOT_FOUND", `Plugin 不存在: ${pluginId}`);
    }

    const versionsFile = this.readVersions();
    const versionNumber = getNextPluginVersionNumber(
      versionsFile.versions,
      plugin.id,
    );
    const packageSnapshot = readPluginPackageSnapshot(plugin);
    const version: PluginVersion = {
      id: createPluginVersionId(plugin.id, versionNumber),
      pluginId: plugin.id,
      version: versionNumber,
      note: safeString(note),
      createdAt: nowIso(),
      plugin,
      packageSnapshot,
    };
    this.writeVersions({
      ...versionsFile,
      versions: [...versionsFile.versions, version],
    });
    return version;
  }

  rollbackPluginVersion(
    pluginId: string,
    version: number,
  ): PluginVersionRollbackResult | null {
    const normalizedPluginId = safeString(pluginId);
    if (!normalizedPluginId) {
      throw new CorePluginError("INVALID_INPUT", "Plugin ID 不能为空");
    }
    if (!Number.isFinite(version) || version < 1) {
      throw new CorePluginError(
        "INVALID_INPUT",
        "Plugin version 必须从 1 开始",
      );
    }

    const restoredVersion =
      this.getPluginVersions(normalizedPluginId).find(
        (item) => item.version === version,
      ) ?? null;
    if (!restoredVersion) {
      return null;
    }
    const currentPlugin = this.read().plugins.find(
      (entry) => entry.id === normalizedPluginId,
    );
    if (!currentPlugin) {
      return null;
    }

    const safetyVersion = this.createPluginVersion(
      normalizedPluginId,
      `Rollback before restoring v${version}`,
    );
    const restoredPackage = restoredVersion.packageSnapshot
      ? writePluginPackageSnapshot(restoredVersion.packageSnapshot)
      : undefined;
    const restoredPlugin = remapRestoredPluginPackage(
      {
        ...restoredVersion.plugin,
        updatedAt: nowMs(),
      },
      restoredPackage,
    );
    const library = this.read();
    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: library.plugins.map((plugin) =>
        plugin.id === normalizedPluginId ? restoredPlugin : plugin,
      ),
    };
    writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
    return {
      plugin: restoredPlugin,
      library: nextLibrary,
      restoredVersion,
      safetyVersion,
    };
  }

  deletePluginVersion(pluginId: string, versionId: string): boolean {
    const normalizedPluginId = safeString(pluginId);
    const normalizedVersionId = safeString(versionId);
    if (!normalizedPluginId || !normalizedVersionId) {
      throw new CorePluginError("INVALID_INPUT", "Plugin version 参数不能为空");
    }
    const versionsFile = this.readVersions();
    const nextVersions = versionsFile.versions.filter(
      (version) =>
        !(
          version.pluginId === normalizedPluginId &&
          version.id === normalizedVersionId
        ),
    );
    if (nextVersions.length === versionsFile.versions.length) {
      return false;
    }
    this.writeVersions({
      ...versionsFile,
      versions: nextVersions,
    });
    return true;
  }

  exportSnapshot(): PluginLibrarySnapshot {
    const library = this.read();
    const packages = library.plugins.flatMap((plugin) => {
      const snapshot = readPluginPackageSnapshot(plugin);
      return snapshot ? [snapshot] : [];
    });

    return {
      library,
      packages: packages.length > 0 ? packages : undefined,
    };
  }

  restoreSnapshot(snapshot: PluginLibrarySnapshot): PluginLibraryFile {
    const packageByPluginId = new Map(
      (snapshot.packages ?? []).map((pluginPackage) => [
        pluginPackage.pluginId,
        writePluginPackageSnapshot(pluginPackage),
      ]),
    );
    const library = normalizeLibrary(snapshot.library);
    return this.write({
      ...library,
      plugins: library.plugins.map((plugin) =>
        remapRestoredPluginPackage(plugin, packageByPluginId.get(plugin.id)),
      ),
    });
  }

  readMarketCache(): PluginMarketCacheFile {
    const primaryPath = getPluginMarketCacheFilePath();
    if (fs.existsSync(primaryPath)) {
      const raw = parseJsonObject(
        fs.readFileSync(primaryPath, "utf8"),
        "Plugin market cache",
      );
      return normalizeMarketCache(raw);
    }

    const legacyPath = getLegacyPluginMarketCacheFilePath();
    if (!fs.existsSync(legacyPath)) {
      return defaultMarketCache();
    }

    const raw = parseJsonObject(
      fs.readFileSync(legacyPath, "utf8"),
      "Plugin market cache",
    );
    const migrated = normalizeMarketCache(raw);
    writeJsonFileAtomic(primaryPath, migrated);
    return migrated;
  }

  getMarketSources(sources?: PluginMarketSource[]): PluginMarketSource[] {
    return [...(sources ?? this.marketSources)];
  }

  getTargetMatrix(): PluginTargetCompatibility[] {
    return getPluginTargetMatrix();
  }

  async getMarketEntries(
    sources = this.marketSources,
  ): Promise<PluginMarketEntry[]> {
    const entries: PluginMarketEntry[] = [];
    for (const source of sources) {
      try {
        const sourceEntries = await this.readMarketplace(source);
        entries.push(...sourceEntries);
      } catch (error) {
        console.warn(
          `[plugin-library] Failed to read marketplace ${source.id}:`,
          error,
        );
      }
    }
    return entries;
  }

  async previewMarketPlugin(
    entryId: string,
    sources = this.marketSources,
  ): Promise<PluginMarketPreview> {
    const entry = await this.findMarketEntry(entryId, sources);
    const preview = await this.buildPreviewForEntry(entry, sources);
    this.writeMarketPreviewCache(preview);
    return preview;
  }

  private async findMarketEntry(
    entryId: string,
    sources = this.marketSources,
  ): Promise<PluginMarketEntry> {
    const entries = await this.getMarketEntries(sources);
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      throw new CorePluginError(
        "NOT_FOUND",
        `Plugin 商店条目不存在: ${entryId}`,
      );
    }
    return entry;
  }

  async installMarketPlugin(
    entryId: string,
    sources = this.marketSources,
  ): Promise<PluginInstallResult> {
    const preview = await this.previewMarketPlugin(entryId, sources);
    const entry = preview.entry;
    const inventory = preview.inventory;
    const classification = preview.classification;
    assertBundlePlugin(classification, entry.displayName);

    const name = preview.entry.name;
    const id = createPluginId(entry.marketplaceId, name);
    const library = this.read();
    if (library.plugins.some((plugin) => plugin.id === id)) {
      throw new CorePluginError(
        "DUPLICATE_PLUGIN",
        `Plugin 已安装: ${entry.displayName}`,
      );
    }

    const materialized = this.materializePackages
      ? await this.materializePackageFn(entry, id)
      : undefined;
    const timestamp = nowMs();
    const installedManifestHash = computePluginPreviewFingerprint(preview);
    const installedPackageHash = computePluginPackageFingerprint(
      materialized?.localPackagePath,
    );
    const source: PluginPackageSource = {
      ...entry.source,
      localRepositoryPath: materialized?.localRepositoryPath,
      localPackagePath: materialized?.localPackagePath,
    };
    const plugin: PluginLibraryEntry = {
      id,
      name,
      displayName: preview.displayName,
      description: preview.description,
      longDescription: preview.longDescription,
      iconUrl: preview.iconUrl,
      logoUrl: preview.logoUrl,
      brandColor: preview.brandColor,
      version: preview.version,
      author: preview.author,
      category: preview.category,
      trustLevel: entry.trustLevel,
      inventory,
      classification,
      source,
      tags: preview.tags,
      homepage: preview.homepage,
      repository: preview.repository,
      distributedTargetIds: [],
      managedPath: materialized?.managedPath,
      localRepositoryPath: materialized?.localRepositoryPath,
      localPackagePath: materialized?.localPackagePath,
      installedManifestHash,
      installedPackageHash,
      installedAt: timestamp,
      updatedAt: timestamp,
    };

    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: [...library.plugins, plugin],
    };

    try {
      writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
    } catch (error) {
      if (materialized?.managedPath) {
        fs.rmSync(materialized.managedPath, { recursive: true, force: true });
      }
      throw error;
    }

    return {
      plugin,
      library: nextLibrary,
      warnings: preview.warnings,
    };
  }

  async importSourcePlugin(
    request: PluginImportSourceRequest,
  ): Promise<PluginInstallResult> {
    const sourceRequest = normalizePluginSourceImportRequest(request);
    const sourcePackage = await this.materializeSourcePackageFn(sourceRequest);
    let materialized: MaterializedPluginPackage | undefined;
    try {
      const preview = this.buildPreviewForMaterializedSourcePackage(
        sourceRequest,
        sourcePackage,
      );
      const inventory = preview.inventory;
      const classification = preview.classification;
      const name = preview.entry.name;
      assertBundlePlugin(classification, name);

      const id = createPluginId(sourceRequest.sourceId, name);
      const library = this.read();
      if (
        library.plugins.some(
          (plugin) =>
            plugin.id === id ||
            (plugin.source.url === sourceRequest.url &&
              plugin.source.packagePath === sourceRequest.packagePath &&
              plugin.source.branch === sourceRequest.branch),
        )
      ) {
        throw new CorePluginError("DUPLICATE_PLUGIN", `Plugin 已导入: ${name}`);
      }

      materialized = copyPluginPackageToManagedPath(
        sourcePackage.sourcePath,
        id,
      );
      const timestamp = nowMs();
      const plugin: PluginLibraryEntry = {
        id,
        name,
        displayName: preview.displayName,
        description: preview.description,
        longDescription: preview.longDescription,
        iconUrl: preview.iconUrl,
        logoUrl: preview.logoUrl,
        brandColor: preview.brandColor,
        version: preview.version,
        author: preview.author,
        category: preview.category,
        trustLevel: "custom",
        inventory,
        classification,
        source: {
          ...preview.entry.source,
          localPackagePath: materialized.localPackagePath,
          localRepositoryPath: materialized.localRepositoryPath,
        },
        tags: preview.tags,
        homepage: preview.homepage,
        repository: preview.repository || sourceRequest.url,
        distributedTargetIds: [],
        managedPath: materialized.managedPath,
        localRepositoryPath: materialized.localRepositoryPath,
        localPackagePath: materialized.localPackagePath,
        installedManifestHash: computePluginPreviewFingerprint(preview),
        installedPackageHash: computePluginPackageFingerprint(
          materialized.localPackagePath,
        ),
        installedAt: timestamp,
        updatedAt: timestamp,
      };
      const nextLibrary: PluginLibraryFile = {
        ...library,
        updatedAt: nowIso(),
        plugins: [...library.plugins, plugin],
      };

      try {
        writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
      } catch (error) {
        fs.rmSync(materialized.managedPath, { recursive: true, force: true });
        throw error;
      }

      return {
        plugin,
        library: nextLibrary,
        warnings: preview.warnings,
      };
    } finally {
      if (sourcePackage.cleanupPath) {
        fs.rmSync(sourcePackage.cleanupPath, { recursive: true, force: true });
      }
    }
  }

  async previewSourcePlugin(
    request: PluginImportSourceRequest,
  ): Promise<PluginMarketPreview> {
    const sourceRequest = normalizePluginSourceImportRequest(request);
    const sourcePackage = await this.materializeSourcePackageFn(sourceRequest);
    try {
      return this.buildPreviewForMaterializedSourcePackage(
        sourceRequest,
        sourcePackage,
      );
    } finally {
      if (sourcePackage.cleanupPath) {
        fs.rmSync(sourcePackage.cleanupPath, { recursive: true, force: true });
      }
    }
  }

  importLocalPluginPackage(
    request: PluginImportLocalRequest,
  ): PluginInstallResult {
    const sourcePath = path.resolve(request.sourcePath);
    assertReadableDirectory(sourcePath, "Agent Plugin package");
    const markerPath = findLocalPluginMarker(sourcePath);
    if (!markerPath) {
      throw new CorePluginError(
        "MISSING_MANIFEST",
        `没有找到可识别的 Plugin manifest: ${sourcePath}`,
      );
    }

    const { manifest } = readLocalPluginManifest(markerPath);
    validateLocalPluginPackage(sourcePath, manifest);
    const inventory = extractLocalPluginInventory(
      sourcePath,
      manifest,
      markerPath,
    );
    const classification = classifyPluginInventory(inventory);
    const name = safeString(manifest.name) ?? path.basename(sourcePath);
    assertBundlePlugin(classification, name);

    const sourceTargetId = request.sourceTargetId?.trim() || "agent";
    const id = createPluginId(`agent-${sourceTargetId}`, name);
    const library = this.read();
    if (
      library.plugins.some(
        (plugin) => plugin.id === id || plugin.source.url === sourcePath,
      )
    ) {
      throw new CorePluginError("DUPLICATE_PLUGIN", `Plugin 已导入: ${name}`);
    }

    const materialized = copyPluginPackageToManagedPath(sourcePath, id);
    const timestamp = nowMs();
    const preview = this.buildPreviewForLocalPackage(
      sourcePath,
      manifest,
      inventory,
      classification,
      sourceTargetId,
      request.sourceTargetName,
    );
    const plugin: PluginLibraryEntry = {
      id,
      name,
      displayName: preview.displayName,
      description: preview.description,
      longDescription: preview.longDescription,
      iconUrl: preview.iconUrl,
      logoUrl: preview.logoUrl,
      brandColor: preview.brandColor,
      version: preview.version,
      author: preview.author,
      category: preview.category,
      trustLevel: "custom",
      inventory,
      classification,
      source: {
        kind: "local",
        sourceId: sourceTargetId,
        label: request.sourceTargetName,
        localPackagePath: materialized.localPackagePath,
        localRepositoryPath: materialized.localRepositoryPath,
        url: sourcePath,
      },
      tags: safeStringArray(manifest.keywords),
      homepage: safeString(manifest.homepage),
      repository: safeString(manifest.repository),
      distributedTargetIds: [],
      managedPath: materialized.managedPath,
      localRepositoryPath: materialized.localRepositoryPath,
      localPackagePath: materialized.localPackagePath,
      installedManifestHash: computePluginPreviewFingerprint(preview),
      installedPackageHash: computePluginPackageFingerprint(
        materialized.localPackagePath,
      ),
      installedAt: timestamp,
      updatedAt: timestamp,
    };
    const nextLibrary = {
      ...library,
      updatedAt: nowIso(),
      plugins: [...library.plugins, plugin],
    };
    writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
    return { plugin, library: nextLibrary, warnings: [] };
  }

  checkInstalledPluginPackage(pluginId: string): PluginPackageHealthCheck {
    const checkedAt = nowIso();
    const library = this.read();
    const plugin = library.plugins.find((entry) => entry.id === pluginId);
    if (!plugin) {
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

    const rawPackagePath = getPluginLocalPackagePath(plugin);
    const packagePath = rawPackagePath ? path.resolve(rawPackagePath) : "";
    if (!packagePath || !fs.existsSync(packagePath)) {
      return {
        status: "missing-package",
        pluginId,
        checkedAt,
        packagePath: packagePath || undefined,
        findings: [
          {
            code: "MISSING_PACKAGE",
            severity: "error",
            message: `${plugin.displayName} 本地 Plugin 包不存在`,
            path: packagePath || undefined,
          },
        ],
      };
    }

    try {
      assertReadableDirectory(
        packagePath,
        `${plugin.displayName} 本地 Plugin 包`,
      );
    } catch (error) {
      return {
        status: "missing-package",
        pluginId,
        checkedAt,
        packagePath,
        findings: [
          createPluginPackageHealthFinding(
            error,
            "MISSING_PACKAGE",
            `${plugin.displayName} 本地 Plugin 包不可读`,
            packagePath,
          ),
        ],
      };
    }

    const markerPath = findLocalPluginMarker(packagePath);
    if (!markerPath) {
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
            `${plugin.displayName} Plugin 包检查失败`,
            markerPath,
          ),
        ],
      };
    }
  }

  async getPluginSourceUpdateStatus(
    pluginId: string,
    sources = this.marketSources,
  ): Promise<PluginSourceUpdateCheck> {
    const library = this.read();
    const plugin = library.plugins.find((entry) => entry.id === pluginId);
    if (!plugin) {
      return {
        status: "not-installed",
        localModified: false,
        remoteChanged: false,
      };
    }

    const preview = await this.buildPreviewForInstalledPlugin(plugin, sources);
    const remoteManifestHash = computePluginPreviewFingerprint(preview);
    const installedManifestHash =
      plugin.installedManifestHash ??
      computePluginEntryManifestFingerprint(plugin);
    const localPackageHash = computePluginPackageFingerprint(
      getPluginLocalPackagePath(plugin),
    );
    const localModified = Boolean(
      plugin.installedPackageHash &&
      localPackageHash &&
      localPackageHash !== plugin.installedPackageHash,
    );
    const remoteChanged = remoteManifestHash !== installedManifestHash;
    const status = getPluginUpdateStatus(localModified, remoteChanged);

    return {
      status,
      plugin,
      preview,
      localPackageHash,
      installedPackageHash: plugin.installedPackageHash,
      remoteManifestHash,
      installedManifestHash,
      localModified,
      remoteChanged,
    };
  }

  async updatePluginFromSource(
    pluginId: string,
    options: { overwriteLocalChanges?: boolean } = {},
    sources = this.marketSources,
  ): Promise<PluginSourceUpdateResult> {
    const check = await this.getPluginSourceUpdateStatus(pluginId, sources);
    const library = this.read();
    const plugin = check.plugin;
    if (!plugin || !check.preview) {
      return { status: "not-installed", library, check };
    }
    if (check.status === "up-to-date") {
      return { status: "up-to-date", plugin, library, check };
    }
    if (
      (check.status === "local-modified" || check.status === "conflict") &&
      !options.overwriteLocalChanges
    ) {
      return { status: check.status, library, check };
    }

    assertBundlePlugin(check.preview.classification, check.preview.displayName);
    this.createPluginVersion(
      plugin.id,
      `Source update: ${plugin.version || "unknown"} -> ${
        check.preview.version || "unknown"
      }`,
    );
    const materialized = await this.materializeUpdatedPluginPackage(
      plugin,
      check.preview,
    );
    const timestamp = nowMs();
    const nextPlugin = buildUpdatedPluginFromPreview(
      plugin,
      check.preview,
      materialized,
      check.remoteManifestHash,
      timestamp,
    );
    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: library.plugins.map((entry) =>
        entry.id === plugin.id ? nextPlugin : entry,
      ),
    };
    try {
      writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
    } catch (error) {
      if (
        materialized?.managedPath &&
        materialized.managedPath !== plugin.managedPath
      ) {
        fs.rmSync(materialized.managedPath, { recursive: true, force: true });
      }
      throw error;
    }

    return {
      status: "updated",
      plugin: nextPlugin,
      library: nextLibrary,
      check,
      warnings: check.preview.warnings,
    };
  }

  private async buildPreviewForInstalledPlugin(
    plugin: PluginLibraryEntry,
    sources: PluginMarketSource[],
  ): Promise<PluginMarketPreview> {
    if (plugin.source.kind === "local") {
      return this.buildPreviewForLocalSource(plugin);
    }
    if (isGitTransportSourceKind(plugin.source.kind)) {
      return this.buildPreviewForGitSource(plugin);
    }

    const entries = await this.getMarketEntries(sources);
    const entry = entries.find(
      (item) =>
        item.id === plugin.id ||
        (item.marketplaceId === plugin.source.sourceId &&
          item.name === plugin.name),
    );
    if (!entry) {
      throw new CorePluginError(
        "NOT_FOUND",
        `Plugin 来源不存在: ${plugin.displayName}`,
      );
    }
    return this.buildPreviewForEntry(entry, sources);
  }

  private buildPreviewForLocalSource(
    plugin: PluginLibraryEntry,
  ): PluginMarketPreview {
    const sourcePath = plugin.source.url;
    if (!sourcePath) {
      throw new CorePluginError(
        "MISSING_SOURCE",
        `${plugin.displayName} 没有可更新的本地来源`,
      );
    }
    assertReadableDirectory(
      sourcePath,
      `${plugin.displayName} 本地 Plugin 来源`,
    );
    const markerPath = findLocalPluginMarker(sourcePath);
    if (!markerPath) {
      throw new CorePluginError(
        "MISSING_MANIFEST",
        `没有找到可识别的 Plugin manifest: ${sourcePath}`,
      );
    }
    const { manifest } = readLocalPluginManifest(markerPath);
    validateLocalPluginPackage(sourcePath, manifest);
    const inventory = extractLocalPluginInventory(
      sourcePath,
      manifest,
      markerPath,
    );
    const classification = classifyPluginInventory(inventory);
    return this.buildPreviewForLocalPackage(
      sourcePath,
      manifest,
      inventory,
      classification,
      plugin.source.sourceId,
      plugin.source.label,
    );
  }

  private buildPreviewForMaterializedSourcePackage(
    sourceRequest: NormalizedPluginSourceRequest,
    sourcePackage: MaterializedPluginSourcePackage,
  ): PluginMarketPreview {
    assertReadableDirectory(sourcePackage.sourcePath, "Plugin source package");
    const markerPath = findLocalPluginMarker(sourcePackage.sourcePath);
    if (!markerPath) {
      throw new CorePluginError(
        "MISSING_MANIFEST",
        `没有找到可识别的 Plugin manifest: ${sourceRequest.url}`,
      );
    }

    const { manifest } = readLocalPluginManifest(markerPath);
    validateLocalPluginPackage(sourcePackage.sourcePath, manifest);
    const inventory = extractLocalPluginInventory(
      sourcePackage.sourcePath,
      manifest,
      markerPath,
    );
    const classification = classifyPluginInventory(inventory);
    return this.buildPreviewForSourcePackage(
      sourcePackage.sourcePath,
      manifest,
      inventory,
      classification,
      sourceRequest,
    );
  }

  private async buildPreviewForGitSource(
    plugin: PluginLibraryEntry,
  ): Promise<PluginMarketPreview> {
    if (!plugin.source.url) {
      throw new CorePluginError(
        "MISSING_SOURCE",
        `${plugin.displayName} 没有可更新的 Plugin source URL`,
      );
    }
    const sourceRequest = normalizePluginSourceImportRequest({
      branch: plugin.source.branch,
      label: plugin.source.label,
      packagePath: plugin.source.packagePath,
      url: plugin.source.url,
    });
    const sourcePackage = await this.materializeSourcePackageFn(sourceRequest);
    try {
      assertReadableDirectory(
        sourcePackage.sourcePath,
        `${plugin.displayName} Plugin source package`,
      );
      const markerPath = findLocalPluginMarker(sourcePackage.sourcePath);
      if (!markerPath) {
        throw new CorePluginError(
          "MISSING_MANIFEST",
          `没有找到可识别的 Plugin manifest: ${plugin.source.url}`,
        );
      }
      const { manifest } = readLocalPluginManifest(markerPath);
      validateLocalPluginPackage(sourcePackage.sourcePath, manifest);
      const inventory = extractLocalPluginInventory(
        sourcePackage.sourcePath,
        manifest,
        markerPath,
      );
      const classification = classifyPluginInventory(inventory);
      return this.buildPreviewForSourcePackage(
        sourcePackage.sourcePath,
        manifest,
        inventory,
        classification,
        sourceRequest,
      );
    } finally {
      if (sourcePackage.cleanupPath) {
        fs.rmSync(sourcePackage.cleanupPath, { recursive: true, force: true });
      }
    }
  }

  private async materializeUpdatedPluginPackage(
    plugin: PluginLibraryEntry,
    preview: PluginMarketPreview,
  ): Promise<MaterializedPluginPackage | undefined> {
    if (plugin.source.kind === "local") {
      if (!plugin.source.url) {
        throw new CorePluginError("MISSING_SOURCE", "本地 Plugin 来源路径为空");
      }
      return copyPluginPackageToManagedPath(plugin.source.url, plugin.id);
    }
    if (isGitTransportSourceKind(plugin.source.kind)) {
      if (!plugin.source.url) {
        throw new CorePluginError("MISSING_SOURCE", "Plugin source URL 为空");
      }
      const sourcePackage = await this.materializeSourcePackageFn(
        normalizePluginSourceImportRequest({
          branch: plugin.source.branch,
          label: plugin.source.label,
          packagePath: plugin.source.packagePath,
          url: plugin.source.url,
        }),
      );
      try {
        return copyPluginPackageToManagedPath(
          sourcePackage.sourcePath,
          plugin.id,
        );
      } finally {
        if (sourcePackage.cleanupPath) {
          fs.rmSync(sourcePackage.cleanupPath, {
            recursive: true,
            force: true,
          });
        }
      }
    }
    return this.materializePackages
      ? this.materializePackageFn(preview.entry, plugin.id)
      : undefined;
  }

  private buildPreviewForLocalPackage(
    sourcePath: string,
    manifest: RawRecord,
    inventory: PluginInventorySummary,
    classification: PluginSemanticClassification,
    sourceTargetId = "local",
    sourceTargetName?: string,
  ): PluginMarketPreview {
    return this.buildPreviewForPackageSource(
      sourcePath,
      manifest,
      inventory,
      classification,
      {
        kind: "local",
        label: sourceTargetName,
        marketplaceId: `local-${sourceTargetId}`,
        sourceId: sourceTargetId,
        url: sourcePath,
      },
    );
  }

  private buildPreviewForSourcePackage(
    sourcePath: string,
    manifest: RawRecord,
    inventory: PluginInventorySummary,
    classification: PluginSemanticClassification,
    sourceRequest: NormalizedPluginSourceRequest,
  ): PluginMarketPreview {
    return this.buildPreviewForPackageSource(
      sourcePath,
      manifest,
      inventory,
      classification,
      {
        branch: sourceRequest.branch,
        kind: sourceRequest.kind,
        label: sourceRequest.label,
        marketplaceId: sourceRequest.sourceId,
        packagePath: sourceRequest.packagePath,
        repository: sourceRequest.url,
        sourceId: sourceRequest.sourceId,
        url: sourceRequest.url,
      },
    );
  }

  private buildPreviewForPackageSource(
    sourcePath: string,
    manifest: RawRecord,
    inventory: PluginInventorySummary,
    classification: PluginSemanticClassification,
    source: PluginPackageSource & { marketplaceId: string },
  ): PluginMarketPreview {
    const { marketplaceId, ...entrySource } = source;
    const name = safeString(manifest.name) ?? path.basename(sourcePath);
    const interfaceRecord =
      manifest.interface && typeof manifest.interface === "object"
        ? (manifest.interface as RawRecord)
        : {};
    const displayName =
      safeString(interfaceRecord.displayName) ||
      safeString(manifest.displayName) ||
      name;
    const description =
      safeString(interfaceRecord.shortDescription) ||
      safeString(manifest.description) ||
      safeString(interfaceRecord.longDescription);
    const entry: PluginMarketEntry = {
      id: createPluginId(marketplaceId, name),
      marketplaceId,
      name,
      displayName,
      description,
      iconUrl: safeString(interfaceRecord.composerIcon),
      logoUrl: safeString(interfaceRecord.logo),
      brandColor: safePluginBrandColor(interfaceRecord.brandColor),
      version: safeString(manifest.version),
      author: normalizeAuthor(manifest.author),
      category: safeString(interfaceRecord.category),
      trustLevel: "custom",
      source: entrySource,
      inventory,
      classification,
    };
    return {
      entry,
      displayName,
      description,
      longDescription: safeString(interfaceRecord.longDescription),
      iconUrl: entry.iconUrl,
      logoUrl: entry.logoUrl,
      brandColor: entry.brandColor,
      version: entry.version,
      author: entry.author,
      category: entry.category,
      inventory,
      classification,
      tags: safeStringArray(manifest.keywords),
      homepage:
        safeString(manifest.homepage) || safeString(interfaceRecord.websiteURL),
      repository: safeString(manifest.repository) || source.repository,
      canInstall: classification === "bundle",
      unsupportedReason: getPluginSemanticUnsupportedReason(classification),
      warnings: [],
    };
  }

  distributePlugin(request: PluginDistributeRequest): PluginDistributeResult {
    const targetIds = normalizeDistributedTargetIds(request.targetIds);
    if (targetIds.length === 0) {
      throw new CorePluginError(
        "MISSING_TARGET",
        "请选择至少一个 Agent Plugin 目标",
      );
    }
    if (request.mode !== "copy" && request.mode !== "symlink") {
      throw new CorePluginError(
        "INVALID_MODE",
        `不支持的 Plugin 分发模式: ${request.mode}`,
      );
    }
    assertSupportedPluginTargets(targetIds);

    const library = this.read();
    const plugin = library.plugins.find(
      (entry) => entry.id === request.pluginId,
    );
    if (!plugin) {
      throw new CorePluginError(
        "NOT_FOUND",
        `Plugin 不存在: ${request.pluginId}`,
      );
    }

    const sourcePath = getPluginLocalPackagePath(plugin);
    assertReadableDirectory(sourcePath, `${plugin.displayName} 本地 Plugin 包`);

    if (!this.resolvePluginTargetPath) {
      throw new CorePluginError(
        "MISSING_TARGET_RESOLVER",
        "当前环境没有配置 Agent Plugin 目标路径解析器",
      );
    }

    const targets = targetIds.map((targetId) => {
      const targetPath = this.resolvePluginTargetPath?.(targetId, plugin);
      if (!targetPath) {
        throw new CorePluginError(
          "MISSING_TARGET_PATH",
          `无法解析 Agent Plugin 目标路径: ${targetId}`,
        );
      }
      const mode = writePluginPackageToAgentTarget(
        sourcePath,
        targetPath,
        request.mode,
        targetId,
        plugin,
      );
      return { targetId, path: targetPath, mode };
    });

    const nextPlugin: PluginLibraryEntry = {
      ...plugin,
      distributedTargetIds: normalizeDistributedTargetIds([
        ...(plugin.distributedTargetIds ?? []),
        ...targets.map((target) => target.targetId),
      ]),
      updatedAt: nowMs(),
    };
    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: library.plugins.map((entry) =>
        entry.id === plugin.id ? nextPlugin : entry,
      ),
    };
    writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
    return {
      plugin: nextPlugin,
      library: nextLibrary,
      targets,
    };
  }

  removePluginDistribution(
    request: PluginUndistributeRequest,
  ): PluginUndistributeResult {
    const targetIds = normalizeDistributedTargetIds(request.targetIds ?? []);
    if (!request.pluginId.trim()) {
      throw new CorePluginError("INVALID_INPUT", "Plugin ID 不能为空");
    }
    if (targetIds.length === 0) {
      throw new CorePluginError(
        "MISSING_TARGET",
        "请选择至少一个 Agent Plugin 目标",
      );
    }

    const library = this.read();
    const plugin = library.plugins.find(
      (entry) => entry.id === request.pluginId,
    );
    if (!plugin) {
      throw new CorePluginError(
        "NOT_FOUND",
        `Plugin 不存在: ${request.pluginId}`,
      );
    }
    if (!this.resolvePluginTargetPath) {
      throw new CorePluginError(
        "MISSING_TARGET_RESOLVER",
        "当前环境没有配置 Agent Plugin 目标路径解析器",
      );
    }

    const distributedTargetIds = normalizeDistributedTargetIds(
      plugin.distributedTargetIds ?? [],
    );
    const distributedTargetSet = new Set(distributedTargetIds);
    const removedTargetIds: string[] = [];
    const skippedTargetIds: string[] = [];

    for (const targetId of targetIds) {
      if (!distributedTargetSet.has(targetId)) {
        skippedTargetIds.push(targetId);
        continue;
      }
      const targetPath = this.resolvePluginTargetPath(targetId, plugin);
      if (!targetPath) {
        throw new CorePluginError(
          "MISSING_TARGET_PATH",
          `无法解析 Agent Plugin 目标路径: ${targetId}`,
        );
      }
      deletePluginPackageTarget(targetPath);
      removedTargetIds.push(targetId);
    }

    const nextPlugin: PluginLibraryEntry = {
      ...plugin,
      distributedTargetIds: distributedTargetIds.filter(
        (targetId) => !removedTargetIds.includes(targetId),
      ),
      updatedAt: nowMs(),
    };
    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: library.plugins.map((entry) =>
        entry.id === plugin.id ? nextPlugin : entry,
      ),
    };
    writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);

    return {
      plugin: nextPlugin,
      library: nextLibrary,
      removedTargetIds,
      skippedTargetIds,
    };
  }

  updatePluginMetadata(
    pluginId: string,
    metadata: PluginMetadataUpdate,
  ): PluginLibraryFile {
    const library = this.read();
    const plugin = library.plugins.find((entry) => entry.id === pluginId);
    if (!plugin) {
      throw new CorePluginError("NOT_FOUND", `Plugin 不存在: ${pluginId}`);
    }

    const nextPlugin: PluginLibraryEntry = {
      ...plugin,
      isFavorite:
        typeof metadata.isFavorite === "boolean"
          ? metadata.isFavorite
          : plugin.isFavorite === true,
      userTags: Array.isArray(metadata.userTags)
        ? safePluginUserTags(metadata.userTags)
        : safePluginUserTags(plugin.userTags),
      userNotes:
        typeof metadata.userNotes === "string"
          ? metadata.userNotes
          : safePluginUserNotes(plugin.userNotes),
      safetyReport:
        metadata.safetyReport !== undefined
          ? normalizePluginSafetyReport(metadata.safetyReport)
          : normalizePluginSafetyReport(plugin.safetyReport),
      updatedAt: nowMs(),
    };
    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: library.plugins.map((entry) =>
        entry.id === pluginId ? nextPlugin : entry,
      ),
    };
    writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
    return nextLibrary;
  }

  private async buildPreviewForEntry(
    entry: PluginMarketEntry,
    sources = this.marketSources,
  ): Promise<PluginMarketPreview> {
    const manifest = await this.readManifestForEntry(entry, sources);
    const marketSource = sources.find(
      (source) => source.id === entry.marketplaceId,
    );
    if (!marketSource) {
      throw new CorePluginError(
        "MISSING_SOURCE",
        `${entry.displayName} 的 marketplace source 不存在`,
      );
    }
    const inventory = await this.resolveInventoryForEntry(
      entry,
      manifest,
      marketSource,
    );
    const classification = classifyPluginInventory(inventory);
    const name = safeString(manifest.name) ?? entry.name;
    const interfaceRecord =
      manifest.interface && typeof manifest.interface === "object"
        ? (manifest.interface as RawRecord)
        : {};
    const displayName =
      safeString(interfaceRecord.displayName) ||
      safeString(manifest.displayName) ||
      entry.displayName ||
      name;
    const shortDescription =
      safeString(interfaceRecord.shortDescription) ||
      safeString(manifest.description) ||
      entry.description;
    const longDescription = safeString(interfaceRecord.longDescription);
    const description = shortDescription || longDescription;
    const manifestUrl = this.getManifestUrlForEntry(entry, sources);
    const iconUrl =
      resolveManifestAssetUrl(
        marketSource,
        entry,
        interfaceRecord.composerIcon,
      ) ||
      resolveManifestAssetUrl(marketSource, entry, interfaceRecord.icon) ||
      entry.iconUrl;
    const logoUrl =
      resolveManifestAssetUrl(marketSource, entry, interfaceRecord.logo) ||
      entry.logoUrl;
    const brandColor =
      safePluginBrandColor(interfaceRecord.brandColor) ?? entry.brandColor;
    const enrichedEntry: PluginMarketEntry = {
      ...entry,
      name,
      displayName,
      description,
      iconUrl: iconUrl ?? logoUrl,
      logoUrl,
      brandColor,
      version: safeString(manifest.version) ?? entry.version,
      author: normalizeAuthor(manifest.author) ?? entry.author,
      category: entry.category ?? safeString(interfaceRecord.category),
      inventory,
      classification,
    };
    return {
      entry: enrichedEntry,
      displayName,
      description,
      longDescription,
      iconUrl: enrichedEntry.iconUrl,
      logoUrl,
      brandColor,
      version: enrichedEntry.version,
      author: enrichedEntry.author,
      category: enrichedEntry.category,
      inventory,
      classification,
      tags: safeStringArray(manifest.keywords),
      homepage:
        safeString(manifest.homepage) || safeString(interfaceRecord.websiteURL),
      repository: safeString(manifest.repository) || entry.source.repository,
      codexDetailUrl: entry.codexDetailUrl,
      manifestUrl,
      canInstall: classification === "bundle",
      unsupportedReason: getPluginSemanticUnsupportedReason(classification),
      warnings: [],
    };
  }

  private async resolveInventoryForEntry(
    entry: PluginMarketEntry,
    manifest: RawRecord,
    source: PluginMarketSource,
  ): Promise<PluginInventorySummary> {
    const inventory = extractPluginInventoryFromManifest(manifest);
    const expandedSkills = await this.resolveDirectoryBasedSkillCount(
      entry,
      manifest,
      source,
    );
    if (expandedSkills !== undefined) {
      inventory.skills = expandedSkills;
    }
    return inventory;
  }

  private async resolveDirectoryBasedSkillCount(
    entry: PluginMarketEntry,
    manifest: RawRecord,
    source: PluginMarketSource,
  ): Promise<number | undefined> {
    const skillPaths = manifestFieldStrings(manifest.skills);
    if (
      skillPaths.length === 0 ||
      !skillPaths.some(looksLikeDirectoryManifestPath)
    ) {
      return undefined;
    }

    let total = 0;
    let expandedAnyDirectory = false;
    for (const skillPath of skillPaths) {
      if (!looksLikeDirectoryManifestPath(skillPath)) {
        total += 1;
        continue;
      }
      const count = await this.countRepositorySkillFiles(
        entry,
        source,
        skillPath,
      );
      if (count === undefined) {
        return undefined;
      }
      total += count;
      expandedAnyDirectory = true;
    }

    return expandedAnyDirectory && total > 0 ? total : undefined;
  }

  private async countRepositorySkillFiles(
    entry: PluginMarketEntry,
    source: PluginMarketSource,
    rawSkillPath: string,
  ): Promise<number | undefined> {
    if (!entry.source.packagePath) {
      return undefined;
    }

    const repositoryRef = parseGitHubRepositoryRef(
      source.repository,
      source.rawJsonUrl,
    );
    if (!repositoryRef) {
      return undefined;
    }

    try {
      const packagePath = normalizeRelativePosixPath(entry.source.packagePath);
      const skillPath = normalizeRelativePosixPath(rawSkillPath);
      const skillDirectory = normalizeRelativePosixPath(
        path.posix.join(packagePath, skillPath),
      );
      const treePaths = await this.getGitHubTreePaths(repositoryRef);
      return treePaths.filter((treePath) =>
        isSkillFileUnderDirectory(treePath, skillDirectory),
      ).length;
    } catch {
      return undefined;
    }
  }

  private async getGitHubTreePaths(
    repositoryRef: GitHubRepositoryRef,
  ): Promise<string[]> {
    const treeUrl = buildGitHubTreeUrl(repositoryRef);
    const cached = this.githubTreePathCache.get(treeUrl);
    if (cached) {
      return cached;
    }

    const treePromise = this.fetchText(treeUrl)
      .then((content) =>
        extractGitHubTreePaths(parseJsonObject(content, "GitHub tree")),
      )
      .catch((error) => {
        this.githubTreePathCache.delete(treeUrl);
        throw error;
      });
    this.githubTreePathCache.set(treeUrl, treePromise);
    return treePromise;
  }

  private writeMarketPreviewCache(preview: PluginMarketPreview): void {
    const cache = this.readMarketCache();
    const entry = buildPreviewCacheEntry(preview);
    const nextCache: PluginMarketCacheFile = {
      ...cache,
      updatedAt: nowIso(),
      entries: {
        ...cache.entries,
        [entry.id]: entry,
      },
    };
    writeJsonFileAtomic(getPluginMarketCacheFilePath(), nextCache);
  }

  deletePlugin(
    id: string,
    options: PluginDeleteOptions = {},
  ): PluginLibraryFile {
    const library = this.read();
    const deletedPlugin = library.plugins.find((plugin) => plugin.id === id);
    const nextPlugins = library.plugins.filter((plugin) => plugin.id !== id);
    if (nextPlugins.length === library.plugins.length) {
      throw new CorePluginError("NOT_FOUND", `Plugin 不存在: ${id}`);
    }
    if (deletedPlugin && options.removeDistributedTargets) {
      this.deleteDistributedPluginTargets(deletedPlugin);
    }
    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: nextPlugins,
    };
    writeJsonFileAtomic(getPluginLibraryFilePath(), nextLibrary);
    if (deletedPlugin?.managedPath) {
      this.deleteManagedPluginPath(deletedPlugin.managedPath);
    }
    return nextLibrary;
  }

  private deleteDistributedPluginTargets(plugin: PluginLibraryEntry): void {
    const targetIds = normalizeDistributedTargetIds(
      plugin.distributedTargetIds ?? [],
    );
    if (targetIds.length === 0) {
      return;
    }
    if (!this.resolvePluginTargetPath) {
      throw new CorePluginError(
        "MISSING_TARGET_RESOLVER",
        "当前环境没有配置 Agent Plugin 目标路径解析器",
      );
    }
    for (const targetId of targetIds) {
      const targetPath = this.resolvePluginTargetPath(targetId, plugin);
      if (targetPath) {
        deletePluginPackageTarget(targetPath);
      }
    }
  }

  private deleteManagedPluginPath(targetPath: string): void {
    const pluginsDir = path.resolve(getManagedPluginsDir());
    const resolvedTarget = path.resolve(targetPath);
    if (
      resolvedTarget === pluginsDir ||
      !resolvedTarget.startsWith(`${pluginsDir}${path.sep}`)
    ) {
      return;
    }
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
  }

  private async readMarketplace(
    source: PluginMarketSource,
  ): Promise<PluginMarketEntry[]> {
    const local = readLocalPromptHubMarketplace(source);
    const content = local ?? (await this.fetchText(source.rawJsonUrl));
    const marketplace = parseJsonObject(
      content,
      `${source.displayName} market`,
    );
    const marketplaceDisplayName = getMarketplaceDisplayName(
      marketplace,
      source,
    );
    const plugins = Array.isArray(marketplace.plugins)
      ? marketplace.plugins
      : [];
    const cache = this.readMarketCache();
    return plugins
      .map((plugin) =>
        normalizeMarketEntry(plugin, source, marketplaceDisplayName),
      )
      .filter((plugin): plugin is PluginMarketEntry => plugin !== null)
      .map((entry) => applyPreviewCacheToEntry(entry, cache.entries[entry.id]));
  }

  private async readManifestForEntry(
    entry: PluginMarketEntry,
    sources = this.marketSources,
  ): Promise<RawRecord> {
    const manifestUrl = this.getManifestUrlForEntry(entry, sources);
    const content = await this.fetchText(manifestUrl);
    return parseJsonObject(content, `${entry.displayName} manifest`);
  }

  private getManifestUrlForEntry(
    entry: PluginMarketEntry,
    sources = this.marketSources,
  ): string {
    if (!entry.source.manifestPath) {
      throw new CorePluginError(
        "MISSING_MANIFEST",
        `${entry.displayName} 没有可定位的 Plugin manifest`,
      );
    }

    const marketSource = sources.find(
      (source) => source.id === entry.marketplaceId,
    );
    if (!marketSource) {
      throw new CorePluginError(
        "MISSING_SOURCE",
        `${entry.displayName} 的 marketplace source 不存在`,
      );
    }

    return buildRawPluginFileUrl(marketSource, entry.source.manifestPath);
  }

  private async fetchText(url: string): Promise<string> {
    const response = await this.fetchFn(url, {
      headers: { Accept: "application/json,text/plain,*/*" },
    });
    if (!response.ok) {
      throw new CorePluginError(
        "FETCH_FAILED",
        `读取 Plugin 资源失败 (${response.status} ${response.statusText}): ${url}`,
      );
    }
    return response.text();
  }
}
