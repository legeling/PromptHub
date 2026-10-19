import {
  withDirectoryRollback,
  withDirectoryOperationLock,
} from "../directory-transaction";
import { assertPluginTargetWritable } from "../plugin-target-publication";
import { assertSharedPluginOwnership } from "../plugin-shared-distribution";
import fs from "fs";
import { withPluginArchive, fetchPluginArchive } from "./archive-package";
import path from "path";

import type {
  PluginDeleteOptions,
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
  PluginMarketPreview,
  PluginMarketSource,
  PluginMetadataUpdate,
  PluginPackageHealthCheck,
  PluginPackageSource,
  PluginSemanticClassification,
  PluginSourceUpdateCheck,
  PluginSourceUpdateResult,
  PluginTargetCompatibility,
  PluginUndistributeRequest,
  PluginUndistributeResult,
  PluginVersion,
  PluginVersionFile,
  PluginVersionRollbackResult,
} from "@prompthub/shared/types/plugin";

import {
  CorePluginError,
  type CorePluginLibraryServiceOptions,
  type FetchLike,
  type MaterializedPluginPackage,
  type MaterializedPluginSourcePackage,
  type NormalizedPluginSourceRequest,
  type PackageMaterializer,
  type PluginMarketCacheFile,
  type PluginTargetPathResolver,
  type RawRecord,
  type SourcePackageMaterializer,
  type GitHubRepositoryRef,
  createPluginId,
  getManagedPluginsDir,
  getPluginLocalPackagePath,
  isGitTransportSourceKind,
  normalizeRelativePosixPath,
  normalizeDistributedTargetIds,
  nowIso,
  nowMs,
  parseJsonObject,
  safePluginBrandColor,
  safeString,
  safeStringArray,
} from "./shared";
import {
  BUILTIN_PLUGIN_MARKET_SOURCES,
  applyPreviewCacheToEntry,
  buildGitHubTreeUrl,
  buildRawPluginFileUrl,
  extractPluginInventoryFromManifest,
  extractGitHubTreePaths,
  getMarketplaceDisplayName,
  isSkillFileUnderDirectory,
  looksLikeDirectoryManifestPath,
  manifestFieldStrings,
  normalizeMarketEntry,
  parseGitHubRepositoryRef,
  readLocalPromptHubMarketplace,
  resolveManifestAssetUrl,
} from "./marketplace";
import {
  assertBundlePlugin,
  classifyPluginInventory,
  getPluginSemanticUnsupportedReason,
  normalizeAuthor,
} from "./normalization";
import {
  checkInstalledPluginPackage,
  extractLocalPluginInventory,
  findLocalPluginMarkers,
  getLocalPluginNativeTargetIds,
  inspectLocalPluginNativeTargets,
  readLocalPluginManifest,
  validateLocalPluginPackage,
} from "./package-validation";
import { isAntigravityPluginManifest } from "@prompthub/shared/utils/antigravity-plugin";
import {
  buildUpdatedPluginFromPreview,
  computePluginEntryManifestFingerprint,
  computePluginPackageFingerprint,
  computePluginPreviewFingerprint,
  copyPluginPackageToManagedPath,
  getPluginUpdateStatus,
  materializeGitPackage,
  materializeGitSourcePackage,
  normalizePluginSourceImportRequest,
} from "./package-materialization";
import {
  assertReadableDirectory,
  deleteDistributedPluginTargets,
  distributePlugin,
  getPluginTargetMatrix,
  removePluginDistribution,
} from "./distribution";
import { PluginLibraryStorage } from "./storage";
import { PluginMarketplaceClient } from "./marketplace-client";
import {
  attachMarketSourcePackageHash,
  getPluginPackageUpdateSignals,
} from "./source-reconciliation";

interface InstalledPluginOptions {
  id: string;
  invalidNativeTargetIds?: string[];
  materialized?: MaterializedPluginPackage;
  nativeTargetIds?: string[];
  preview: PluginMarketPreview;
  repository?: string;
  source: PluginPackageSource;
  trustLevel: PluginLibraryEntry["trustLevel"];
}

interface ScannedLocalPlugin {
  classification: PluginSemanticClassification;
  inventory: PluginInventorySummary;
  invalidNativeTargetIds: string[];
  manifest: RawRecord;
  name: string;
  nativeTargetIds: string[];
  sourcePath: string;
}

function readCanonicalLocalPluginManifest(sourcePath: string): {
  manifest: RawRecord;
  markerPath: string;
} {
  const markerPaths = findLocalPluginMarkers(sourcePath);
  if (markerPaths.length === 0) {
    throw new CorePluginError(
      "MISSING_MANIFEST",
      `没有找到可识别的 Plugin manifest: ${sourcePath}`,
    );
  }
  let lastManifestError: unknown;
  for (const markerPath of markerPaths) {
    try {
      const { manifest } = readLocalPluginManifest(markerPath);
      validateLocalPluginPackage(sourcePath, manifest);
      return { manifest, markerPath };
    } catch (error) {
      lastManifestError = error;
    }
  }
  throw lastManifestError;
}

function scanLocalPluginPackage(
  request: PluginImportLocalRequest,
): ScannedLocalPlugin {
  const sourcePath = path.resolve(request.sourcePath);
  assertReadableDirectory(sourcePath, "Agent Plugin package");
  const { manifest, markerPath } = readCanonicalLocalPluginManifest(sourcePath);
  const inventory = extractLocalPluginInventory(
    sourcePath,
    manifest,
    markerPath,
  );
  const classification = classifyLocalPluginInventory(
    inventory,
    manifest,
    markerPath,
    sourcePath,
  );
  const name = safeString(manifest.name) ?? path.basename(sourcePath);
  assertBundlePlugin(classification, name);
  const nativeTargets = inspectLocalPluginNativeTargets(sourcePath);
  return {
    classification,
    inventory,
    manifest,
    name,
    ...nativeTargets,
    sourcePath,
  };
}

function classifyLocalPluginInventory(
  inventory: PluginInventorySummary,
  manifest: RawRecord,
  markerPath: string,
  packagePath: string,
): PluginSemanticClassification {
  // Native manifests define a Plugin package regardless of its component count.
  return markerPath ===
    path.join(packagePath, ".codex-plugin", "plugin.json") ||
    markerPath === path.join(packagePath, ".claude-plugin", "plugin.json") ||
    (markerPath === path.join(packagePath, "plugin.json") &&
      isAntigravityPluginManifest(manifest))
    ? "bundle"
    : classifyPluginInventory(inventory);
}

function buildInstalledPlugin(
  options: InstalledPluginOptions,
): PluginLibraryEntry {
  const { materialized, preview } = options;
  const timestamp = nowMs();
  const nativeTargets =
    options.nativeTargetIds !== undefined
      ? {
          invalidNativeTargetIds: options.invalidNativeTargetIds ?? [],
          nativeTargetIds: options.nativeTargetIds,
        }
      : materialized?.localPackagePath
        ? inspectLocalPluginNativeTargets(materialized.localPackagePath)
        : { invalidNativeTargetIds: [], nativeTargetIds: [] };
  return {
    id: options.id,
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
    trustLevel: options.trustLevel,
    inventory: materialized?.localPackagePath
      ? readInstalledPluginInventory(materialized.localPackagePath)
      : preview.inventory,
    classification: preview.classification,
    source: options.source,
    tags: preview.tags,
    homepage: preview.homepage,
    repository: options.repository ?? preview.repository,
    ...nativeTargets,
    distributedTargetIds: [],
    managedPath: materialized?.managedPath,
    localRepositoryPath: materialized?.localRepositoryPath,
    localPackagePath: materialized?.localPackagePath,
    installedManifestHash: computePluginPreviewFingerprint(preview),
    installedPackageHash: computePluginPackageFingerprint(
      materialized?.localPackagePath,
    ),
    installedAt: timestamp,
    updatedAt: timestamp,
  };
}

function readInstalledPluginInventory(
  packagePath: string,
): PluginInventorySummary {
  const { manifest, markerPath } =
    readCanonicalLocalPluginManifest(packagePath);
  return extractLocalPluginInventory(packagePath, manifest, markerPath);
}

function buildAndPersistInstalledPlugin(
  library: PluginLibraryFile,
  options: InstalledPluginOptions,
  warnings: string[],
  persist: (library: PluginLibraryFile) => PluginLibraryFile,
): PluginInstallResult {
  try {
    return persistInstalledPlugin(
      library,
      buildInstalledPlugin(options),
      warnings,
      persist,
    );
  } catch (error) {
    if (options.materialized?.managedPath) {
      fs.rmSync(options.materialized.managedPath, {
        recursive: true,
        force: true,
      });
    }
    throw error;
  }
}

function persistInstalledPlugin(
  library: PluginLibraryFile,
  plugin: PluginLibraryEntry,
  warnings: string[],
  persist: (library: PluginLibraryFile) => PluginLibraryFile,
): PluginInstallResult {
  const nextLibrary: PluginLibraryFile = {
    ...library,
    updatedAt: nowIso(),
    plugins: [...library.plugins, plugin],
  };
  try {
    const persistedLibrary = persist(nextLibrary);
    const persistedPlugin =
      persistedLibrary.plugins.find((entry) => entry.id === plugin.id) ??
      plugin;
    return { plugin: persistedPlugin, library: persistedLibrary, warnings };
  } catch (error) {
    if (plugin.managedPath) {
      fs.rmSync(plugin.managedPath, { recursive: true, force: true });
    }
    throw error;
  }
}

function assertPluginIsNew(
  library: PluginLibraryFile,
  displayName: string,
  matches: (plugin: PluginLibraryEntry) => boolean,
  action = "导入",
): void {
  if (library.plugins.some(matches)) {
    throw new CorePluginError(
      "DUPLICATE_PLUGIN",
      `Plugin 已${action}: ${displayName}`,
    );
  }
}

function getSkippedSourceUpdate(
  check: PluginSourceUpdateCheck,
  library: PluginLibraryFile,
  overwriteLocalChanges: boolean,
): PluginSourceUpdateResult | undefined {
  if (!check.plugin || !check.preview) {
    return { status: "not-installed", library, check };
  }
  if (check.status === "up-to-date") {
    return {
      status: "up-to-date",
      plugin: check.plugin,
      library,
      check,
    };
  }
  if (
    (check.status === "local-modified" || check.status === "conflict") &&
    !overwriteLocalChanges
  ) {
    return { status: check.status, library, check };
  }
  return undefined;
}

function persistSourceUpdate(
  library: PluginLibraryFile,
  previousPlugin: PluginLibraryEntry,
  plugin: PluginLibraryEntry,
  materialized: MaterializedPluginPackage | undefined,
  check: PluginSourceUpdateCheck,
  persist: (library: PluginLibraryFile) => PluginLibraryFile,
): PluginSourceUpdateResult {
  const nextLibrary: PluginLibraryFile = {
    ...library,
    updatedAt: nowIso(),
    plugins: library.plugins.map((entry) =>
      entry.id === plugin.id ? plugin : entry,
    ),
  };
  try {
    const persistedLibrary = persist(nextLibrary);
    const persistedPlugin =
      persistedLibrary.plugins.find((entry) => entry.id === plugin.id) ??
      plugin;
    return {
      status: "updated",
      plugin: persistedPlugin,
      library: persistedLibrary,
      check,
      warnings: check.preview?.warnings ?? [],
    };
  } catch (error) {
    if (
      materialized?.managedPath &&
      materialized.managedPath !== previousPlugin.managedPath
    ) {
      fs.rmSync(materialized.managedPath, { recursive: true, force: true });
    }
    throw error;
  }
}

function buildPackageSourceEntry(
  sourcePath: string,
  manifest: RawRecord,
  inventory: PluginInventorySummary,
  classification: PluginSemanticClassification,
  source: PluginPackageSource & { marketplaceId: string },
): PluginMarketEntry {
  const { marketplaceId, ...entrySource } = source;
  const interfaceRecord =
    manifest.interface && typeof manifest.interface === "object"
      ? (manifest.interface as RawRecord)
      : {};
  const name = safeString(manifest.name) ?? path.basename(sourcePath);
  const displayName =
    safeString(interfaceRecord.displayName) ||
    safeString(manifest.displayName) ||
    name;
  return {
    id: createPluginId(marketplaceId, name),
    marketplaceId,
    name,
    displayName,
    description:
      safeString(interfaceRecord.shortDescription) ||
      safeString(manifest.description) ||
      safeString(interfaceRecord.longDescription),
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
}

function buildPackageSourcePreview(
  sourcePath: string,
  manifest: RawRecord,
  inventory: PluginInventorySummary,
  classification: PluginSemanticClassification,
  source: PluginPackageSource & { marketplaceId: string },
): PluginMarketPreview {
  const entry = buildPackageSourceEntry(
    sourcePath,
    manifest,
    inventory,
    classification,
    source,
  );
  const interfaceRecord =
    manifest.interface && typeof manifest.interface === "object"
      ? (manifest.interface as RawRecord)
      : {};
  return {
    entry,
    displayName: entry.displayName,
    description: entry.description,
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
    sourcePackageHash: computePluginPackageFingerprint(sourcePath),
    canInstall: classification === "bundle",
    unsupportedReason: getPluginSemanticUnsupportedReason(classification),
    warnings: [],
  };
}

export class CorePluginLibraryService {
  private marketSources: PluginMarketSource[];
  private materializePackages: boolean;
  private materializePackageFn: PackageMaterializer;
  private materializeSourcePackageFn: SourcePackageMaterializer;
  private resolvePluginTargetPath?: PluginTargetPathResolver;
  private marketplace: PluginMarketplaceClient;
  private storage = new PluginLibraryStorage();

  constructor(options: CorePluginLibraryServiceOptions = {}) {
    this.marketSources = options.marketSources ?? BUILTIN_PLUGIN_MARKET_SOURCES;
    this.marketplace = new PluginMarketplaceClient({
      fetchFn: options.fetchFn,
      fetchArchiveFn: options.fetchArchiveFn,
      marketSources: this.marketSources,
      storage: this.storage,
    });
    this.materializePackages = options.materializePackages ?? false;
    this.materializePackageFn =
      options.materializePackageFn ??
      ((entry, id) =>
        entry.source.archive
          ? withPluginArchive(
              entry.source.archive,
              async (packagePath) =>
                copyPluginPackageToManagedPath(packagePath, id),
              options.fetchArchiveFn ?? fetchPluginArchive,
            )
          : materializeGitPackage(entry, id));
    this.materializeSourcePackageFn =
      options.materializeSourcePackageFn ?? materializeGitSourcePackage;
    this.resolvePluginTargetPath = options.resolvePluginTargetPath;
  }

  read(): PluginLibraryFile {
    const library = this.storage.read();
    return {
      ...library,
      plugins: library.plugins.map((plugin) => {
        const packagePath = getPluginLocalPackagePath(plugin);
        if (!packagePath || !fs.existsSync(packagePath)) return plugin;
        // Compatibility is derived from current markers; full package validation belongs to import/distribution.
        return {
          ...plugin,
          ...inspectLocalPluginNativeTargets(packagePath, false),
        };
      }),
    };
  }

  write(library: PluginLibraryFile): PluginLibraryFile {
    return this.storage.write(library);
  }

  readVersions(): PluginVersionFile {
    return this.storage.readVersions();
  }

  writeVersions(versionsFile: PluginVersionFile): PluginVersionFile {
    return this.storage.writeVersions(versionsFile);
  }

  getPluginVersions(pluginId: string): PluginVersion[] {
    return this.storage.getPluginVersions(pluginId);
  }

  createPluginVersion(pluginId: string, note?: string): PluginVersion {
    return this.storage.createPluginVersion(pluginId, note);
  }

  rollbackPluginVersion(
    pluginId: string,
    version: number,
  ): PluginVersionRollbackResult | null {
    return this.storage.rollbackPluginVersion(pluginId, version);
  }

  deletePluginVersion(pluginId: string, versionId: string): boolean {
    return this.storage.deletePluginVersion(pluginId, versionId);
  }

  exportSnapshot(): PluginLibrarySnapshot {
    return this.storage.exportSnapshot();
  }

  restoreSnapshot(snapshot: PluginLibrarySnapshot): PluginLibraryFile {
    return this.storage.restoreSnapshot(snapshot);
  }

  readMarketCache(): PluginMarketCacheFile {
    return this.storage.readMarketCache();
  }

  getMarketSources(sources?: PluginMarketSource[]): PluginMarketSource[] {
    return this.marketplace.getMarketSources(sources);
  }

  getTargetMatrix(): PluginTargetCompatibility[] {
    return getPluginTargetMatrix();
  }

  getMarketEntries(sources = this.marketSources): Promise<PluginMarketEntry[]> {
    return this.marketplace.getMarketEntries(sources);
  }

  previewMarketPlugin(
    entryId: string,
    sources = this.marketSources,
  ): Promise<PluginMarketPreview> {
    return this.marketplace.previewMarketPlugin(entryId, sources);
  }

  async installMarketPlugin(
    entryId: string,
    sources = this.marketSources,
  ): Promise<PluginInstallResult> {
    return this.marketplace.withMarketPreview(
      entryId,
      sources,
      async (preview, preparedPackagePath) => {
        assertBundlePlugin(preview.classification, preview.entry.displayName);
        const id = createPluginId(
          preview.entry.marketplaceId,
          preview.entry.name,
        );
        const library = this.read();
        assertPluginIsNew(
          library,
          preview.entry.displayName,
          (plugin) => plugin.id === id,
          "安装",
        );
        const materialized = this.materializePackages
          ? preparedPackagePath
            ? copyPluginPackageToManagedPath(preparedPackagePath, id)
            : await this.materializePackageFn(preview.entry, id)
          : undefined;
        const source: PluginPackageSource = {
          ...preview.entry.source,
          localRepositoryPath: materialized?.localRepositoryPath,
          localPackagePath: materialized?.localPackagePath,
        };
        return buildAndPersistInstalledPlugin(
          library,
          {
            id,
            materialized,
            preview,
            source,
            trustLevel: preview.entry.trustLevel,
          },
          preview.warnings,
          (next) => this.write(next),
        );
      },
    );
  }

  async importSourcePlugin(
    request: PluginImportSourceRequest,
  ): Promise<PluginInstallResult> {
    const sourceRequest = normalizePluginSourceImportRequest(request);
    const sourcePackage = await this.materializeSourcePackageFn(sourceRequest);
    try {
      const preview = this.buildPreviewForMaterializedSourcePackage(
        sourceRequest,
        sourcePackage,
      );
      assertBundlePlugin(preview.classification, preview.entry.name);
      const id = createPluginId(sourceRequest.sourceId, preview.entry.name);
      const library = this.read();
      assertPluginIsNew(
        library,
        preview.entry.name,
        (plugin) =>
          plugin.id === id ||
          (plugin.source.url === sourceRequest.url &&
            plugin.source.packagePath === sourceRequest.packagePath &&
            plugin.source.branch === sourceRequest.branch),
      );
      const nativeTargets = inspectLocalPluginNativeTargets(
        sourcePackage.sourcePath,
      );
      const materialized = copyPluginPackageToManagedPath(
        sourcePackage.sourcePath,
        id,
      );
      const source: PluginPackageSource = {
        ...preview.entry.source,
        localPackagePath: materialized.localPackagePath,
        localRepositoryPath: materialized.localRepositoryPath,
      };
      return buildAndPersistInstalledPlugin(
        library,
        {
          id,
          materialized,
          ...nativeTargets,
          preview,
          repository: preview.repository || sourceRequest.url,
          source,
          trustLevel: "custom",
        },
        preview.warnings,
        (next) => this.write(next),
      );
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
    const scanned = scanLocalPluginPackage(request);
    const sourceTargetId = request.sourceTargetId?.trim() || "agent";
    const id = createPluginId(`agent-${sourceTargetId}`, scanned.name);
    const library = this.read();
    assertPluginIsNew(
      library,
      scanned.name,
      (plugin) => plugin.id === id || plugin.source.url === scanned.sourcePath,
    );
    const preview = this.buildPreviewForLocalPackage(
      scanned.sourcePath,
      scanned.manifest,
      scanned.inventory,
      scanned.classification,
      sourceTargetId,
      request.sourceTargetName,
    );
    const materialized = copyPluginPackageToManagedPath(scanned.sourcePath, id);
    return buildAndPersistInstalledPlugin(
      library,
      {
        id,
        invalidNativeTargetIds: scanned.invalidNativeTargetIds,
        materialized,
        nativeTargetIds: scanned.nativeTargetIds,
        preview,
        source: {
          kind: "local",
          sourceId: sourceTargetId,
          label: request.sourceTargetName,
          localPackagePath: materialized.localPackagePath,
          localRepositoryPath: materialized.localRepositoryPath,
          url: scanned.sourcePath,
        },
        trustLevel: "custom",
      },
      [],
      (next) => this.write(next),
    );
  }

  checkInstalledPluginPackage(pluginId: string): PluginPackageHealthCheck {
    return checkInstalledPluginPackage(this.read(), pluginId);
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
    const remotePackageHash = preview.sourcePackageHash;
    const { localModified, remoteChanged } = getPluginPackageUpdateSignals({
      installedManifestHash,
      installedPackageHash: plugin.installedPackageHash,
      localPackageHash,
      remoteManifestHash,
      remotePackageHash,
    });
    const status = getPluginUpdateStatus(localModified, remoteChanged);

    return {
      status,
      plugin,
      preview,
      localPackageHash,
      installedPackageHash: plugin.installedPackageHash,
      remotePackageHash,
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
    const skipped = getSkippedSourceUpdate(
      check,
      library,
      options.overwriteLocalChanges === true,
    );
    if (skipped) {
      return skipped;
    }
    const plugin = check.plugin!;
    const preview = check.preview!;
    assertBundlePlugin(preview.classification, preview.displayName);
    this.createPluginVersion(
      plugin.id,
      `Source update: ${plugin.version || "unknown"} -> ${
        preview.version || "unknown"
      }`,
    );
    const materialized = await this.materializeUpdatedPluginPackage(
      plugin,
      preview,
    );
    const nextPlugin = buildUpdatedPluginFromPreview(
      plugin,
      preview,
      materialized,
      check.remoteManifestHash,
      nowMs(),
    );
    return persistSourceUpdate(
      library,
      plugin,
      nextPlugin,
      materialized,
      check,
      (next) => this.write(next),
    );
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
    const preview = await this.marketplace.buildPreviewForEntry(entry, sources);
    return attachMarketSourcePackageHash(
      preview,
      this.materializeSourcePackageFn,
    );
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
    const { manifest, markerPath } =
      readCanonicalLocalPluginManifest(sourcePath);
    const inventory = extractLocalPluginInventory(
      sourcePath,
      manifest,
      markerPath,
    );
    const classification = classifyLocalPluginInventory(
      inventory,
      manifest,
      markerPath,
      sourcePath,
    );
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
    const { manifest, markerPath } = readCanonicalLocalPluginManifest(
      sourcePackage.sourcePath,
    );
    const inventory = extractLocalPluginInventory(
      sourcePackage.sourcePath,
      manifest,
      markerPath,
    );
    const classification = classifyLocalPluginInventory(
      inventory,
      manifest,
      markerPath,
      sourcePackage.sourcePath,
    );
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
      const { manifest, markerPath } = readCanonicalLocalPluginManifest(
        sourcePackage.sourcePath,
      );
      const inventory = extractLocalPluginInventory(
        sourcePackage.sourcePath,
        manifest,
        markerPath,
      );
      const classification = classifyLocalPluginInventory(
        inventory,
        manifest,
        markerPath,
        sourcePackage.sourcePath,
      );
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
      getLocalPluginNativeTargetIds(plugin.source.url);
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
        getLocalPluginNativeTargetIds(sourcePackage.sourcePath);
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
    return buildPackageSourcePreview(
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
    return buildPackageSourcePreview(
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

  distributePlugin(request: PluginDistributeRequest): PluginDistributeResult {
    return distributePlugin(
      {
        readLibrary: () => this.read(),
        persistLibrary: (library) => this.write(library),
        resolveTargetPath: this.resolvePluginTargetPath,
      },
      request,
    );
  }

  async runDistributionTargetOperation<T>(
    pluginId: string,
    targetId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const plugin = this.read().plugins.find((entry) => entry.id === pluginId);
    if (!plugin)
      throw new CorePluginError(
        "NOT_FOUND",
        `Plugin does not exist: ${pluginId}`,
      );
    const target = this.resolvePluginTargetPath?.(targetId, plugin);
    if (!target)
      throw new CorePluginError(
        "MISSING_TARGET_PATH",
        `Cannot resolve Plugin target: ${targetId}`,
      );
    return withDirectoryOperationLock(
      process.platform === "win32" ? target.toLowerCase() : target,
      () => {
        if (targetId === "shared-agents")
          assertSharedPluginOwnership(target, plugin);
        assertPluginTargetWritable(
          getPluginLocalPackagePath(plugin),
          target,
          pluginId,
        );
        return withDirectoryRollback(target, operation);
      },
    );
  }

  preparePluginDistribution(
    request: PluginDistributeRequest,
  ): PluginDistributeResult {
    return distributePlugin(
      {
        readLibrary: () => this.read(),
        persistLibrary: (library) => this.write(library),
        resolveTargetPath: this.resolvePluginTargetPath,
      },
      request,
      false,
    );
  }

  completePluginDistribution(
    prepared: PluginDistributeResult,
  ): PluginDistributeResult {
    const library = this.read();
    const current = library.plugins.find(
      (plugin) => plugin.id === prepared.plugin.id,
    );
    if (!current)
      throw new CorePluginError(
        "NOT_FOUND",
        `Plugin does not exist: ${prepared.plugin.id}`,
      );
    const plugin = {
      ...current,
      distributedTargetIds: normalizeDistributedTargetIds([
        ...(current.distributedTargetIds ?? []),
        ...prepared.targets.map((target) => target.targetId),
      ]),
      updatedAt: nowMs(),
    };
    return {
      ...prepared,
      plugin,
      library: this.write({
        ...library,
        updatedAt: nowIso(),
        plugins: library.plugins.map((entry) =>
          entry.id === plugin.id ? plugin : entry,
        ),
      }),
    };
  }

  removePluginDistribution(
    request: PluginUndistributeRequest,
  ): PluginUndistributeResult {
    return removePluginDistribution(
      {
        readLibrary: () => this.read(),
        persistLibrary: (library) => this.write(library),
        resolveTargetPath: this.resolvePluginTargetPath,
      },
      request,
    );
  }

  updatePluginMetadata(
    pluginId: string,
    metadata: PluginMetadataUpdate,
  ): PluginLibraryFile {
    return this.storage.updatePluginMetadata(pluginId, metadata);
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
      deleteDistributedPluginTargets(
        deletedPlugin,
        this.resolvePluginTargetPath,
      );
    }
    const nextLibrary: PluginLibraryFile = {
      ...library,
      updatedAt: nowIso(),
      plugins: nextPlugins,
    };
    this.write(nextLibrary);
    if (deletedPlugin?.managedPath) {
      this.deleteManagedPluginPath(deletedPlugin.managedPath);
    }
    return nextLibrary;
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
}
