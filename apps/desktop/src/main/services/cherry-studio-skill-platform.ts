import * as native from "@prompthub/core/skills/cherry-studio-skill-platform";
import {
  getPlatformRootDir,
  resolvePlatformPath,
} from "./skill-installer-utils";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
export type {
  CherryStudioPlatformOptions,
  CherryStudioPlatformSkillMetadata,
} from "@prompthub/core/skills/cherry-studio-skill-platform";
export const isCherryStudioPlatform = native.isCherryStudioPlatform;
function optionsFor(
  platform: SkillPlatform,
  options?: native.CherryStudioPlatformOptions,
): native.CherryStudioPlatformOptions {
  return {
    ...options,
    overrides: {
      ...options?.overrides,
      [platform.id]: options?.overrides?.[platform.id]
        ? resolvePlatformPath(options.overrides[platform.id])
        : getPlatformRootDir(platform),
    },
  };
}
export function installCherryStudioSkill(
  ...[platform, name, source, options]: Parameters<
    typeof native.installCherryStudioSkill
  >
): ReturnType<typeof native.installCherryStudioSkill> {
  return native.installCherryStudioSkill(
    platform,
    name,
    source,
    optionsFor(platform, options),
  );
}
export function uninstallCherryStudioSkill(
  ...[platform, name, options]: Parameters<
    typeof native.uninstallCherryStudioSkill
  >
): ReturnType<typeof native.uninstallCherryStudioSkill> {
  return native.uninstallCherryStudioSkill(
    platform,
    name,
    optionsFor(platform, options),
  );
}
export function uninstallCherryStudioPlatformSkill(
  ...[platform, name, options]: Parameters<
    typeof native.uninstallCherryStudioPlatformSkill
  >
): ReturnType<typeof native.uninstallCherryStudioPlatformSkill> {
  return native.uninstallCherryStudioPlatformSkill(
    platform,
    name,
    optionsFor(platform, options),
  );
}
export function getCherryStudioPlatformSkillMetadata(
  ...[platform, name, options]: Parameters<
    typeof native.getCherryStudioPlatformSkillMetadata
  >
): ReturnType<typeof native.getCherryStudioPlatformSkillMetadata> {
  return native.getCherryStudioPlatformSkillMetadata(
    platform,
    name,
    optionsFor(platform, options),
  );
}
export function getCherryStudioSkillStatus(
  ...[platform, name, options]: Parameters<
    typeof native.getCherryStudioSkillStatus
  >
): ReturnType<typeof native.getCherryStudioSkillStatus> {
  return native.getCherryStudioSkillStatus(
    platform,
    name,
    optionsFor(platform, options),
  );
}
