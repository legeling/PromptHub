import * as crypto from "crypto";

import type {
  SkillSafetyFinding,
  SkillSafetyLevel,
  SkillSafetyReport,
} from "@prompthub/shared/types/skill";
import type {
  PluginAuthor,
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginMarketPolicy,
  PluginPackageSnapshot,
  PluginSemanticClassification,
  PluginTrustLevel,
  PluginVersion,
  PluginVersionFile,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";

import {
  type PluginMarketCacheFile,
  type PluginMarketPreviewCacheEntry,
  type RawRecord,
  CorePluginError,
  emptyPluginInventory,
  normalizeRelativePosixPath,
  normalizeSlug,
  nowIso,
  nowMs,
  safePluginBrandColor,
  safePluginUserNotes,
  safePluginUserTags,
  safeString,
  safeStringArray,
} from "./shared";

export function defaultLibrary(): PluginLibraryFile {
  return {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: nowIso(),
    plugins: [],
  };
}

export function defaultMarketCache(): PluginMarketCacheFile {
  return {
    kind: "prompthub-plugin-market-cache",
    version: 1,
    updatedAt: nowIso(),
    entries: {},
  };
}

export function defaultPluginVersions(): PluginVersionFile {
  return {
    kind: "prompthub-plugin-versions",
    version: 1,
    updatedAt: nowIso(),
    versions: [],
  };
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

function normalizeSafetyReportHeader(
  record: RawRecord,
):
  | Pick<
      SkillSafetyReport,
      | "checkedFileCount"
      | "level"
      | "recommendedAction"
      | "scannedAt"
      | "summary"
    >
  | undefined {
  const level = record.level as SkillSafetyLevel;
  const summary = safeString(record.summary);
  const recommendedAction = record.recommendedAction;
  const scannedAt = record.scannedAt;
  const checkedFileCount = record.checkedFileCount;
  const validLevel = ["safe", "warn", "high-risk", "blocked"].includes(level);
  const validAction = ["allow", "review", "block"].includes(
    recommendedAction as string,
  );
  if (
    !validLevel ||
    !summary ||
    !validAction ||
    typeof scannedAt !== "number" ||
    !Number.isFinite(scannedAt) ||
    typeof checkedFileCount !== "number" ||
    !Number.isFinite(checkedFileCount) ||
    checkedFileCount < 0 ||
    record.scanMethod !== "ai"
  ) {
    return undefined;
  }
  return {
    level,
    summary,
    recommendedAction:
      recommendedAction as SkillSafetyReport["recommendedAction"],
    scannedAt,
    checkedFileCount,
  };
}

export function normalizePluginSafetyReport(
  value: unknown,
): SkillSafetyReport | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as RawRecord;
  const header = normalizeSafetyReportHeader(record);
  if (!header) {
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
    ...header,
    findings,
    scanMethod: "ai",
    score,
  };
}

function normalizeMarketCacheEntry(
  id: string,
  value: unknown,
): PluginMarketPreviewCacheEntry | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Partial<PluginMarketPreviewCacheEntry>;
  const marketplaceId = safeString(record.marketplaceId);
  const name = safeString(record.name);
  const displayName = safeString(record.displayName);
  if (!marketplaceId || !name || !displayName) {
    return undefined;
  }
  return {
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

function normalizeTrustLevel(value: unknown): PluginTrustLevel {
  return value === "verified" || value === "community" || value === "custom"
    ? value
    : "official";
}

export function normalizeAuthor(value: unknown): PluginAuthor | undefined {
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

export function normalizeMarketPolicy(
  value: unknown,
): PluginMarketPolicy | undefined {
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

export function normalizeInventory(raw: unknown): PluginInventorySummary {
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

export function normalizeMarketCache(
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
    const entry = normalizeMarketCacheEntry(id, value);
    if (entry) cache.entries[id] = entry;
  }
  return {
    ...cache,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
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

export function assertBundlePlugin(
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

export function getPluginSemanticUnsupportedReason(
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

function isPluginLibraryEntry(plugin: unknown): plugin is PluginLibraryEntry {
  return Boolean(
    plugin &&
    typeof plugin === "object" &&
    typeof (plugin as PluginLibraryEntry).id === "string" &&
    typeof (plugin as PluginLibraryEntry).name === "string",
  );
}

function normalizeLibrarySource(
  plugin: PluginLibraryEntry,
): PluginLibraryEntry["source"] {
  return {
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
    revision: safeString(plugin.source?.revision),
    archive: plugin.source?.archive,
  };
}

function normalizeLibraryEntry(plugin: PluginLibraryEntry): PluginLibraryEntry {
  return {
    id: plugin.id,
    name: plugin.name,
    displayName: plugin.displayName || plugin.name,
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
    source: normalizeLibrarySource(plugin),
    isFavorite: plugin.isFavorite === true,
    tags: safeStringArray(plugin.tags),
    userTags: safePluginUserTags(plugin.userTags),
    userNotes: safePluginUserNotes(plugin.userNotes),
    safetyReport: normalizePluginSafetyReport(plugin.safetyReport),
    homepage: plugin.homepage,
    repository: plugin.repository,
    nativeTargetIds: safeStringArray(plugin.nativeTargetIds),
    invalidNativeTargetIds: safeStringArray(plugin.invalidNativeTargetIds),
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
      typeof plugin.installedAt === "number" ? plugin.installedAt : nowMs(),
    updatedAt:
      typeof plugin.updatedAt === "number" ? plugin.updatedAt : nowMs(),
  };
}

export function normalizeLibrary(
  raw: Partial<PluginLibraryFile>,
): PluginLibraryFile {
  return {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
    plugins: Array.isArray(raw.plugins)
      ? raw.plugins.filter(isPluginLibraryEntry).map(normalizeLibraryEntry)
      : [],
  };
}

export function normalizePluginPackageSnapshot(
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

export function normalizePluginVersionsFile(
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

export function sortPluginVersions(versions: PluginVersion[]): PluginVersion[] {
  return [...versions].sort((left, right) => {
    if (right.version !== left.version) {
      return right.version - left.version;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export function getNextPluginVersionNumber(
  versions: PluginVersion[],
  pluginId: string,
): number {
  const latest = versions
    .filter((version) => version.pluginId === pluginId)
    .reduce((max, version) => Math.max(max, version.version), 0);
  return latest + 1;
}

export function createPluginVersionId(
  pluginId: string,
  version: number,
): string {
  const random =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  return `${normalizeSlug(pluginId) || "plugin"}-v${version}-${random}`;
}
