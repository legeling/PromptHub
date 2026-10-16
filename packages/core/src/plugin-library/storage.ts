import fs from "fs";

import type {
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginLibrarySnapshot,
  PluginMarketPreview,
  PluginMetadataUpdate,
  PluginVersion,
  PluginVersionFile,
  PluginVersionRollbackResult,
} from "@prompthub/shared/types/plugin";

import {
  CorePluginError,
  type PluginMarketCacheFile,
  getLegacyPluginMarketCacheFilePath,
  getPluginMarketCacheFilePath,
  nowIso,
  nowMs,
  parseJsonObject,
  safePluginUserNotes,
  safePluginUserTags,
  safeString,
  writeJsonFileAtomic,
} from "./shared";
import {
  createPluginVersionId,
  defaultLibrary,
  defaultMarketCache,
  defaultPluginVersions,
  getNextPluginVersionNumber,
  normalizeLibrary,
  normalizeMarketCache,
  normalizePluginSafetyReport,
  normalizePluginVersionsFile,
  sortPluginVersions,
} from "./normalization";
import { buildPreviewCacheEntry } from "./marketplace";
import {
  readPluginPackageSnapshot,
  removePluginMaterialization,
  remapRestoredPluginPackage,
  writePluginPackageSnapshot,
} from "./package-materialization";
import { getUserDataPath } from "../runtime-paths";
import { getDatabase } from "@prompthub/db";
import { PluginStorage } from "../plugin-storage";

export class PluginLibraryStorage {
  private owner(): PluginStorage {
    return new PluginStorage(getDatabase(), getUserDataPath());
  }

  read(): PluginLibraryFile {
    const plugins = this.owner().read();
    return { ...defaultLibrary(), plugins,
      updatedAt: new Date(Math.max(0, ...plugins.map((plugin) => plugin.updatedAt))).toISOString() };
  }

  write(library: PluginLibraryFile): PluginLibraryFile {
    const next = normalizeLibrary(library), ids = new Set(next.plugins.map((plugin) => plugin.id));
    this.owner().write(next.plugins, this.readVersions().versions.filter((version) => ids.has(version.pluginId)));
    const restored = this.read();
    const paths = new Map(restored.plugins.map((plugin) => [plugin.id, plugin.managedPath]));
    for (const plugin of next.plugins)
      if (paths.get(plugin.id) !== plugin.managedPath) removePluginMaterialization(plugin.managedPath);
    return restored;
  }

  readVersions(): PluginVersionFile {
    const versions = this.owner().readVersions();
    return { ...defaultPluginVersions(), versions,
      updatedAt: versions.map((version) => version.createdAt).sort().at(-1) ?? new Date(0).toISOString() };
  }

  writeVersions(versionsFile: PluginVersionFile): PluginVersionFile {
    const next = normalizePluginVersionsFile(versionsFile);
    this.owner().write(this.read().plugins, next.versions);
    return this.readVersions();
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
    const persisted = this.writeVersions({
      ...versionsFile,
      versions: [...versionsFile.versions, version],
    }).versions.find((entry) => entry.id === version.id);
    if (!persisted)
      throw new Error("Created Plugin version is missing from storage");
    return persisted;
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

    const restoredVersion = this.getPluginVersions(normalizedPluginId).find(
      (item) => item.version === version,
    );
    if (
      !restoredVersion ||
      !this.read().plugins.some((entry) => entry.id === normalizedPluginId)
    ) {
      return null;
    }
    return this.persistPluginRollback(
      normalizedPluginId,
      version,
      restoredVersion,
    );
  }

  private persistPluginRollback(
    pluginId: string,
    version: number,
    restoredVersion: PluginVersion,
  ): PluginVersionRollbackResult {
    const safetyVersion = this.createPluginVersion(
      pluginId,
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
        plugin.id === pluginId ? restoredPlugin : plugin,
      ),
    };
    const published = this.write(nextLibrary);
    const plugin = published.plugins.find((entry) => entry.id === pluginId);
    if (!plugin) throw new Error("Published Plugin rollback is missing its Plugin");
    return {
      plugin,
      library: published,
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

  writeMarketPreviewCache(preview: PluginMarketPreview): void {
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
    return this.write(nextLibrary);
  }
}
