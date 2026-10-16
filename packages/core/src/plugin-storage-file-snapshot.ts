import fs from "node:fs";
import path from "node:path";
import { getDatabase } from "@prompthub/db";
import type { AgentAssetFileSnapshot } from "@prompthub/shared/types/sync";
import type {
  PluginLibrarySnapshot,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import { getDataDir, getOperationsDir, getUserDataPath } from "./runtime-paths";
import { materializePortablePlugins } from "./portable-plugin-snapshot";
import { readLibrary, readVersions } from "./migrations/plugin-metadata-v1";
import { PluginStorage } from "./plugin-storage";
import {
  createPortablePluginResourceEntry,
  parsePluginResourceSnapshot,
  readPluginResourceBundle,
} from "./plugin-resource-schema";
import {
  exportAgentAssetDirectorySnapshot,
  restoreAgentAssetDirectorySnapshot,
} from "./agent-asset-file-snapshot";

type PortablePlugin = ReturnType<typeof parsePluginResourceSnapshot>;
function temporaryDirectory(): string {
  const parent = path.join(getOperationsDir(), "plugin-snapshots");
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  return fs.mkdtempSync(path.join(parent, "snapshot-"));
}
export function exportPluginStorageFiles(): AgentAssetFileSnapshot[] {
  const temporary = temporaryDirectory();
  try {
    materializePortablePlugins(
      path.join(getDataDir(), "prompthub.db"),
      getUserDataPath(),
      temporary,
    );
    return exportAgentAssetDirectorySnapshot(temporary);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
function readBundle(directory: string): PortablePlugin {
  const resource = readPluginResourceBundle(directory);
  return parsePluginResourceSnapshot({
    plugin: createPortablePluginResourceEntry(resource.plugin),
    versions: resource.versions,
    files: resource.packageFiles.map((file) => ({
      relativePath: file.path,
      size: file.size,
      contentBase64: fs.readFileSync(file.absolutePath).toString("base64"),
    })),
  });
}
function readLegacy(
  directory: string,
  portable?: PluginLibrarySnapshot,
): PortablePlugin[] {
  const libraryPath = path.join(directory, "library.json"),
    versionsPath = path.join(directory, "versions.json");
  if (!fs.existsSync(libraryPath) && !fs.existsSync(versionsPath)) return [];
  const plugins = fs.existsSync(libraryPath)
    ? readLibrary(fs.readFileSync(libraryPath, "utf8"))
    : portable?.library.plugins;
  if (!plugins) throw new Error("Plugin snapshot library metadata is missing");
  const ids = new Set(plugins.map((plugin) => plugin.id));
  const versions = fs.existsSync(versionsPath)
    ? readVersions(fs.readFileSync(versionsPath, "utf8"))
    : [];
  const groups = new Map<string, PluginVersion[]>();
  for (const version of versions) {
    if (!ids.has(version.pluginId))
      throw new Error("Plugin snapshot history owner is missing");
    const group = groups.get(version.pluginId) ?? [];
    group.push(version);
    groups.set(version.pluginId, group);
  }
  const packages = new Map(
    portable?.packages?.map((item) => [item.pluginId, item.files]),
  );
  if (
    packages.size !== (portable?.packages?.length ?? 0) ||
    [...packages.keys()].some((id) => !ids.has(id))
  )
    throw new Error("Plugin snapshot package inventory is invalid");
  return plugins.map((plugin) => {
    const files = packages.get(plugin.id);
    // Historical machine paths describe provenance; only archive-carried bytes may be imported.
    if (!files && (plugin.localPackagePath || plugin.source.localPackagePath))
      throw new Error(
        `Plugin snapshot portable package is missing: ${plugin.id}`,
      );
    return parsePluginResourceSnapshot({
      plugin: createPortablePluginResourceEntry(plugin),
      versions: groups.get(plugin.id) ?? [],
      files: files ?? [],
    });
  });
}
function readSnapshots(
  directory: string,
  fileCount: number,
  portable?: PluginLibrarySnapshot,
): PortablePlugin[] {
  const resources = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        fs.existsSync(path.join(directory, entry.name, "manifest.json")),
    )
    .map((entry) => readBundle(path.join(directory, entry.name)));
  resources.push(...readLegacy(directory, portable));
  if (
    fileCount > 0 &&
    resources.length === 0 &&
    !fs.existsSync(path.join(directory, "library.json"))
  )
    throw new Error("Plugin snapshot contains no recognized library metadata");
  if (portable) {
    const expected = new Set(
      portable.library.plugins.map((plugin) => plugin.id),
    );
    if (
      expected.size !== portable.library.plugins.length ||
      expected.size !== resources.length ||
      resources.some((resource) => !expected.has(resource.plugin.id))
    )
      throw new Error("Plugin snapshot inventory does not match its library");
  }
  return resources;
}
export function restorePluginStorageFiles(
  files: AgentAssetFileSnapshot[],
  portable?: PluginLibrarySnapshot,
): void {
  const temporary = temporaryDirectory();
  try {
    const directory = path.join(temporary, "incoming");
    restoreAgentAssetDirectorySnapshot(directory, files);
    const snapshots = readSnapshots(directory, files.length, portable);
    new PluginStorage(getDatabase(), getUserDataPath()).restoreSnapshots(
      snapshots,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
