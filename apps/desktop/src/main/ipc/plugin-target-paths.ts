import { getPlatformById } from "@prompthub/shared/constants/platforms";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import {
  getPluginTargetPlatformId,
  resolvePluginPackageTargetPath,
  resolveSharedPluginTargetPath,
} from "@prompthub/core/plugin-target-paths";
export { normalizePluginDirectorySegment } from "@prompthub/core/plugin-target-paths";
import {
  getPlatformPluginDir,
  getPlatformRootDir,
} from "../services/skill-installer-utils";

export function resolveAgentPluginTargetPath(
  targetId: string,
  plugin: PluginLibraryEntry,
): string | undefined {
  if (targetId === "shared-agents")
    return resolveSharedPluginTargetPath(plugin);
  const platformId = getPluginTargetPlatformId(targetId);
  if (!platformId) {
    return undefined;
  }
  const platform = getPlatformById(platformId);
  if (!platform) {
    return undefined;
  }

  return resolvePluginPackageTargetPath(targetId, plugin, {
    root: getPlatformRootDir(platform),
    plugins: getPlatformPluginDir(platform),
  });
}
