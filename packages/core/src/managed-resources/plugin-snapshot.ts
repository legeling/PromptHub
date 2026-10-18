import type { ManagedResourceSnapshot } from "@prompthub/shared/types/managed-resources";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import type { AgentAssetFileSnapshot } from "@prompthub/shared/types/sync";
import { sha256HexSync } from "@prompthub/shared/utils/mcp-entry-sha256";
import { calculateResourceBundleContentHash } from "@prompthub/shared/utils/resource-bundle-hash";
import { createPortablePluginResourceEntry } from "@prompthub/shared/utils/plugin-resource-snapshot";
import type { ResourceBundleManifest } from "../resource-bundle";

function decode(file: AgentAssetFileSnapshot): unknown {
  const bytes = Uint8Array.from(atob(file.contentBase64), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length !== file.size)
    throw new Error("Plugin snapshot size mismatch");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function encode(relativePath: string, value: unknown): AgentAssetFileSnapshot {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)),
    );
  return {
    relativePath,
    contentBase64: btoa(chunks.join("")),
    size: bytes.length,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Plugin snapshot document");
  return value as Record<string, unknown>; // Checked at the serialized snapshot boundary.
}

function rewriteBundle(
  files: AgentAssetFileSnapshot[],
  manifestFile: AgentAssetFileSnapshot,
  plugin: PluginLibraryEntry,
): AgentAssetFileSnapshot[] {
  const value = record(decode(manifestFile));
  if (
    value.kind !== "prompthub-resource-bundle" ||
    !Array.isArray(value.payloadFiles) ||
    !Array.isArray(value.objectHashes) ||
    !Number.isSafeInteger(value.revision)
  )
    throw new Error("Invalid Plugin bundle manifest");
  // The existing snapshot owns the bundle shape. Only its current metadata is replaced.
  const manifest = value as unknown as ResourceBundleManifest;
  const prefix = manifestFile.relativePath.slice(0, -"manifest.json".length);
  const current = files.find(
    (file) => file.relativePath === `${prefix}plugin.json`,
  );
  if (!current) throw new Error("Plugin snapshot metadata is missing");
  const document = record(decode(current));
  const replacement = encode(current.relativePath, {
    ...document,
    plugin: createPortablePluginResourceEntry(plugin),
  });
  const content = new TextDecoder().decode(
    Uint8Array.from(atob(replacement.contentBase64), (char) =>
      char.charCodeAt(0),
    ),
  );
  manifest.payloadFiles = manifest.payloadFiles.map((file) =>
    file.path === "plugin.json"
      ? { ...file, size: replacement.size, sha256: sha256HexSync(content) }
      : file,
  );
  manifest.revision += 1;
  manifest.updatedAt = new Date(plugin.updatedAt).toISOString();
  manifest.contentHash = calculateResourceBundleContentHash(manifest);
  const updatedManifest = encode(manifestFile.relativePath, manifest);
  return files.map((file) =>
    file === current
      ? replacement
      : file === manifestFile
        ? updatedManifest
        : file,
  );
}

/** Keep synchronized current metadata and portable bundles consistent; history bytes stay intact. */
export function updatePluginSnapshotMetadata(
  snapshot: ManagedResourceSnapshot,
  id: string,
  plugin?: PluginLibraryEntry,
): void {
  let files = snapshot.agentAssetFiles?.plugins;
  if (!files) return;
  for (const file of files.filter((entry) =>
    entry.relativePath.endsWith("/manifest.json"),
  )) {
    const manifest = record(decode(file));
    if (manifest.resourceType !== "plugin" || manifest.resourceId !== id)
      continue;
    const prefix = file.relativePath.slice(0, -"manifest.json".length);
    files = plugin
      ? rewriteBundle(files, file, plugin)
      : files.filter((entry) => !entry.relativePath.startsWith(prefix));
  }
  files = files.map((file) => {
    if (file.relativePath === "library.json")
      return encode(file.relativePath, snapshot.pluginLibrary);
    if (!plugin && file.relativePath === "versions.json") {
      const document = record(decode(file));
      if (!Array.isArray(document.versions))
        throw new Error("Invalid Plugin history");
      return encode(file.relativePath, {
        ...document,
        versions: document.versions.filter(
          (version) => record(version).pluginId !== id,
        ),
      });
    }
    return file;
  });
  snapshot.agentAssetFiles = { ...snapshot.agentAssetFiles, plugins: files };
}
