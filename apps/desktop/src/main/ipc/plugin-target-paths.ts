import { getPlatformById } from "@prompthub/shared/constants/platforms";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import {
  getPluginTargetPlatformId,
  resolvePluginPackageTargetPath,
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
