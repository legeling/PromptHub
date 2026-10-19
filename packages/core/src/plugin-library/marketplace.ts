import fs from "fs";
import path from "path";
import { normalizeMarketplaceSource } from "./marketplace-source";

import type {
  PluginInventorySummary,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginMarketSource,
} from "@prompthub/shared/types/plugin";

import {
  CorePluginError,
  type GitHubRepositoryRef,
  PLUGIN_MARKETPLACE_FILE,
  type PluginMarketPreviewCacheEntry,
  type RawRecord,
  createPluginId,
  emptyPluginInventory,
  hasExplicitUrlProtocol,
  isAbsoluteHttpUrl,
  normalizeRelativePosixPath,
  nowIso,
  safePluginBrandColor,
  safeString,
  safeStringArray,
} from "./shared";
import {
  classifyPluginInventory,
  normalizeAuthor,
  normalizeInventory,
  normalizeMarketPolicy,
} from "./normalization";

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

export function buildPreviewCacheEntry(
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

export function applyPreviewCacheToEntry(
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

export function manifestFieldStrings(value: unknown): string[] {
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

export function looksLikeDirectoryManifestPath(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized) {
    return false;
  }
  if (normalized.endsWith("/")) {
    return true;
  }
  return !path.posix.basename(normalized).includes(".");
}

export function parseGitHubRepositoryRef(
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

export function buildGitHubTreeUrl(ref: GitHubRepositoryRef): string {
  return `https://api.github.com/repos/${encodeURIComponent(
    ref.owner,
  )}/${encodeURIComponent(ref.repo)}/git/trees/${encodeURIComponent(
    ref.branch,
  )}?recursive=1`;
}

export function extractGitHubTreePaths(tree: RawRecord): string[] {
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

export function isSkillFileUnderDirectory(
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

function parseJsonObject(content: string, label: string): RawRecord {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CorePluginError("INVALID_JSON", `${label} 不是 JSON 对象`);
  }
  return parsed as RawRecord;
}

export function getMarketplaceDisplayName(
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

export function buildRawPluginFileUrl(
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

export function resolveManifestAssetUrl(
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

export function normalizeMarketEntry(
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
    source: normalizeMarketplaceSource(record, source, marketplaceDisplayName),
    policy: normalizeMarketPolicy(record.policy),
    codexDetailUrl: buildCodexPluginDetailUrl(name, source.id),
  };
}

export function readLocalPromptHubMarketplace(
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
