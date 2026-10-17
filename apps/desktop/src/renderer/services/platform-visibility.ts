import type { SkillPlatform } from "@prompthub/shared/constants/platforms";

export function filterVisiblePlatforms<T extends { id: string }>(
  platforms: T[],
  disabledPlatformIds: string[],
): T[] {
  if (disabledPlatformIds.length === 0) {
    return platforms;
  }

  const disabledSet = new Set(disabledPlatformIds);
  return platforms.filter((platform) => !disabledSet.has(platform.id));
}

export function isPlatformVisible(
  platformId: string,
  disabledPlatformIds: string[],
): boolean {
  return !disabledPlatformIds.includes(platformId);
}

/**
 * Detection-only visibility: platforms whose roots already exist on disk.
 * Do not use this for Skill distribution pickers; use filterDeployablePlatforms.
 */
export function filterDetectedPlatforms(
  platforms: SkillPlatform[],
  detectedPlatformIds: string[],
  disabledPlatformIds: string[],
): SkillPlatform[] {
  return filterVisiblePlatforms(
    platforms.filter((platform) => detectedPlatformIds.includes(platform.id)),
    disabledPlatformIds,
  );
}

export function isExplicitlyConfiguredPlatform(
  platform: SkillPlatform,
): boolean {
  return platform.isCustom === true || platform.isConfigured === true;
}

/**
 * Distribution visibility: detected platforms plus user-configured targets
 * (custom Agents or built-in Agents with explicit overrides), minus disabled.
 */
export function filterDeployablePlatforms(
  platforms: SkillPlatform[],
  detectedPlatformIds: string[],
  disabledPlatformIds: string[],
): SkillPlatform[] {
  const detectedSet = new Set(detectedPlatformIds);

  return filterVisiblePlatforms(
    platforms.filter(
      (platform) =>
        detectedSet.has(platform.id) ||
        isExplicitlyConfiguredPlatform(platform),
    ),
    disabledPlatformIds,
  );
}

/** Resolve the same Agent availability used by Skill distribution, before capability filtering. */
export async function loadDeployableAgentPlatformIds(): Promise<string[]> {
  const [platforms, detectedIds] = await Promise.all([
    window.api.skill.getSupportedPlatforms(),
    window.api.skill.detectPlatforms(),
  ]);
  // Settings visibility is applied by consumers so toggles take effect immediately.
  return filterDeployablePlatforms(platforms, detectedIds, []).map(
    (platform) => platform.id,
  );
}
