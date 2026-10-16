import fs from "node:fs";
import path from "node:path";
import { PluginDB, type DatabaseAdapter } from "@prompthub/db";
import type {
  PluginFileSnapshot,
  PluginLibraryEntry,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import { collectPluginPackageFiles } from "./canonical-plugin-library";
import {
  createPortablePluginResourceEntry,
  parsePluginResourceSnapshot,
} from "./plugin-resource-schema";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import {
  assertStoragePathComponentsSafe,
  resolveRuntimeStorageContext,
} from "./runtime-storage-context";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "./sqlite-entry-publication";
import type { CanonicalEntryMutation } from "./canonical-entry-publication";

const OPERATION_KEY = "plugin-storage";

export function pluginFilesPath(
  root: string,
  id: string,
  identityRoot = root,
): string {
  return path.join(
    resolveRuntimeStorageContext(root, { identityRoot }).dataPath,
    "plugin-files",
    encodeCanonicalResourceDirectory(id),
  );
}

function snapshotFiles(directory: string): PluginFileSnapshot[] {
  if (!fs.existsSync(directory))
    throw new Error("Stored Plugin package is missing");
  return collectPluginPackageFiles(directory).map((file) => {
    const bytes = fs.readFileSync(file.sourcePath);
    return {
      relativePath: file.path,
      contentBase64: bytes.toString("base64"),
      size: bytes.length,
    };
  });
}
function writeFiles(directory: string, files: PluginFileSnapshot[]): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const file of files) {
    const destination = path.join(directory, file.relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.writeFileSync(destination, Buffer.from(file.contentBase64, "base64"), {
      flag: "wx",
      mode: 0o600,
    });
  }
}

export class PluginStorage {
  private readonly repository: PluginDB;
  constructor(
    private readonly database: DatabaseAdapter.Database,
    private readonly root: string,
    private readonly identityRoot = root,
  ) {
    this.repository = new PluginDB(database);
    recoverSqliteEntryPublication(database, root, OPERATION_KEY);
  }

  read(): PluginLibraryEntry[] {
    return this.repository.list().map((plugin) => {
      createPortablePluginResourceEntry(plugin);
      return plugin;
    });
  }

  readVersions(): PluginVersion[] {
    return this.repository.versions().map(({ version, hasPackageSnapshot }) => {
      const files = hasPackageSnapshot
        ? snapshotFiles(
            path.join(
              pluginFilesPath(this.root, version.pluginId, this.identityRoot),
              "versions",
              String(version.version),
            ),
          )
        : [];
      const parsed = parsePluginResourceSnapshot({
        plugin: version.plugin,
        versions: [
          {
            ...version,
            ...(hasPackageSnapshot
              ? { packageSnapshot: { pluginId: version.pluginId, files } }
              : {}),
          },
        ],
        files: [],
      });
      return parsed.versions[0];
    });
  }

  capture(): ReturnType<typeof parsePluginResourceSnapshot>[] {
    const versions = new Map<string, PluginVersion[]>();
    for (const version of this.readVersions()) {
      const group = versions.get(version.pluginId) ?? [];
      group.push(version);
      versions.set(version.pluginId, group);
    }
    return this.read().map((plugin) =>
      parsePluginResourceSnapshot({
        plugin: createPortablePluginResourceEntry(plugin),
        versions: versions.get(plugin.id) ?? [],
        files: plugin.localPackagePath
          ? snapshotFiles(plugin.localPackagePath)
          : [],
      }),
    );
  }

  preparePublication(
    plugins: PluginLibraryEntry[],
    versions: PluginVersion[],
  ): { entries: CanonicalEntryMutation[]; commit: () => void } {
    const groups = new Map<string, PluginVersion[]>(),
      ids = new Set(plugins.map((plugin) => plugin.id));
    if (
      ids.size !== plugins.length ||
      new Set(versions.map((version) => version.id)).size !== versions.length
    )
      throw new Error("Duplicate Plugin identity");
    for (const version of versions) {
      if (!ids.has(version.pluginId))
        throw new Error("Plugin version owner is absent");
      const group = groups.get(version.pluginId) ?? [];
      group.push(version);
      groups.set(version.pluginId, group);
    }
    const snapshots = plugins.map((plugin) => {
      const candidate =
        plugin.localPackagePath ?? plugin.source.localPackagePath;
      if (candidate && !fs.existsSync(candidate))
        throw new Error(`Plugin package is missing: ${plugin.id}`);
      return parsePluginResourceSnapshot({
        plugin: createPortablePluginResourceEntry(plugin),
        versions: groups.get(plugin.id) ?? [],
        files: candidate ? snapshotFiles(candidate) : [],
      });
    });
    return this.prepareSnapshots(snapshots, plugins);
  }

  prepareSnapshots(
    snapshots: ReturnType<typeof parsePluginResourceSnapshot>[],
    localPlugins = this.read(),
  ): { entries: CanonicalEntryMutation[]; commit: () => void } {
    const parsed = snapshots.map(parsePluginResourceSnapshot),
      ids = new Set(parsed.map((entry) => entry.plugin.id));
    if (ids.size !== parsed.length)
      throw new Error("Duplicate Plugin identity");
    const versionIds = parsed.flatMap((snapshot) =>
      snapshot.versions.map((version) => version.id),
    );
    if (new Set(versionIds).size !== versionIds.length)
      throw new Error("Duplicate Plugin version identity");
    const local = new Map(localPlugins.map((plugin) => [plugin.id, plugin]));
    const entries: CanonicalEntryMutation[] = parsed.map((snapshot) => ({
      targetPath: pluginFilesPath(
        this.root,
        snapshot.plugin.id,
        this.identityRoot,
      ),
      prepare(stage) {
        fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
        if (snapshot.files.length)
          writeFiles(path.join(stage, "current"), snapshot.files);
        for (const version of snapshot.versions)
          if (version.packageSnapshot)
            writeFiles(
              path.join(stage, "versions", String(version.version)),
              version.packageSnapshot.files,
            );
      },
    }));
    for (const plugin of this.read())
      if (!ids.has(plugin.id))
        entries.push({
          targetPath: pluginFilesPath(this.root, plugin.id, this.identityRoot),
          delete: true,
        });
    for (const entry of entries)
      assertStoragePathComponentsSafe(this.root, entry.targetPath);
    const plugins = parsed.map(({ plugin, files }) => {
      const retained = local.get(plugin.id),
        packagePath = path.join(
          pluginFilesPath(this.root, plugin.id, this.identityRoot),
          "current",
        );
      return {
        ...plugin,
        ...(files.length
          ? {
              managedPath: pluginFilesPath(
                this.root,
                plugin.id,
                this.identityRoot,
              ),
              localPackagePath: packagePath,
            }
          : {}),
        ...(retained?.distributedTargetIds
          ? { distributedTargetIds: retained.distributedTargetIds }
          : {}),
        source: {
          ...plugin.source,
          ...(retained?.source.url ? { url: retained.source.url } : {}),
        },
      };
    });
    const histories = parsed.flatMap((snapshot) =>
      snapshot.versions.map(({ packageSnapshot, ...version }) => ({
        version,
        hasPackageSnapshot: packageSnapshot !== undefined,
      })),
    );
    return {
      entries,
      commit: () => this.repository.replace(plugins, histories),
    };
  }

  restoreSnapshots(
    snapshots: ReturnType<typeof parsePluginResourceSnapshot>[],
  ): void {
    publishSqliteEntries(this.database, {
      rootPath: this.root,
      operationKey: OPERATION_KEY,
      ...this.prepareSnapshots(snapshots),
    });
  }

  write(plugins: PluginLibraryEntry[], versions: PluginVersion[]): void {
    const prepared = this.preparePublication(plugins, versions);
    publishSqliteEntries(this.database, {
      rootPath: this.root,
      operationKey: OPERATION_KEY,
      ...prepared,
    });
  }
}
