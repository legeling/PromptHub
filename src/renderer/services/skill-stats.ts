import type { Skill } from "../../shared/types";

function inferOriginalSkillTags(
  skill: Pick<Skill, "tags" | "original_tags" | "registry_slug" | "source_url">,
): string[] {
  if (Array.isArray(skill.original_tags)) {
    return skill.original_tags;
  }

  if (skill.registry_slug || skill.source_url) {
    return skill.tags || [];
  }

  return [];
}

function getUserSkillTags(
  skill: Pick<Skill, "tags" | "original_tags" | "registry_slug" | "source_url">,
): string[] {
  const originalTags = new Set(inferOriginalSkillTags(skill));
  return (skill.tags || []).filter((tag) => !originalTags.has(tag));
}

export interface SkillStats {
  favoriteCount: number;
  deployedCount: number;
  pendingCount: number;
  uniqueUserTags: string[];
}

export function buildSkillStats(
  skills: Skill[],
  deployedSkillNames: Set<string>,
): SkillStats {
  let favoriteCount = 0;
  let deployedCount = 0;
  const tagSet = new Set<string>();

  for (const skill of skills) {
    if (skill.is_favorite) favoriteCount++;
    if (deployedSkillNames.has(skill.name)) {
      deployedCount++;
    }

    for (const tag of getUserSkillTags(skill)) {
      tagSet.add(tag);
    }
  }

  return {
    favoriteCount,
    deployedCount,
    pendingCount: skills.length - deployedCount,
    uniqueUserTags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
  };
}
