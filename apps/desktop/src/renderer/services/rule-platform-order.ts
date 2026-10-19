import { DEFAULT_SKILL_PLATFORM_ORDER } from "@prompthub/shared/constants/platforms";
import { RULE_PLATFORM_ORDER } from "@prompthub/shared/constants/rules";
import { getAgentPlatformFamily } from "@prompthub/shared/constants/platforms";
import { isRulePlatformId } from "@prompthub/shared/types";
import type { RuleFileDescriptor } from "@prompthub/shared/types";

/**
 * Order global rule cards the same way Agent management / Skills do:
 * user `skillPlatformOrder` first, then shared DEFAULT_SKILL_PLATFORM_ORDER,
 * then rules-only whitelist, then any remaining discovered platforms.
 */
export function getOrderedGlobalRuleFiles(
  files: RuleFileDescriptor[],
  preferredOrder: string[] = [],
): RuleFileDescriptor[] {
  const filesByPlatformId = new Map<string, RuleFileDescriptor[]>();
  for (const file of files) {
    if (file.id.startsWith("project:")) continue;
    const platformFiles = filesByPlatformId.get(file.platformId);
    if (platformFiles) platformFiles.push(file);
    else filesByPlatformId.set(file.platformId, [file]);
  }
  const seenPlatformIds = new Set<string>();
  const ordered: RuleFileDescriptor[] = [];

  const pushPlatform = (platformId: string) => {
    if (
      !platformId ||
      seenPlatformIds.has(platformId) ||
      !isRulePlatformId(platformId)
    ) {
      return;
    }
    seenPlatformIds.add(platformId);
    const platformFiles = filesByPlatformId.get(platformId);
    if (platformFiles) {
      for (const file of platformFiles) ordered.push(file);
    }
  };

  for (const platformId of [
    ...preferredOrder,
    ...DEFAULT_SKILL_PLATFORM_ORDER,
    ...RULE_PLATFORM_ORDER,
    ...filesByPlatformId.keys(),
  ]) {
    pushPlatform(platformId);
  }

  return ordered;
}

export function partitionGlobalRuleFilesByFamily(
  files: RuleFileDescriptor[],
): {
  codeWork: RuleFileDescriptor[];
  claw: RuleFileDescriptor[];
} {
  const codeWork: RuleFileDescriptor[] = [];
  const claw: RuleFileDescriptor[] = [];

  for (const file of files) {
    if (getAgentPlatformFamily(file.platformId) === "claw") {
      claw.push(file);
    } else {
      codeWork.push(file);
    }
  }

  return { codeWork, claw };
}
