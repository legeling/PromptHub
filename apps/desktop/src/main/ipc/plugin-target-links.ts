import fs from "node:fs";
import path from "node:path";
import { CorePluginLibraryService } from "@prompthub/core";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import { resolveAgentPluginTargetPath } from "./plugin-target-paths";

export interface PluginScanEntry {
  name: string;
  containmentRootDir: string;
}

function managedPluginsByTargetPath(
  targetId: string,
): Map<string, PluginLibraryEntry> {
  const result = new Map<string, PluginLibraryEntry>();
  for (const plugin of new CorePluginLibraryService().read().plugins) {
    if (!plugin.distributedTargetIds?.includes(targetId)) continue;
    const targetPath = resolveAgentPluginTargetPath(targetId, plugin);
    if (!targetPath) continue;
    try {
      const parent = fs.realpathSync(path.dirname(targetPath));
      result.set(path.join(parent, path.basename(targetPath)), plugin);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        continue;
      throw error;
    }
  }
  return result;
}

export function getDirectPluginScanEntries(
  pluginDir: string,
  rootDir: string,
  targetId: string,
): PluginScanEntry[] {
  const entries = fs.readdirSync(pluginDir, { withFileTypes: true });
  const managed = entries.some((entry) => entry.isSymbolicLink())
    ? managedPluginsByTargetPath(targetId)
    : new Map<string, PluginLibraryEntry>();
  const realPluginDir = fs.realpathSync(pluginDir);
  return entries.flatMap((entry) => {
    if (entry.isDirectory())
      return [{ name: entry.name, containmentRootDir: rootDir }];
    if (!entry.isSymbolicLink()) return [];
    const linkPath = path.join(realPluginDir, entry.name);
    const plugin = managed.get(linkPath);
    if (!plugin) return [];
    const packagePath =
      plugin.localPackagePath ||
      plugin.source.localPackagePath ||
      plugin.managedPath ||
      plugin.localRepositoryPath ||
      plugin.source.localRepositoryPath;
    if (!packagePath) return [];
    try {
      const realPackagePath = fs.realpathSync(packagePath);
      if (
        realPackagePath === fs.realpathSync(linkPath) &&
        fs.statSync(linkPath).isDirectory()
      ) {
        return [{ name: entry.name, containmentRootDir: realPackagePath }];
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return [];
      throw error;
    }
    return [];
  });
}
