import type { ResourceBundleManifest } from "../resource-bundle";
import {
  hostedPluginManifestSchema as manifestSchema,
  parseHostedPluginBackup,
} from "@prompthub/shared/utils/hosted-plugin-schema";
import type { ManagedResourceSnapshot } from "@prompthub/shared/types/managed-resources";
import type { AgentAssetFileSnapshot } from "@prompthub/shared/types/sync";
import type { PluginVersion } from "@prompthub/shared/types/plugin";
import {
  parsePluginResourceSnapshot,
  createPortablePluginResourceEntry,
  validatePackagePath,
  versionPath,
  versionFilesRoot,
} from "@prompthub/shared/utils/plugin-resource-snapshot";
import { calculateResourceBundleContentHash } from "@prompthub/shared/utils/resource-bundle-hash";
import { sha256HexSync } from "@prompthub/shared/utils/mcp-entry-sha256";
import { encodeCanonicalResourceDirectory } from "../canonical-resource-path";

export type HostedPluginPackage = ReturnType<
  typeof parsePluginResourceSnapshot
>;

export function decodePluginSnapshotBytes(
  file: AgentAssetFileSnapshot,
): Uint8Array {
  const raw = atob(file.contentBase64);
  if (raw.length !== file.size || btoa(raw) !== file.contentBase64)
    throw new Error("Invalid Plugin snapshot bytes");
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
export function encodePluginSnapshot(
  relativePath: string,
  value: unknown,
): AgentAssetFileSnapshot {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  return {
    relativePath,
    contentBase64: btoa(parts.join("")),
    size: bytes.length,
  };
}
function document(file: AgentAssetFileSnapshot): Record<string, unknown> {
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      decodePluginSnapshotBytes(file),
    ),
  );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Plugin snapshot document");
  return value as Record<string, unknown>; // Runtime record guard at the serialized boundary.
}
function readBundle(
  files: AgentAssetFileSnapshot[],
  entry: AgentAssetFileSnapshot,
): HostedPluginPackage {
  // The schema checks all manifest fields, including required payload metadata.
  const manifest = manifestSchema.parse(
    document(entry),
  ) as ResourceBundleManifest;
  if (
    manifest.payloadFiles.filter(
      (file) => file.role === "current" && file.path === "plugin.json",
    ).length !== 1 ||
    manifest.payloadFiles.filter((file) => file.role === "current").length !== 1
  )
    throw new Error("Invalid Plugin current inventory");
  if (calculateResourceBundleContentHash(manifest) !== manifest.contentHash)
    throw new Error("Plugin manifest hash mismatch");
  const prefix = entry.relativePath.slice(0, -"manifest.json".length);
  const payloads = new Map(
    files
      .filter((file) => file.relativePath.startsWith(prefix) && file !== entry)
      .map((file) => [file.relativePath.slice(prefix.length), file]),
  );
  if (payloads.size !== manifest.payloadFiles.length)
    throw new Error("Plugin bundle inventory mismatch");
  const seen = new Set<string>();
  for (const item of manifest.payloadFiles) {
    validatePackagePath(item.path);
    const file = payloads.get(item.path);
    if (!file || seen.has(item.path.toLowerCase()))
      throw new Error("Plugin bundle inventory mismatch");
    seen.add(item.path.toLowerCase());
    if (
      file.size !== item.size ||
      sha256HexSync(decodePluginSnapshotBytes(file)) !== item.sha256
    )
      throw new Error("Plugin payload hash mismatch");
  }
  const current = payloads.get("plugin.json");
  if (!current) throw new Error("Plugin current metadata missing");
  const metadata = document(current);
  if (
    metadata.kind !== "prompthub-plugin-resource" ||
    metadata.schemaVersion !== 1
  )
    throw new Error("Invalid Plugin current metadata");
  const versions = manifest.payloadFiles
    .filter((file) => file.role === "version")
    .map((item) => {
      const value = document(payloads.get(item.path)!);
      if (
        value.kind !== "prompthub-plugin-version-resource" ||
        value.schemaVersion !== 1 ||
        !value.version ||
        typeof value.version !== "object"
      )
        throw new Error("Invalid Plugin version document");
      const number: unknown = Reflect.get(value.version, "version");
      if (typeof number !== "number" || item.path !== versionPath(number))
        throw new Error("Invalid Plugin version path");
      const root = `${versionFilesRoot(number)}/`;
      const packageFiles = manifest.payloadFiles
        .filter(
          (file) =>
            file.role === "version-package" && file.path.startsWith(root),
        )
        .map((file) => ({
          ...payloads.get(file.path)!,
          relativePath: file.path.slice(root.length),
        }));
      if (Boolean(value.hasPackageSnapshot) !== Boolean(packageFiles.length))
        throw new Error("Plugin version package missing");
      return {
        ...value.version,
        version: number,
        ...(packageFiles.length
          ? {
              packageSnapshot: {
                pluginId: manifest.resourceId,
                files: packageFiles,
              },
            }
          : {}),
      };
    });
  for (const item of manifest.payloadFiles.filter(
    (file) => file.role === "version-package",
  )) {
    if (
      !versions.some((version) =>
        item.path.startsWith(`${versionFilesRoot(version.version)}/`),
      )
    )
      throw new Error("Orphan Plugin version package");
  }
  const result = parsePluginResourceSnapshot({
    plugin: metadata.plugin,
    versions,
    files: manifest.payloadFiles
      .filter((item) => item.role === "package")
      .map((item) => {
        if (!item.path.startsWith("files/"))
          throw new Error("Invalid Plugin package path");
        return {
          ...payloads.get(item.path)!,
          relativePath: item.path.slice(6),
        };
      }),
  });
  if (
    result.plugin.id !== manifest.resourceId ||
    metadata.currentVersion !== (result.versions.at(-1)?.version ?? 1)
  )
    throw new Error("Plugin bundle identity mismatch");
  return result;
}

function findBundle(
  snapshot: ManagedResourceSnapshot,
  id: string,
): AgentAssetFileSnapshot | undefined {
  return snapshot.agentAssetFiles?.plugins?.find(
    (file) =>
      file.relativePath.endsWith("/manifest.json") &&
      document(file).resourceId === id,
  );
}
export function readHostedPlugin(
  snapshot: ManagedResourceSnapshot,
  id: string,
): HostedPluginPackage {
  const plugin = snapshot.pluginLibrary?.plugins.find((item) => item.id === id);
  if (!plugin) throw new Error("Plugin not found");
  const bundle = findBundle(snapshot, id);
  if (!bundle)
    throw new Error(
      "Plugin portable bundle is missing; synchronize the complete resource before editing",
    );
  const resource = readBundle(snapshot.agentAssetFiles!.plugins!, bundle);
  return { ...resource, plugin: createPortablePluginResourceEntry(plugin) };
}

function bundleFiles(
  resource: HostedPluginPackage,
  revision: number,
): AgentAssetFileSnapshot[] {
  const { plugin, files, versions } = parsePluginResourceSnapshot(resource);
  const payloads: Array<{
    file: AgentAssetFileSnapshot;
    role: "current" | "package" | "version" | "version-package";
  }> = [
    {
      file: encodePluginSnapshot("plugin.json", {
        kind: "prompthub-plugin-resource",
        schemaVersion: 1,
        currentVersion: versions.at(-1)?.version ?? 1,
        plugin,
      }),
      role: "current",
    },
    ...files.map((file) => ({
      file: { ...file, relativePath: `files/${file.relativePath}` },
      role: "package" as const,
    })),
  ];
  for (const version of versions) {
    const { packageSnapshot, ...metadata } = version;
    payloads.push({
      file: encodePluginSnapshot(versionPath(version.version), {
        kind: "prompthub-plugin-version-resource",
        schemaVersion: 1,
        version: metadata,
        hasPackageSnapshot: Boolean(packageSnapshot?.files.length),
      }),
      role: "version",
    });
    for (const file of packageSnapshot?.files ?? [])
      payloads.push({
        file: {
          ...file,
          relativePath: `${versionFilesRoot(version.version)}/${file.relativePath}`,
        },
        role: "version-package",
      });
  }
  const manifest = {
    kind: "prompthub-resource-bundle",
    manifestVersion: 1,
    resourceType: "plugin",
    resourceId: plugin.id,
    schemaVersion: 1,
    revision,
    createdAt: new Date(plugin.installedAt).toISOString(),
    updatedAt: new Date(plugin.updatedAt).toISOString(),
    objectHashes: [],
    payloadFiles: payloads.map(({ file, role }) => ({
      path: file.relativePath,
      size: file.size,
      sha256: sha256HexSync(decodePluginSnapshotBytes(file)),
      role,
    })),
  };
  return [
    ...payloads.map((item) => item.file),
    encodePluginSnapshot("manifest.json", {
      ...manifest,
      contentHash: calculateResourceBundleContentHash(manifest),
    }),
  ];
}
export function writeHostedPlugin(
  snapshot: ManagedResourceSnapshot,
  resource: HostedPluginPackage,
): void {
  const existing = findBundle(snapshot, resource.plugin.id);
  const oldPrefix = existing?.relativePath.slice(0, -"manifest.json".length);
  const revision = existing
    ? manifestSchema.parse(document(existing)).revision + 1
    : 1;
  const prefix = `${encodeCanonicalResourceDirectory(resource.plugin.id)}/`;
  const retained =
    snapshot.agentAssetFiles?.plugins?.filter(
      (file) => !oldPrefix || !file.relativePath.startsWith(oldPrefix),
    ) ?? [];
  snapshot.agentAssetFiles = {
    ...snapshot.agentAssetFiles,
    plugins: [
      ...retained,
      ...bundleFiles(resource, revision).map((file) => ({
        ...file,
        relativePath: prefix + file.relativePath,
      })),
    ],
  };
  const library = snapshot.pluginLibrary ?? {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: new Date().toISOString(),
    plugins: [],
  };
  snapshot.pluginLibrary = {
    ...library,
    updatedAt: new Date().toISOString(),
    plugins: [
      ...library.plugins.filter((plugin) => plugin.id !== resource.plugin.id),
      resource.plugin,
    ],
  };
  snapshot.pluginPackages = [
    ...(snapshot.pluginPackages ?? []).filter(
      (item) => item.pluginId !== resource.plugin.id,
    ),
    { pluginId: resource.plugin.id, files: resource.files },
  ];
}
export function exportHostedPluginFiles(
  snapshot: ManagedResourceSnapshot,
): AgentAssetFileSnapshot[] {
  for (const plugin of snapshot.pluginLibrary?.plugins ?? [])
    readHostedPlugin(snapshot, plugin.id);
  return structuredClone(snapshot.agentAssetFiles?.plugins ?? []);
}
export function readHostedPluginFiles(input: unknown): HostedPluginPackage[] {
  const files = parseHostedPluginBackup(input);
  if (
    new Set(files.map((file) => file.relativePath.toLowerCase())).size !==
    files.length
  )
    throw new Error("Duplicate Plugin snapshot path");
  const manifests = files.filter((file) =>
    file.relativePath.endsWith("/manifest.json"),
  );
  for (const file of files) {
    validatePackagePath(file.relativePath);
    if (
      manifests.filter((manifest) =>
        file.relativePath.startsWith(
          manifest.relativePath.slice(0, -"manifest.json".length),
        ),
      ).length !== 1
    )
      throw new Error("Plugin bundle inventory mismatch");
  }
  const resources = manifests.map((manifest) => readBundle(files, manifest));
  if (
    !resources.length ||
    new Set(resources.map((resource) => resource.plugin.id)).size !==
      resources.length
  )
    throw new Error("Invalid Plugin package identities");
  return resources;
}
export function snapshotHostedPlugin(
  resource: HostedPluginPackage,
  note?: string,
): PluginVersion {
  const version: PluginVersion = {
    id: crypto.randomUUID(),
    pluginId: resource.plugin.id,
    version: (resource.versions.at(-1)?.version ?? 0) + 1,
    createdAt: new Date().toISOString(),
    note,
    plugin: structuredClone(resource.plugin),
    packageSnapshot: {
      pluginId: resource.plugin.id,
      files: structuredClone(resource.files),
    },
  };
  resource.versions.push(version);
  return version;
}
