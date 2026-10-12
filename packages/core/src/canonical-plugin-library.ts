import fs from "node:fs";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import path from "node:path";

import type {
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginVersion,
  PluginVersionFile,
} from "@prompthub/shared/types/plugin";

import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
  type CanonicalEntryMutation,
} from "./canonical-entry-publication";
import {
  createPluginDeviceProjectionDocument,
  createPortablePluginResourceEntry,
  materializePluginResourceBundle,
  parsePluginDeviceProjectionDocument,
  readPluginResourceBundle,
  type PluginPackagePayloadSource,
  type PluginDeviceProjectionDocument,
  type ReadPluginResourceResult,
} from "./plugin-resource-schema";
import {
  PLUGIN_LIBRARY_FILE_NAME,
  PLUGIN_MARKET_CACHE_FILE_NAME,
  PLUGIN_VERSION_FILE_NAME,
} from "./plugin-library/shared";
import {
  getConfigDir,
  getDataDir,
  getRuntimeStorageContext,
  getUserDataPath,
} from "./runtime-paths";
import { localResourceDeviceIdFromRootIdentity } from "./storage-root-identity";

const OPERATION_KEY = "plugin-library";
const MAX_RESOURCES = 10_000;
const MAX_PACKAGE_FILES = 2_000;
const MAX_PACKAGE_FILE_BYTES = 5 * 1024 * 1024;
const SUPERSEDED_METADATA_FILE_NAMES = new Set([
  PLUGIN_LIBRARY_FILE_NAME,
  PLUGIN_MARKET_CACHE_FILE_NAME,
  PLUGIN_VERSION_FILE_NAME,
]);
const IGNORED_ROOTS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "__pycache__",
  ".cache",
]);

interface LoadedPlugin {
  bundlePath: string;
  resource: ReadPluginResourceResult;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function portableVersions(versions: readonly PluginVersion[]): PluginVersion[] {
  return versions.map((version) => ({
    ...version,
    plugin: createPortablePluginResourceEntry(version.plugin),
  }));
}

function rootPath(): string {
  return path.join(getDataDir(), "plugins");
}

function projectionPath(): string {
  return path.join(getConfigDir(), "devices", "plugin-projections.json");
}

function assertId(value: string, label: string): void {
  if (
    !value ||
    Buffer.byteLength(value, "utf8") > 256 ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  ) {
    throw new Error(`Canonical Plugin ${label} is invalid`);
  }
}

function isSupersededPluginMetadataFile(entry: fs.Dirent): boolean {
  if (!SUPERSEDED_METADATA_FILE_NAMES.has(entry.name)) return false;
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error("Canonical Plugin legacy metadata path is unsafe");
  }
  return true;
}

function localProjectionDeviceId(): string {
  return localResourceDeviceIdFromRootIdentity(
    getRuntimeStorageContext().rootIdentity,
  );
}

function listBundles(): LoadedPlugin[] {
  const root = rootPath();
  if (!fs.existsSync(root)) return [];
  const stats = fs.lstatSync(root);
  if (!stats.isDirectory() || stats.isSymbolicLink())
    throw new Error("Canonical Plugin library path is unsafe");
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const bundles = entries.flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    if (isSupersededPluginMetadataFile(entry)) return [];
    assertId(entry.name, "resource path");
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error("Canonical Plugin resource path is unsafe");
    const bundlePath = path.join(root, entry.name);
    const resource = readPluginResourceBundle(bundlePath);
    if (encodeCanonicalResourceDirectory(resource.plugin.id) !== entry.name)
      throw new Error("Canonical Plugin bundle path does not match its id");
    return [{ bundlePath, resource }];
  });
  if (bundles.length > MAX_RESOURCES)
    throw new Error("Canonical Plugin resource limit exceeded");
  return bundles;
}

function readProjection(
  plugins: readonly LoadedPlugin[],
): Pick<PluginDeviceProjectionDocument, "sources" | "targets"> {
  const filePath = projectionPath();
  if (!fs.existsSync(filePath)) return { sources: {}, targets: {} };
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink())
    throw new Error("Canonical Plugin projection path is unsafe");
  const document = parsePluginDeviceProjectionDocument(
    fs.readFileSync(filePath, "utf8"),
    {
      expectedDeviceId: localProjectionDeviceId(),
      knownPluginIds: new Set(
        plugins.map(({ resource }) => resource.plugin.id),
      ),
    },
  );
  return document;
}

export function readCanonicalPluginLibrary(): PluginLibraryFile {
  recoverCanonicalEntryPublication(getUserDataPath(), OPERATION_KEY);
  const loaded = listBundles();
  const projections = readProjection(loaded);
  const plugins = loaded
    .map(({ resource }) => ({
      ...resource.plugin,
      source: {
        ...resource.plugin.source,
        ...(resource.plugin.source.kind === "local" &&
        projections.sources[resource.plugin.id]
          ? { url: projections.sources[resource.plugin.id] }
          : {}),
      },
      distributedTargetIds: projections.targets[resource.plugin.id] ?? [],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: new Date(
      Math.max(0, ...plugins.map((plugin) => plugin.updatedAt)),
    ).toISOString(),
    plugins,
  };
}

export function readCanonicalPluginVersions(): PluginVersionFile {
  recoverCanonicalEntryPublication(getUserDataPath(), OPERATION_KEY);
  const versions = listBundles().flatMap(({ resource }) => resource.versions);
  return {
    kind: "prompthub-plugin-versions",
    version: 1,
    updatedAt:
      versions
        .map((version) => version.createdAt)
        .sort()
        .at(-1) ?? new Date(0).toISOString(),
    versions,
  };
}

function collectPackageFiles(
  directoryPath: string,
): PluginPackagePayloadSource[] {
  const root = path.resolve(directoryPath);
  if (!fs.existsSync(root)) return [];
  const rootStats = fs.lstatSync(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink())
    throw new Error("Canonical Plugin package root is unsafe");
  const result: PluginPackagePayloadSource[] = [];
  const pending: Array<{ absolutePath: string; relativePath: string }> = [
    { absolutePath: root, relativePath: "" },
  ];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of fs
      .readdirSync(current.absolutePath, { withFileTypes: true })
      .sort((left, right) => right.name.localeCompare(left.name))) {
      if (!current.relativePath && IGNORED_ROOTS.has(entry.name)) continue;
      const absolutePath = path.join(current.absolutePath, entry.name);
      const relativePath = current.relativePath
        ? `${current.relativePath}/${entry.name}`
        : entry.name;
      if (entry.isSymbolicLink())
        throw new Error("Canonical Plugin package contains a symbolic link");
      if (entry.isDirectory()) {
        pending.push({ absolutePath, relativePath });
        continue;
      }
      if (!entry.isFile())
        throw new Error("Canonical Plugin package contains an unsafe entry");
      const stats = fs.lstatSync(absolutePath);
      if (stats.size > MAX_PACKAGE_FILE_BYTES)
        throw new Error("Canonical Plugin package file limit exceeded");
      result.push({ path: relativePath, sourcePath: absolutePath });
      if (result.length > MAX_PACKAGE_FILES)
        throw new Error("Canonical Plugin package file count limit exceeded");
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

function packageSources(
  plugin: PluginLibraryEntry,
  current: LoadedPlugin | undefined,
): PluginPackagePayloadSource[] {
  const candidate = plugin.localPackagePath ?? plugin.source.localPackagePath;
  if (candidate) return collectPackageFiles(candidate);
  return (
    current?.resource.packageFiles.map((file) => ({
      path: file.path,
      sourcePath: file.absolutePath,
    })) ?? []
  );
}

function writeJsonStage(stagePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(stagePath), { recursive: true, mode: 0o700 });
  const descriptor = fs.openSync(stagePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function writeCanonicalPluginState(input: {
  library: PluginLibraryFile;
  versions: PluginVersionFile;
  injectPublicationFailure?: (targetPath: string) => void;
}): void {
  recoverCanonicalEntryPublication(getUserDataPath(), OPERATION_KEY);
  const loaded = listBundles();
  const previous = new Map(
    loaded.map((entry) => [entry.resource.plugin.id, entry]),
  );
  const plugins = new Map<string, PluginLibraryEntry>();
  for (const plugin of input.library.plugins) {
    assertId(plugin.id, "id");
    if (plugins.has(plugin.id))
      throw new Error("Canonical Plugin library contains a duplicate id");
    plugins.set(plugin.id, plugin);
  }
  const versionsByPlugin = new Map<string, PluginVersion[]>();
  for (const version of input.versions.versions) {
    if (!plugins.has(version.pluginId)) continue;
    const values = versionsByPlugin.get(version.pluginId) ?? [];
    values.push(version);
    versionsByPlugin.set(version.pluginId, values);
  }
  const mutations: CanonicalEntryMutation[] = [];
  for (const [id, plugin] of plugins) {
    const current = previous.get(id);
    const versions = (versionsByPlugin.get(id) ?? []).sort(
      (left, right) => left.version - right.version,
    );
    const unchanged =
      current &&
      stableJson(current.resource.document.plugin) ===
        stableJson(createPortablePluginResourceEntry(plugin)) &&
      stableJson(current.resource.versions) ===
        stableJson(portableVersions(versions));
    if (unchanged) continue;
    mutations.push({
      targetPath: path.join(rootPath(), encodeCanonicalResourceDirectory(id)),
      prepare(stagePath) {
        materializePluginResourceBundle({
          bundlePath: stagePath,
          plugin,
          versions,
          packageFiles: packageSources(plugin, current),
          writePolicy: {
            mode: "create",
            revision: (current?.resource.bundleManifest.revision ?? 0) + 1,
          },
        });
      },
    });
  }
  for (const [id, current] of previous) {
    if (!plugins.has(id))
      mutations.push({ targetPath: current.bundlePath, delete: true });
  }
  const projection = createPluginDeviceProjectionDocument({
    deviceId: localProjectionDeviceId(),
    plugins: [...plugins.values()],
  });
  mutations.push({
    targetPath: projectionPath(),
    prepare: (stagePath) => writeJsonStage(stagePath, projection),
  });
  publishCanonicalEntries({
    rootPath: getUserDataPath(),
    operationKey: OPERATION_KEY,
    entries: mutations,
    injectFailure: input.injectPublicationFailure,
    verify() {
      const restoredLibrary = readCanonicalPluginLibrary();
      const restoredVersions = readCanonicalPluginVersions();
      const expectedPlugins = [...plugins.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      const pluginMetadataMatches =
        stableJson(
          restoredLibrary.plugins.map((plugin) =>
            createPortablePluginResourceEntry(plugin),
          ),
        ) ===
        stableJson(
          expectedPlugins.map((plugin) =>
            createPortablePluginResourceEntry(plugin),
          ),
        );
      const versionsMatch =
        stableJson(restoredVersions.versions) ===
        stableJson(
          portableVersions(
            input.versions.versions.filter((version) =>
              plugins.has(version.pluginId),
            ),
          ),
        );
      const projectionMatches =
        stableJson(
          createPluginDeviceProjectionDocument({
            deviceId: localProjectionDeviceId(),
            plugins: restoredLibrary.plugins,
          }),
        ) === stableJson(projection);
      if (!pluginMetadataMatches || !versionsMatch || !projectionMatches) {
        const mismatches = [
          !pluginMetadataMatches && "metadata",
          !versionsMatch && "versions",
          !projectionMatches && "device projection",
        ].filter(Boolean);
        throw new Error(
          `Canonical Plugin publication verification failed: ${mismatches.join(", ")}`,
        );
      }
    },
  });
}
