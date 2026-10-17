import {
  getSkillPlatformErrorFeedback,
  formatSkillPlatformFallbackReason,
} from "./skill-platform-error";
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
  severity: "warning" | "error";
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
    let exportedContent: Promise<string> | undefined;

    for (const platformId of platformIds) {
      current += 1;
      onProgress?.({
        current,
        total: totalCount,
        skillId: skill.id,
        platformId,
      });

      try {
        exportedContent ??= window.api.skill.export(skill.id, "skillmd");
        const skillMdContent = await exportedContent;
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
              reason: formatSkillPlatformFallbackReason(),
            });
          }
        } else {
          await window.api.skill.installMd(
            skill.id,
            skillMdContent,
            platformId,
          );
        }
        successCount += 1;
      } catch (error) {
        console.error("Skill platform operation failed:", error);
        failures.push({
          skillId: skill.id,
          platformId,
          ...getSkillPlatformErrorFeedback(error),
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
        console.error("Skill platform operation failed:", error);
        failures.push({
          skillId: skill.id,
          platformId,
          ...getSkillPlatformErrorFeedback(error),
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
