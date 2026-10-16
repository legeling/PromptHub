import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  PLUGIN_SCHEMA,
  createDatabaseSafetyPoint,
  type DatabaseAdapter,
} from "@prompthub/db";
import type {
  PluginLibraryEntry,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import { PluginStorage } from "../plugin-storage";
import {
  readPluginResourceBundle,
  parsePluginDeviceProjectionDocument,
} from "../plugin-resource-schema";
import {
  assertStoragePathComponentsSafe,
  resolveRuntimeStorageContext,
} from "../runtime-storage-context";
import { localResourceDeviceIdFromRootIdentity } from "../storage-root-identity";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import {
  readLibrary,
  readVersions,
  mergePlugins,
  mergeVersions,
} from "./plugin-metadata-v1";

const MIGRATION_NAME = "plugin-sqlite-v1";
interface HistoricalPlugins {
  plugins: PluginLibraryEntry[];
  versions: PluginVersion[];
  sources: string[];
}

function readText(
  root: string,
  file: string,
  sources: string[],
): string | null {
  assertStoragePathComponentsSafe(root, file);
  if (!fs.existsSync(file)) return null;
  if (!fs.lstatSync(file).isFile())
    throw new Error("Historical Plugin metadata is not a file");
  sources.push(file);
  return fs.readFileSync(file, "utf8");
}

function historical(root: string): HistoricalPlugins {
  const context = resolveRuntimeStorageContext(root),
    directory = path.join(context.dataPath, "plugins"),
    sources: string[] = [];
  let plugins: PluginLibraryEntry[] = [],
    versions: PluginVersion[] = [];
  assertStoragePathComponentsSafe(root, directory);
  if (fs.existsSync(directory))
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("Historical Plugin source is unsafe");
      if (
        !entry.isDirectory() ||
        !fs.existsSync(path.join(source, "manifest.json"))
      )
        continue;
      const resource = readPluginResourceBundle(source);
      plugins.push(resource.plugin);
      versions.push(...resource.versions);
      sources.push(source);
    }
  const projection = readText(
    root,
    path.join(context.configPath, "devices/plugin-projections.json"),
    sources,
  );
  if (projection !== null) {
    const parsed = parsePluginDeviceProjectionDocument(projection, {
      expectedDeviceId: localResourceDeviceIdFromRootIdentity(
        context.rootIdentity,
      ),
      knownPluginIds: new Set(plugins.map((plugin) => plugin.id)),
    });
    plugins = plugins.map((plugin) => ({
      ...plugin,
      distributedTargetIds: parsed.targets[plugin.id] ?? [],
      source: {
        ...plugin.source,
        ...(parsed.sources[plugin.id]
          ? { url: parsed.sources[plugin.id] }
          : {}),
      },
    }));
  }
  plugins = mergePlugins([], plugins);
  versions = mergeVersions([], versions, plugins);
  for (const file of [
    path.join(directory, "library.json"),
    path.join(context.configPath, "plugin-library.json"),
  ])
    plugins = mergePlugins(plugins, readLibrary(readText(root, file, sources)));
  versions = mergeVersions(
    versions,
    readVersions(
      readText(root, path.join(directory, "versions.json"), sources),
    ),
    plugins,
  );
  for (const plugin of plugins) {
    const candidate = plugin.localPackagePath ?? plugin.source.localPackagePath;
    if (!candidate) continue;
    const relative = path.relative(directory, candidate);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      const managed = path.join(directory, relative.split(path.sep)[0]);
      if (fs.lstatSync(managed).isDirectory()) sources.push(managed);
    }
  }
  return { plugins, versions, sources: [...new Set(sources)] };
}

function sourceDigest(sources: string[]): string {
  const hash = crypto.createHash("sha256");
  for (const source of sources) {
    const pending = [source];
    while (pending.length) {
      const file = pending.pop()!,
        stat = fs.lstatSync(file);
      if (stat.isSymbolicLink())
        throw new Error("Historical Plugin recovery source is unsafe");
      hash.update(path.relative(source, file));
      if (stat.isDirectory())
        pending.push(
          ...fs
            .readdirSync(file)
            .sort()
            .map((entry) => path.join(file, entry)),
        );
      else if (stat.isFile()) hash.update(fs.readFileSync(file));
      else
        throw new Error(
          "Historical Plugin recovery source is not a regular file",
        );
    }
  }
  return hash.digest("hex");
}

export function migratePluginSqliteV1(
  database: DatabaseAdapter.Database,
  options: {
    rootPath: string;
    databasePath: string;
    injectFailure?: (target: string) => void;
  },
): void {
  const root = path.resolve(options.rootPath);
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const input = historical(root);
  const completed = database.get(
    "SELECT name FROM schema_migrations WHERE name = ?",
    MIGRATION_NAME,
  );
  if (completed) {
    if (input.sources.length)
      throw new Error("Retired Plugin sources require explicit recovery");
    return;
  }
  if (input.sources.length)
    createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  database.transaction(() => database.exec(PLUGIN_SCHEMA))();
  const storage = new PluginStorage(database, root);
  const plugins = mergePlugins(storage.read(), input.plugins);
  const versions = mergeVersions(
    storage.readVersions(),
    input.versions,
    plugins,
  );
  const prepared = storage.preparePublication(plugins, versions);
  const entries: CanonicalEntryMutation[] = [...prepared.entries];
  const recovery = path.join(
    root,
    "recovery",
    MIGRATION_NAME,
    sourceDigest(input.sources),
  );
  for (const [index, source] of input.sources.entries()) {
    const targetPath = path.join(
      recovery,
      String(index),
      path.basename(source),
    );
    assertStoragePathComponentsSafe(root, targetPath);
    entries.push({
      targetPath,
      prepare(stage) {
        fs.cpSync(source, stage, {
          recursive: true,
          force: false,
          errorOnExist: true,
          dereference: false,
        });
      },
    });
    entries.push({ targetPath: source, delete: true });
  }
  publishSqliteEntries(database, {
    rootPath: root,
    operationKey: MIGRATION_NAME,
    entries,
    injectFailure: options.injectFailure,
    commit() {
      prepared.commit();
      database.run(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        MIGRATION_NAME,
        Date.now(),
      );
    },
  });
}
