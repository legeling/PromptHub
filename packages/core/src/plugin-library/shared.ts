import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";

import type {
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginMarketSource,
  PluginPackageSource,
  PluginSemanticClassification,
  PluginSourceKind,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";

import {
  getCacheDir,
  getConfigDir,
  getDataDir,
  getRuntimeStorageContext,
  getUserDataPath,
} from "../runtime-paths";
import { assertStorageMaintenanceAvailable } from "../storage-maintenance-intent";

export const PLUGIN_LIBRARY_FILE_NAME = "library.json";
export const PLUGIN_MARKET_CACHE_FILE_NAME = "market-cache.json";
export const PLUGIN_VERSION_FILE_NAME = "versions.json";
export const LEGACY_PLUGIN_LIBRARY_FILE_NAME = "plugin-library.json";
export const LEGACY_PLUGIN_MARKET_CACHE_FILE_NAME = "plugin-market-cache.json";
export const PLUGIN_MARKETPLACE_FILE = ".agents/plugins/marketplace.json";
export const CODEX_PLUGIN_MANIFEST_FILE = ".codex-plugin/plugin.json";
const PLUGIN_DISTRIBUTION_ID_HASH_LENGTH = 16;

export function getPluginNativeMarketplaceName(pluginId: string): string {
  return `prompthub-${createHash("sha256").update(pluginId).digest("hex").slice(0, PLUGIN_DISTRIBUTION_ID_HASH_LENGTH)}`;
}

export function getPluginNativeSourceRoot(
  agentRoot: string,
  pluginId: string,
): string {
  return path.join(
    agentRoot,
    "plugins",
    "prompthub-sources",
    getPluginNativeMarketplaceName(pluginId),
  );
}
export const MAX_LOCAL_PLUGIN_MANIFEST_BYTES = 1024 * 1024;
export const MAX_PLUGIN_PACKAGE_SNAPSHOT_FILES = 2000;
export const MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES = 5 * 1024 * 1024;
export const PLUGIN_PACKAGE_SNAPSHOT_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "__pycache__",
  ".cache",
]);
export const LOCAL_PLUGIN_MARKER_PATHS = [
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  "gemini-extension.json",
  "plugin.json",
  ".plugin/plugin.json",
  ".github/plugin/plugin.json",
  "POWER.md",
];
export const LOCAL_PLUGIN_INVENTORY_DIRS: Array<{
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
export const LOCAL_PLUGIN_MANIFEST_PATH_FIELDS = new Set([
  "skills",
  "commands",
  "hooks",
  "agents",
  "assets",
  "docs",
  "documentation",
  "scripts",
]);
export const LOCAL_PLUGIN_MANIFEST_NESTED_PATH_FIELDS = new Set([
  "path",
  "file",
  "dir",
  "directory",
  "source",
]);
export const TARGET_PLUGIN_MARKER_PATHS: Record<string, string> = {
  codex: CODEX_PLUGIN_MANIFEST_FILE,
  "claude-code": ".claude-plugin/plugin.json",
  cursor: ".cursor-plugin/plugin.json",
  "gemini-cli": "gemini-extension.json",
  antigravity: "plugin.json",
  kiro: "POWER.md",
  "github-copilot": "plugin.json",
};
export const ADAPTER_MANIFEST_CAPABILITY_FIELDS: Array<{
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
  { outputKey: "hooks", sourceKeys: ["hooks"], fallbackPaths: ["hooks"] },
  { outputKey: "agents", sourceKeys: ["agents"], fallbackPaths: ["agents"] },
  { outputKey: "assets", sourceKeys: ["assets"], fallbackPaths: ["assets"] },
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

export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}>;

export interface CorePluginLibraryServiceOptions {
  fetchFn?: FetchLike;
  marketSources?: PluginMarketSource[];
  materializePackages?: boolean;
  materializePackageFn?: PackageMaterializer;
  materializeSourcePackageFn?: SourcePackageMaterializer;
  resolvePluginTargetPath?: PluginTargetPathResolver;
}

export type RawRecord = Record<string, unknown>;

export interface PluginMarketCacheFile {
  kind: "prompthub-plugin-market-cache";
  version: 1;
  updatedAt: string;
  entries: Record<string, PluginMarketPreviewCacheEntry>;
}

export interface PluginMarketPreviewCacheEntry {
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
  author?: PluginMarketPreview["author"];
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

export interface MaterializedPluginPackage {
  managedPath: string;
  localRepositoryPath: string;
  localPackagePath: string;
}

export interface MaterializedPluginSourcePackage {
  cleanupPath?: string;
  localRepositoryPath: string;
  sourcePath: string;
}

export interface NormalizedPluginSourceRequest {
  branch?: string;
  kind: PluginSourceKind;
  label?: string;
  packagePath?: string;
  sourceId: string;
  url: string;
}

export type PackageMaterializer = (
  entry: PluginMarketEntry,
  pluginId: string,
) => Promise<MaterializedPluginPackage>;

export type SourcePackageMaterializer = (
  request: NormalizedPluginSourceRequest,
) => Promise<MaterializedPluginSourcePackage>;

export type PluginTargetPathResolver = (
  targetId: string,
  plugin: PluginLibraryEntry,
) => string | undefined;

export interface GitHubRepositoryRef {
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

export function getManagedPluginsDir(): string {
  return path.join(getDataDir(), "plugins");
}

export function getPluginLibraryFilePath(): string {
  return path.join(getManagedPluginsDir(), PLUGIN_LIBRARY_FILE_NAME);
}

export function getLegacyPluginLibraryFilePath(): string {
  return path.join(getConfigDir(), LEGACY_PLUGIN_LIBRARY_FILE_NAME);
}

export function getPluginMarketCacheFilePath(): string {
  return getRuntimeStorageContext().localAuthority === "canonical-files"
    ? path.join(getCacheDir(), "plugin-market-cache.json")
    : path.join(getManagedPluginsDir(), PLUGIN_MARKET_CACHE_FILE_NAME);
}

export function getPluginVersionFilePath(): string {
  return path.join(getManagedPluginsDir(), PLUGIN_VERSION_FILE_NAME);
}

export function getLegacyPluginMarketCacheFilePath(): string {
  return path.join(getConfigDir(), LEGACY_PLUGIN_MARKET_CACHE_FILE_NAME);
}

export function emptyPluginInventory(): PluginInventorySummary {
  return Object.fromEntries(
    PLUGIN_INVENTORY_KEYS.map((key) => [key, 0]),
  ) as PluginInventorySummary;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function nowMs(): number {
  return Date.now();
}

export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  assertStorageMaintenanceAvailable(getUserDataPath());
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function createPluginId(
  sourceId: string | undefined,
  name: string,
): string {
  const normalizedSource = normalizeSlug(sourceId || "custom") || "custom";
  const normalizedName = normalizeSlug(name) || "plugin";
  return `${normalizedSource}:${normalizedName}`;
}

export function normalizeRelativePosixPath(value: string): string {
  if (value.includes("\0")) {
    throw new CorePluginError("INVALID_PATH", "Plugin 路径包含非法空字节");
  }
  const slashPath = value.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(slashPath)) {
    throw new CorePluginError("INVALID_PATH", `Plugin 路径不安全: ${value}`);
  }
  const normalized = path.posix.normalize(slashPath).replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new CorePluginError("INVALID_PATH", `Plugin 路径不安全: ${value}`);
  }
  return normalized;
}

export function ensureInsideDirectory(parent: string, child: string): void {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  if (
    resolvedChild !== resolvedParent &&
    !resolvedChild.startsWith(`${resolvedParent}${path.sep}`)
  ) {
    throw new CorePluginError("INVALID_PATH", `路径不在受控目录内: ${child}`);
  }
}

export function isRawRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function safePluginBrandColor(value: unknown): string | undefined {
  const color = safeString(value);
  return color && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(color)
    ? color
    : undefined;
}

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function hasExplicitUrlProtocol(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

export function safeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function safePluginUserTags(value: unknown): string[] {
  return Array.from(
    new Set(
      safeStringArray(value)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function safePluginUserNotes(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseJsonObject(content: string, label: string): RawRecord {
  const parsed = JSON.parse(content) as unknown;
  if (!isRawRecord(parsed)) {
    throw new CorePluginError("INVALID_JSON", `${label} 不是 JSON 对象`);
  }
  return parsed;
}

export function getPluginLocalPackagePath(plugin: PluginLibraryEntry): string {
  return (
    plugin.localPackagePath ||
    plugin.source.localPackagePath ||
    plugin.managedPath ||
    plugin.localRepositoryPath ||
    plugin.source.localRepositoryPath ||
    ""
  );
}

export function isGitTransportSourceKind(kind: PluginSourceKind): boolean {
  return kind === "git" || kind === "ssh" || kind === "http";
}

export function normalizeDistributedTargetIds(targetIds: string[]): string[] {
  return Array.from(
    new Set(
      targetIds
        .filter((targetId): targetId is string => typeof targetId === "string")
        .map((targetId) => targetId.trim())
        .filter(Boolean),
    ),
  );
}

export function getSourceFingerprintPayload(
  source: PluginPackageSource,
): RawRecord {
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
