import type {
  PluginFileSnapshot,
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginPackageSource,
  PluginVersion,
} from "../types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "../types/plugin";
const MAX_SNAPSHOT_FILES = 2_000;
const MAX_SNAPSHOT_FILE_BYTES = 5 * 1024 * 1024;
const TRUST_LEVELS = new Set(["official", "verified", "community", "custom"]);
const SOURCE_KINDS = new Set(["market", "git", "ssh", "http", "local"]);
const CLASSIFICATIONS = new Set([
  "bundle",
  "single-skill",
  "runtime-module",
  "invalid",
]);
const IGNORED_PACKAGE_ROOTS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "__pycache__",
  ".cache",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    new TextEncoder().encode(value).byteLength > 256 ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  ) {
    throw new Error(`Plugin resource ${label} is invalid`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string")
    throw new Error(`Plugin resource ${label} must be a string`);
}

function assertOptionalString(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "string")
    throw new Error(`Plugin resource ${label} must be a string`);
}

function assertEpoch(value: unknown, label: string): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    !Number.isFinite(new Date(Number(value)).getTime())
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

export function positiveVersion(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > 999_999
  )
    throw new Error("Plugin resource version number is invalid");
  return Number(value);
}

function validateStringArray(
  value: unknown,
  label: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`Plugin resource ${label} is invalid`);
  return value;
}

function portableRemoteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function portableSource(input: PluginPackageSource): PluginPackageSource {
  const source = structuredClone(input);
  delete source.localRepositoryPath;
  delete source.localPackagePath;
  source.repository = portableRemoteUrl(source.repository);
  source.rawJsonUrl = portableRemoteUrl(source.rawJsonUrl);
  source.url = portableRemoteUrl(source.url);
  return source;
}

export function portablePlugin(input: PluginLibraryEntry): PluginLibraryEntry {
  const plugin = structuredClone(input);
  delete plugin.managedPath;
  delete plugin.localRepositoryPath;
  delete plugin.localPackagePath;
  delete plugin.distributedTargetIds;
  plugin.source = portableSource(plugin.source);
  plugin.iconUrl = portableRemoteUrl(plugin.iconUrl);
  plugin.logoUrl = portableRemoteUrl(plugin.logoUrl);
  plugin.homepage = portableRemoteUrl(plugin.homepage);
  plugin.repository = portableRemoteUrl(plugin.repository);
  if (plugin.author) plugin.author.url = portableRemoteUrl(plugin.author.url);
  return plugin;
}

export function createPortablePluginResourceEntry(
  input: PluginLibraryEntry,
): PluginLibraryEntry {
  return validatePlugin(portablePlugin(input));
}

function validateInventory(value: unknown): PluginInventorySummary {
  if (!isRecord(value)) throw new Error("Plugin resource inventory is invalid");
  const keys = Object.keys(value).sort();
  if (
    keys.length !== PLUGIN_INVENTORY_KEYS.length ||
    keys.some((key, index) => key !== [...PLUGIN_INVENTORY_KEYS].sort()[index])
  ) {
    throw new Error("Plugin resource inventory keys are invalid");
  }
  for (const key of PLUGIN_INVENTORY_KEYS) {
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0)
      throw new Error(`Plugin resource inventory ${key} is invalid`);
  }
  return value as PluginInventorySummary;
}

function validateSource(value: unknown): PluginPackageSource {
  if (
    !isRecord(value) ||
    typeof value.kind !== "string" ||
    !SOURCE_KINDS.has(value.kind)
  )
    throw new Error("Plugin resource source is invalid");
  if (
    value.localRepositoryPath !== undefined ||
    value.localPackagePath !== undefined
  )
    throw new Error("Plugin resource cannot persist local source paths");
  for (const field of [
    "sourceId",
    "label",
    "repository",
    "rawJsonUrl",
    "marketplaceFile",
    "packagePath",
    "manifestPath",
    "url",
    "branch",
  ])
    assertOptionalString(value[field], `source ${field}`);
  return value as unknown as PluginPackageSource;
}

export function validatePlugin(value: unknown): PluginLibraryEntry {
  if (!isRecord(value)) throw new Error("Plugin resource metadata is invalid");
  assertId(value.id, "id");
  assertId(value.name, "name");
  assertString(value.displayName, "displayName");
  for (const field of [
    "description",
    "longDescription",
    "iconUrl",
    "logoUrl",
    "brandColor",
    "version",
    "category",
    "userNotes",
    "homepage",
    "repository",
    "installedManifestHash",
    "installedPackageHash",
  ])
    assertOptionalString(value[field], field);
  if (
    typeof value.trustLevel !== "string" ||
    !TRUST_LEVELS.has(value.trustLevel)
  )
    throw new Error("Plugin resource trust level is invalid");
  if (
    typeof value.classification !== "string" ||
    !CLASSIFICATIONS.has(value.classification)
  )
    throw new Error("Plugin resource classification is invalid");
  if (value.isFavorite !== undefined && typeof value.isFavorite !== "boolean")
    throw new Error("Plugin resource favorite is invalid");
  for (const field of [
    "tags",
    "userTags",
    "nativeTargetIds",
    "invalidNativeTargetIds",
  ])
    validateStringArray(value[field], field);
  for (const field of [
    "managedPath",
    "localRepositoryPath",
    "localPackagePath",
    "distributedTargetIds",
  ])
    if (value[field] !== undefined)
      throw new Error(`Plugin resource cannot persist ${field}`);
  assertEpoch(value.installedAt, "installedAt");
  assertEpoch(value.updatedAt, "updatedAt");
  if (value.updatedFromSourceAt !== undefined)
    assertEpoch(value.updatedFromSourceAt, "updatedFromSourceAt");
  const source = validateSource(value.source);
  const inventory = validateInventory(value.inventory);
  return {
    ...(value as unknown as PluginLibraryEntry),
    source,
    inventory,
  };
}

export function validatePackagePath(value: string): string {
  const segments = value.split("/");
  if (
    !value ||
    value.startsWith("/") ||
    value.includes(":") ||
    /\p{Cc}|\\/u.test(value) ||
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    ) ||
    IGNORED_PACKAGE_ROOTS.has(segments[0])
  ) {
    throw new Error(`Plugin resource package path is unsafe: ${value}`);
  }
  return value;
}

export function versionPath(version: number): string {
  return `versions/${String(version).padStart(6, "0")}.json`;
}

export function versionFilesRoot(version: number): string {
  return `versions/${String(version).padStart(6, "0")}/files`;
}

function validateSnapshotFile(value: unknown): PluginFileSnapshot {
  if (!isRecord(value) || typeof value.relativePath !== "string")
    throw new Error("Plugin resource snapshot file is invalid");
  const relativePath = validatePackagePath(value.relativePath);
  if (typeof value.contentBase64 !== "string")
    throw new Error("Plugin resource snapshot content is invalid");
  const content = Uint8Array.from(atob(value.contentBase64), (character) =>
    character.charCodeAt(0),
  );
  if (
    btoa(atob(value.contentBase64)) !== value.contentBase64 ||
    !Number.isSafeInteger(value.size) ||
    value.size !== content.byteLength ||
    content.byteLength > MAX_SNAPSHOT_FILE_BYTES
  ) {
    throw new Error("Plugin resource snapshot size is invalid");
  }
  return {
    relativePath,
    contentBase64: value.contentBase64,
    size: content.byteLength,
  };
}

export function validateVersion(
  value: unknown,
  pluginId: string,
): PluginVersion {
  if (!isRecord(value)) throw new Error("Plugin resource version is invalid");
  assertId(value.id, "version id");
  if (value.pluginId !== pluginId)
    throw new Error("Plugin version does not belong to the owning Plugin");
  const version = positiveVersion(value.version);
  assertTimestamp(value.createdAt, "version createdAt");
  assertOptionalString(value.note, "version note");
  const plugin = validatePlugin(
    portablePlugin(value.plugin as PluginLibraryEntry),
  );
  if (plugin.id !== pluginId)
    throw new Error(
      "Plugin version metadata does not belong to the owning Plugin",
    );
  let packageSnapshot: PluginVersion["packageSnapshot"];
  if (value.packageSnapshot !== undefined) {
    if (
      !isRecord(value.packageSnapshot) ||
      value.packageSnapshot.pluginId !== pluginId
    )
      throw new Error("Plugin resource version package identity is invalid");
    if (
      !Array.isArray(value.packageSnapshot.files) ||
      value.packageSnapshot.files.length > MAX_SNAPSHOT_FILES
    )
      throw new Error("Plugin resource version package files are invalid");
    const files = value.packageSnapshot.files
      .map(validateSnapshotFile)
      .sort((a, b) =>
        a.relativePath < b.relativePath
          ? -1
          : a.relativePath > b.relativePath
            ? 1
            : 0,
      );
    if (new Set(files.map((file) => file.relativePath)).size !== files.length)
      throw new Error(
        "Plugin resource version package contains duplicate paths",
      );
    packageSnapshot = { pluginId, files };
  }
  return {
    id: value.id,
    pluginId,
    version,
    ...(value.note === undefined ? {} : { note: value.note as string }),
    createdAt: value.createdAt,
    plugin,
    ...(packageSnapshot ? { packageSnapshot } : {}),
  };
}

export function parsePluginResourceSnapshot(value: unknown): {
  plugin: PluginLibraryEntry;
  versions: PluginVersion[];
  files: PluginFileSnapshot[];
} {
  if (
    !isRecord(value) ||
    !Array.isArray(value.versions) ||
    !Array.isArray(value.files) ||
    value.files.length > MAX_SNAPSHOT_FILES
  )
    throw new Error("Invalid Plugin resource snapshot");
  const plugin = validatePlugin(value.plugin);
  const versions = value.versions
    .map((version) => validateVersion(version, plugin.id))
    .sort((a, b) => a.version - b.version);
  const files = value.files
    .map(validateSnapshotFile)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  if (
    new Set(versions.map((version) => version.id)).size !== versions.length ||
    new Set(versions.map((version) => version.version)).size !==
      versions.length ||
    new Set(files.map((file) => file.relativePath)).size !== files.length
  )
    throw new Error("Duplicate Plugin snapshot identity");
  return { plugin, versions, files };
}
