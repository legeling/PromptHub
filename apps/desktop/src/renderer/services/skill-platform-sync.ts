import type {
  Skill,
  SkillInstallMode,
  SkillPlatformInstallResult,
} from "@prompthub/shared/types";

export type { SkillInstallMode } from "@prompthub/shared/types";

export interface BatchSkillSyncFallback {
  skillId: string;
  platformId: string;
  requestedMode: SkillInstallMode;
  effectiveMode: SkillInstallMode;
  reason: string;
}

export interface BatchSkillSyncFailure {
  skillId: string;
  platformId: string;
  reason: string;
}

export interface BatchSkillSyncProgress {
  current: number;
  total: number;
  skillId: string;
  platformId: string;
}

export interface BatchSkillSyncResult {
  successCount: number;
  totalCount: number;
  failures: BatchSkillSyncFailure[];
  fallbacks: BatchSkillSyncFallback[];
}

function isCopyFallback(
  result: SkillPlatformInstallResult | void,
): result is SkillPlatformInstallResult & {
  requestedMode: "symlink";
  effectiveMode: "copy";
  fallbackReason: string;
} {
  return (
    typeof result === "object" &&
    result !== null &&
    result.requestedMode === "symlink" &&
    result.effectiveMode === "copy" &&
    typeof result.fallbackReason === "string" &&
    result.fallbackReason.length > 0
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function syncSkillsToPlatforms(
  skills: Skill[],
  platformIds: string[],
  installMode: SkillInstallMode,
  onProgress?: (progress: BatchSkillSyncProgress) => void,
): Promise<BatchSkillSyncResult> {
  if (skills.length === 0 || platformIds.length === 0) {
    return { successCount: 0, totalCount: 0, failures: [], fallbacks: [] };
  }

  const totalCount = skills.length * platformIds.length;
  let current = 0;
  let successCount = 0;
  const failures: BatchSkillSyncFailure[] = [];
  const fallbacks: BatchSkillSyncFallback[] = [];

  for (const skill of skills) {
    const skillMdContent = await window.api.skill.export(skill.id, "skillmd");

    for (const platformId of platformIds) {
      current += 1;
      onProgress?.({
        current,
        total: totalCount,
        skillId: skill.id,
        platformId,
      });

        try {
          if (installMode === "symlink") {
            const result = await window.api.skill.installMdSymlink(
              skill.id,
              skillMdContent,
              platformId,
            );
            if (isCopyFallback(result)) {
              fallbacks.push({
                skillId: skill.id,
                platformId,
                requestedMode: result.requestedMode,
                effectiveMode: result.effectiveMode,
                reason: result.fallbackReason,
              });
            }
          } else {
            await window.api.skill.installMd(skill.id, skillMdContent, platformId);
          }
        successCount += 1;
      } catch (error) {
        failures.push({
          skillId: skill.id,
          platformId,
          reason: getErrorMessage(error),
        });
      }
    }
  }

  return {
    successCount,
    totalCount,
    failures,
    fallbacks,
  };
}

export async function unsyncSkillsFromPlatforms(
  skills: Skill[],
  platformIds: string[],
  onProgress?: (progress: BatchSkillSyncProgress) => void,
): Promise<BatchSkillSyncResult> {
  if (skills.length === 0 || platformIds.length === 0) {
    return { successCount: 0, totalCount: 0, failures: [], fallbacks: [] };
  }

  const totalCount = skills.length * platformIds.length;
  let current = 0;
  let successCount = 0;
  const failures: BatchSkillSyncFailure[] = [];

  for (const skill of skills) {
    for (const platformId of platformIds) {
      current += 1;
      onProgress?.({
        current,
        total: totalCount,
        skillId: skill.id,
        platformId,
      });

      try {
        await window.api.skill.uninstallMd(skill.id, platformId);
        successCount += 1;
      } catch (error) {
        failures.push({
          skillId: skill.id,
          platformId,
          reason: getErrorMessage(error),
        });
      }
    }
  }

  return {
    successCount,
    totalCount,
    failures,
    fallbacks: [],
  };
}
