import {
  positiveVersion,
  validatePlugin,
  validateVersion,
  validatePackagePath,
  portablePlugin,
  versionPath,
  versionFilesRoot,
} from "@prompthub/shared/utils/plugin-resource-snapshot";
export {
  createPortablePluginResourceEntry,
  parsePluginResourceSnapshot,
} from "@prompthub/shared/utils/plugin-resource-snapshot";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  PluginFileSnapshot,
  PluginLibraryEntry,
  PluginVersion,
} from "@prompthub/shared/types/plugin";

import {
  readResourceBundle,
  type ResourceBundleManifest,
  type ResourceBundlePayloadSource,
} from "./resource-bundle";
import {
  resolveResourceBundleWriteRevision,
  writeResourceBundle,
  type ResourceBundleWritePolicy,
} from "./resource-bundle-publication";

export const PLUGIN_RESOURCE_KIND = "prompthub-plugin-resource";
export const PLUGIN_VERSION_RESOURCE_KIND = "prompthub-plugin-version-resource";
export const PLUGIN_RESOURCE_SCHEMA_VERSION = 1;
export const PLUGIN_DEVICE_PROJECTION_KIND =
  "prompthub-plugin-device-projections";

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_LOCAL_SOURCE_PATH_BYTES = 16 * 1024;
export interface PluginResourceDocument {
  kind: typeof PLUGIN_RESOURCE_KIND;
  schemaVersion: 1;
  currentVersion: number;
  plugin: PluginLibraryEntry;
  [key: string]: unknown;
}

export interface PluginVersionResourceDocument {
  kind: typeof PLUGIN_VERSION_RESOURCE_KIND;
  schemaVersion: 1;
  version: Omit<PluginVersion, "packageSnapshot">;
  hasPackageSnapshot: boolean;
  [key: string]: unknown;
}

export interface PluginPackagePayloadSource {
  path: string;
  sourcePath: string;
}

export interface PluginPackageFile {
  path: string;
  absolutePath: string;
  size: number;
  sha256: string;
}

export interface PluginVersionPackageFile {
  relativePath: string;
  absolutePath: string;
  size: number;
  sha256: string;
}

export interface ReadPluginResourceResult {
  plugin: PluginLibraryEntry;
  versions: PluginVersion[];
  packageFiles: PluginPackageFile[];
  versionPackageFiles: Map<number, PluginVersionPackageFile[]>;
  bundleManifest: ResourceBundleManifest;
  document: PluginResourceDocument;
}

export interface PluginDeviceProjectionDocument {
  kind: typeof PLUGIN_DEVICE_PROJECTION_KIND;
  version: 1;
  deviceId: string;
  updatedAt: string;
  targets: Record<string, string[]>;
  sources: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    Buffer.byteLength(value, "utf8") > 256 ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  ) {
    throw new Error(`Plugin resource ${label} is invalid`);
  }
}

function assertTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`Plugin resource ${label} is invalid`);
  }
}

function assertLocalSourcePath(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > MAX_LOCAL_SOURCE_PATH_BYTES ||
    !path.isAbsolute(value) ||
    path.normalize(value) !== value ||
    /\p{Cc}/u.test(value)
  ) {
    throw new Error(`Plugin resource ${label} is invalid`);
  }
}

function writeJsonSource(
  root: string,
  relativePath: string,
  value: unknown,
): string {
  const filePath = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES)
    throw new Error("Plugin resource document byte limit exceeded");
  fs.writeFileSync(filePath, content, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return filePath;
}

function writeSnapshotSource(
  root: string,
  relativePath: string,
  contentBase64: string,
): string {
  const filePath = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(contentBase64, "base64"), {
    mode: 0o600,
    flag: "wx",
  });
  return filePath;
}

export function materializePluginResourceBundle(input: {
  bundlePath: string;
  plugin: PluginLibraryEntry;
  versions: readonly PluginVersion[];
  packageFiles: readonly PluginPackagePayloadSource[];
  writePolicy?: ResourceBundleWritePolicy;
}): ResourceBundleManifest {
  const plugin = validatePlugin(portablePlugin(input.plugin));
  const versions = input.versions
    .map((version) => validateVersion(structuredClone(version), plugin.id))
    .sort((left, right) => left.version - right.version);
  if (
    new Set(versions.map((version) => version.id)).size !== versions.length ||
    new Set(versions.map((version) => version.version)).size !== versions.length
  )
    throw new Error("Plugin resource contains a duplicate version");
  const currentVersion = versions.at(-1)?.version ?? 1;
  const document: PluginResourceDocument = {
    kind: PLUGIN_RESOURCE_KIND,
    schemaVersion: 1,
    currentVersion,
    plugin,
  };
  const parentPath = path.dirname(input.bundlePath);
  fs.mkdirSync(parentPath, { recursive: true });
  const sourceRoot = path.join(
    parentPath,
    `.plugin-sources-${crypto.randomUUID()}`,
  );
  try {
    fs.mkdirSync(sourceRoot, { mode: 0o700 });
    const payloads: ResourceBundlePayloadSource[] = [
      {
        path: "plugin.json",
        sourcePath: writeJsonSource(sourceRoot, "plugin.json", document),
        role: "current",
      },
    ];
    const currentPaths = new Set<string>();
    for (const file of input.packageFiles) {
      const packagePath = validatePackagePath(file.path);
      if (currentPaths.has(packagePath))
        throw new Error(
          `Plugin resource duplicate package path: ${packagePath}`,
        );
      currentPaths.add(packagePath);
      payloads.push({
        path: `files/${packagePath}`,
        sourcePath: file.sourcePath,
        role: "package",
      });
    }
    for (const version of versions) {
      const { packageSnapshot, ...versionWithoutPackage } = version;
      const versionDocument: PluginVersionResourceDocument = {
        kind: PLUGIN_VERSION_RESOURCE_KIND,
        schemaVersion: 1,
        version: versionWithoutPackage,
        hasPackageSnapshot: Boolean(packageSnapshot),
      };
      payloads.push({
        path: versionPath(version.version),
        sourcePath: writeJsonSource(
          sourceRoot,
          versionPath(version.version),
          versionDocument,
        ),
        role: "version",
      });
      for (const file of packageSnapshot?.files ?? []) {
        const payloadPath = `${versionFilesRoot(version.version)}/${file.relativePath}`;
        payloads.push({
          path: payloadPath,
          sourcePath: writeSnapshotSource(
            sourceRoot,
            payloadPath,
            file.contentBase64,
          ),
          role: "version-package",
        });
      }
    }
    const revision = resolveResourceBundleWriteRevision(
      input.bundlePath,
      "plugin",
      plugin.id,
      currentVersion,
      input.writePolicy,
    );
    return writeResourceBundle(
      {
        bundlePath: input.bundlePath,
        resourceType: "plugin",
        resourceId: plugin.id,
        schemaVersion: 1,
        revision,
        createdAt: new Date(plugin.installedAt).toISOString(),
        updatedAt: new Date(plugin.updatedAt).toISOString(),
        provenance: { source: "plugin-library-shadow-export" },
        payloads,
      },
      { mode: input.writePolicy?.mode },
    ).manifest;
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

function parseJsonRecord(filePath: string): Record<string, unknown> {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DOCUMENT_BYTES)
    throw new Error("Plugin resource document is invalid");
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isRecord(value)) throw new Error("document is not an object");
    return value;
  } catch (error) {
    throw new Error("Plugin resource document contains invalid JSON", {
      cause: error,
    });
  }
}

function packageFile(
  bundlePath: string,
  payloadPath: string,
  prefix: string,
  size: number,
  sha256: string,
): PluginPackageFile {
  const relativePath = validatePackagePath(payloadPath.slice(prefix.length));
  return {
    path: relativePath,
    absolutePath: path.join(bundlePath, ...payloadPath.split("/")),
    size,
    sha256,
  };
}

export function readPluginResourceBundle(
  bundlePath: string,
): ReadPluginResourceResult {
  const bundle = readResourceBundle(bundlePath, {
    expectedResourceType: "plugin",
  });
  if (
    bundle.manifest.payloadFiles.some(
      (file) =>
        !["current", "package", "version", "version-package"].includes(
          String(file.role),
        ),
    )
  )
    throw new Error("Plugin resource payload role is unsupported");
  const current = bundle.manifest.payloadFiles.filter(
    (file) => file.role === "current",
  );
  if (current.length !== 1 || current[0].path !== "plugin.json")
    throw new Error("Plugin resource current payload is invalid");
  const value = parseJsonRecord(path.join(bundlePath, "plugin.json"));
  if (value.kind !== PLUGIN_RESOURCE_KIND || value.schemaVersion !== 1)
    throw new Error("Plugin resource header is unsupported");
  const plugin = validatePlugin(value.plugin);
  if (plugin.id !== bundle.manifest.resourceId)
    throw new Error("Plugin resource id does not match its bundle");
  const currentVersion = positiveVersion(value.currentVersion);
  const versionPackageFiles = new Map<number, PluginVersionPackageFile[]>();
  for (const file of bundle.manifest.payloadFiles.filter(
    (payload) => payload.role === "version-package",
  )) {
    const match = /^versions\/(\d{6})\/files\/(.+)$/u.exec(file.path);
    if (!match)
      throw new Error("Plugin resource version package path is invalid");
    const version = positiveVersion(Number(match[1]));
    const relativePath = validatePackagePath(match[2]);
    const entries = versionPackageFiles.get(version) ?? [];
    entries.push({
      relativePath,
      absolutePath: path.join(bundlePath, ...file.path.split("/")),
      size: file.size,
      sha256: file.sha256,
    });
    versionPackageFiles.set(version, entries);
  }
  const versions = bundle.manifest.payloadFiles
    .filter((file) => file.role === "version")
    .map((file) => {
      const document = parseJsonRecord(
        path.join(bundlePath, ...file.path.split("/")),
      );
      if (
        document.kind !== PLUGIN_VERSION_RESOURCE_KIND ||
        document.schemaVersion !== 1 ||
        typeof document.hasPackageSnapshot !== "boolean" ||
        !isRecord(document.version)
      )
        throw new Error("Plugin resource version header is unsupported");
      const parsed = validateVersion(document.version, plugin.id);
      if (file.path !== versionPath(parsed.version))
        throw new Error("Plugin resource version path is invalid");
      const packageEntries = versionPackageFiles.get(parsed.version) ?? [];
      if (document.hasPackageSnapshot !== packageEntries.length > 0)
        throw new Error(
          "Plugin resource version package declaration is invalid",
        );
      return {
        ...parsed,
        ...(packageEntries.length > 0
          ? {
              packageSnapshot: {
                pluginId: plugin.id,
                files: packageEntries.map((entry) => {
                  const content = fs.readFileSync(entry.absolutePath);
                  return {
                    relativePath: entry.relativePath,
                    contentBase64: content.toString("base64"),
                    size: content.byteLength,
                  };
                }),
              },
            }
          : {}),
      };
    })
    .sort((left, right) => left.version - right.version);
  if (
    new Set(versions.map((version) => version.id)).size !== versions.length ||
    new Set(versions.map((version) => version.version)).size !== versions.length
  )
    throw new Error("Plugin resource contains a duplicate version");
  if ((versions.at(-1)?.version ?? 1) !== currentVersion)
    throw new Error("Plugin resource currentVersion is invalid");
  for (const version of versionPackageFiles.keys())
    if (!versions.some((item) => item.version === version))
      throw new Error("Plugin resource package references an unknown version");
  const packageFiles = bundle.manifest.payloadFiles
    .filter((file) => file.role === "package")
    .map((file) => {
      if (!file.path.startsWith("files/"))
        throw new Error("Plugin resource package payload path is invalid");
      return packageFile(
        bundlePath,
        file.path,
        "files/",
        file.size,
        file.sha256,
      );
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const restoredPlugin = {
    ...plugin,
    ...(packageFiles.length > 0
      ? {
          managedPath: path.join(bundlePath, "files"),
          localPackagePath: path.join(bundlePath, "files"),
        }
      : {}),
  };
  return {
    plugin: restoredPlugin,
    versions,
    packageFiles,
    versionPackageFiles,
    bundleManifest: bundle.manifest,
    document: {
      ...value,
      kind: PLUGIN_RESOURCE_KIND,
      schemaVersion: 1,
      currentVersion,
      plugin,
    } as PluginResourceDocument,
  };
}

export function createPluginDeviceProjectionDocument(input: {
  deviceId: string;
  plugins: readonly PluginLibraryEntry[];
}): PluginDeviceProjectionDocument {
  assertId(input.deviceId, "device id");
  const sources: Record<string, string> = {};
  const targets: Record<string, string[]> = {};
  const seen = new Set<string>();
  let latest = 0;
  for (const plugin of input.plugins) {
    assertId(plugin.id, "projection plugin id");
    if (seen.has(plugin.id))
      throw new Error("Plugin device projections contain a duplicate Plugin");
    seen.add(plugin.id);
    const values = (plugin.distributedTargetIds ?? []).map((targetId) => {
      assertId(targetId, "projection target id");
      return targetId;
    });
    if (new Set(values).size !== values.length)
      throw new Error("Plugin device projection contains duplicate targets");
    if (values.length > 0) targets[plugin.id] = [...values].sort();
    if (plugin.source?.kind === "local" && plugin.source.url !== undefined) {
      assertLocalSourcePath(plugin.source.url, "projection source path");
      sources[plugin.id] = plugin.source.url;
    }
    latest = Math.max(latest, plugin.updatedAt);
  }
  return {
    kind: PLUGIN_DEVICE_PROJECTION_KIND,
    version: 1,
    deviceId: input.deviceId,
    updatedAt: new Date(latest).toISOString(),
    targets,
    sources,
  };
}

export function parsePluginDeviceProjectionDocument(
  content: string,
  options: {
    expectedDeviceId: string;
    knownPluginIds: ReadonlySet<string>;
  },
): PluginDeviceProjectionDocument {
  if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES)
    throw new Error("Plugin device projection byte limit exceeded");
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error("Plugin device projections contain invalid JSON", {
      cause: error,
    });
  }
  if (
    !isRecord(value) ||
    value.kind !== PLUGIN_DEVICE_PROJECTION_KIND ||
    value.version !== 1 ||
    value.deviceId !== options.expectedDeviceId ||
    !isRecord(value.targets) ||
    (value.sources !== undefined && !isRecord(value.sources))
  ) {
    throw new Error("Plugin device projection header is invalid");
  }
  assertTimestamp(value.updatedAt, "projection updatedAt");
  const targets = value.targets as Record<string, unknown>;
  const sources = (value.sources ?? {}) as Record<string, unknown>;
  const pluginIds = new Set([...Object.keys(targets), ...Object.keys(sources)]);
  const plugins = [...pluginIds].map((pluginId) => {
    const targetIds = targets[pluginId] ?? [];
    if (!options.knownPluginIds.has(pluginId) || !Array.isArray(targetIds))
      throw new Error("Plugin device projection references an unknown Plugin");
    const sourcePath = sources[pluginId];
    if (sourcePath !== undefined)
      assertLocalSourcePath(sourcePath, "projection source path");
    return {
      id: pluginId,
      updatedAt: Date.parse(value.updatedAt as string),
      distributedTargetIds: targetIds,
      source: {
        kind: "local",
        ...(sourcePath === undefined ? {} : { url: sourcePath }),
      },
    } as PluginLibraryEntry;
  });
  const parsed = createPluginDeviceProjectionDocument({
    deviceId: options.expectedDeviceId,
    plugins,
  });
  return { ...parsed, updatedAt: value.updatedAt };
}
