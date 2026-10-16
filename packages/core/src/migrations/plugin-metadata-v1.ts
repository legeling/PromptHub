import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { DatabaseAdapter } from "@prompthub/db";
import type {
  PluginLibraryEntry,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import {
  collectPluginPackageFiles,
  readCanonicalPluginLibrary,
  readCanonicalPluginVersions,
  writeCanonicalPluginState,
} from "../canonical-plugin-library";
import { createPortablePluginResourceEntry } from "../plugin-resource-schema";
import {
  normalizeLibrary,
  normalizePluginVersionsFile,
} from "../plugin-library/normalization";
import {
  getPluginLibraryFilePath,
  getPluginVersionFilePath,
  parseJsonObject,
} from "../plugin-library/shared";
import { getRuntimeStorageContext, getUserDataPath } from "../runtime-paths";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";

const MIGRATION_NAME = "plugin-metadata-v1";

function readSource(file: string): string | null {
  assertStoragePathComponentsSafe(getUserDataPath(), file);
  if (!fs.existsSync(file)) return null;
  if (!fs.lstatSync(file).isFile())
    throw new Error("Historical Plugin metadata path is unsafe");
  return fs.readFileSync(file, "utf8");
}

export function readLibrary(content: string | null): PluginLibraryEntry[] {
  if (content === null) return [];
  const raw = parseJsonObject(content, "Historical Plugin library");
  if (
    !Array.isArray(raw.plugins) ||
    (raw.version !== undefined && raw.version !== 1)
  )
    throw new Error("Invalid historical Plugin library");
  const normalized = normalizeLibrary(raw).plugins;
  if (normalized.length !== raw.plugins.length)
    throw new Error("Invalid historical Plugin library entries");
  return normalized;
}

export function readVersions(content: string | null): PluginVersion[] {
  if (content === null) return [];
  const raw = parseJsonObject(content, "Historical Plugin versions");
  if (
    !Array.isArray(raw.versions) ||
    (raw.version !== undefined && raw.version !== 1)
  )
    throw new Error("Invalid historical Plugin versions");
  const normalized = normalizePluginVersionsFile(raw).versions;
  if (normalized.length !== raw.versions.length)
    throw new Error("Invalid historical Plugin versions entries");
  return normalized;
}

function comparablePlugin(plugin: PluginLibraryEntry): unknown {
  // Bundle readers remap local package paths; compare durable metadata separately
  // from file bytes and device deployment targets.
  return JSON.parse(
    JSON.stringify({
      plugin: createPortablePluginResourceEntry(plugin),
      targets: [...(plugin.distributedTargetIds ?? [])].sort(),
    }),
  );
}

function packageDirectory(plugin: PluginLibraryEntry): string | undefined {
  const directory = plugin.localPackagePath ?? plugin.source.localPackagePath;
  if (directory && !fs.existsSync(directory))
    throw new Error(`Plugin migration package is missing: ${plugin.id}`);
  return directory;
}

function packageDigest(plugin: PluginLibraryEntry): unknown {
  const directory = packageDirectory(plugin);
  if (!directory) return [];
  return collectPluginPackageFiles(directory).map((file) => ({
    path: file.path,
    hash: crypto
      .createHash("sha256")
      .update(fs.readFileSync(file.sourcePath))
      .digest("hex"),
  }));
}

export function mergePlugins(
  current: PluginLibraryEntry[],
  historical: PluginLibraryEntry[],
): PluginLibraryEntry[] {
  const merged = new Map(current.map((plugin) => [plugin.id, plugin]));
  const seen = new Set<string>();
  for (const plugin of historical) {
    if (seen.has(plugin.id))
      throw new Error(`Duplicate historical Plugin id: ${plugin.id}`);
    seen.add(plugin.id);
    const existing = merged.get(plugin.id);
    if (existing) {
      if (
        !isDeepStrictEqual(comparablePlugin(existing), comparablePlugin(plugin))
      )
        throw new Error(`Plugin metadata conflict: ${plugin.id}`);
      const currentDigest = packageDigest(existing);
      const historicalPath =
        plugin.localPackagePath ?? plugin.source.localPackagePath;
      // Canonical adoption can leave identical metadata with an obsolete path.
      // Retain the verified current record, including metadata-only records.
      if (historicalPath && !fs.existsSync(historicalPath)) continue;
      if (!isDeepStrictEqual(currentDigest, packageDigest(plugin)))
        throw new Error(`Plugin package conflict: ${plugin.id}`);
    } else {
      packageDirectory(plugin);
      merged.set(plugin.id, plugin);
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function comparableVersion(version: PluginVersion): unknown {
  return JSON.parse(
    JSON.stringify({
      ...version,
      plugin: createPortablePluginResourceEntry(version.plugin),
    }),
  );
}

export function mergeVersions(
  current: PluginVersion[],
  historical: PluginVersion[],
  plugins: PluginLibraryEntry[],
): PluginVersion[] {
  const known = new Set(plugins.map((plugin) => plugin.id));
  const merged = new Map(current.map((version) => [version.id, version]));
  const positions = new Map(
    current.map((version) => [
      JSON.stringify([version.pluginId, version.version]),
      version.id,
    ]),
  );
  for (const version of historical) {
    if (!known.has(version.pluginId))
      throw new Error(
        `Historical Plugin version has no Plugin: ${version.pluginId}`,
      );
    const existing = merged.get(version.id);
    const position = JSON.stringify([version.pluginId, version.version]);
    if (
      (existing &&
        !isDeepStrictEqual(
          comparableVersion(existing),
          comparableVersion(version),
        )) ||
      (positions.has(position) && positions.get(position) !== version.id)
    )
      throw new Error(
        `Plugin version conflict: ${version.pluginId}/${version.version}`,
      );
    merged.set(version.id, existing ?? version);
    positions.set(position, version.id);
  }
  return [...merged.values()].sort(
    (a, b) => a.pluginId.localeCompare(b.pluginId) || a.version - b.version,
  );
}

function preserveSource(library: string | null, versions: string | null): void {
  const content = JSON.stringify({ version: 1, library, versions });
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const file = path.join(
    getUserDataPath(),
    "recovery",
    MIGRATION_NAME,
    `${hash}.json`,
  );
  assertStoragePathComponentsSafe(getUserDataPath(), file);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, "utf8") !== content)
      throw new Error("Plugin metadata recovery backup mismatch");
    return;
  }
  const stage = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(stage, "wx", 0o600);
    try {
      fs.writeFileSync(descriptor, content);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(stage, file);
  } finally {
    fs.rmSync(stage, { force: true });
  }
}

/** Upgrade boundary only. A restored historical file is input even after an earlier upgrade. */
export function migratePluginMetadataV1(
  database: DatabaseAdapter.Database,
  options: { injectPublicationFailure?: (targetPath: string) => void } = {},
): void {
  if (getRuntimeStorageContext().localAuthority !== "canonical-files") return;
  const libraryPath = getPluginLibraryFilePath();
  const versionsPath = getPluginVersionFilePath();
  const librarySource = readSource(libraryPath);
  const versionsSource = readSource(versionsPath);
  if (librarySource === null && versionsSource === null) return;
  const current = normalizeLibrary(readCanonicalPluginLibrary());
  const plugins = mergePlugins(current.plugins, readLibrary(librarySource));
  const versions = mergeVersions(
    readCanonicalPluginVersions().versions,
    readVersions(versionsSource),
    plugins,
  );
  preserveSource(librarySource, versionsSource);
  writeCanonicalPluginState({
    library: { ...current, plugins },
    versions: {
      kind: "prompthub-plugin-versions",
      version: 1,
      updatedAt: current.updatedAt,
      versions,
    },
    retireMetadataPaths: [libraryPath, versionsPath].filter((file) =>
      fs.existsSync(file),
    ),
    injectPublicationFailure: options.injectPublicationFailure,
  });
  // Publication has its own durable journal. If recording completion fails, the
  // verified bundles remain usable and startup has no retired input to replay.
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  database
    .prepare(
      "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
    )
    .run(MIGRATION_NAME, Date.now());
}
