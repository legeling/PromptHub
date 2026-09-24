import type { Skill } from "@prompthub/shared/types";
import { normalizeStringArray } from "./skill-normalize";

function isRemoteSourceUrl(sourceUrl?: string): boolean {
  return /^https?:\/\//i.test(sourceUrl || "");
}

function inferOriginalSkillTags(
  skill: Pick<Skill, "tags" | "original_tags" | "registry_slug" | "source_url">,
): string[] {
  if (Array.isArray(skill.original_tags)) {
    return normalizeStringArray(skill.original_tags);
  }

  if (skill.registry_slug || isRemoteSourceUrl(skill.source_url)) {
    return normalizeStringArray(skill.tags);
  }

  return [];
}

function getUserSkillTags(
  skill: Pick<Skill, "tags" | "original_tags" | "registry_slug" | "source_url">,
): string[] {
  // Only legacy records lack a separate source-tag field. An explicit user tag
  // remains user-owned even when the source happens to use the same label.
  if (
    !Array.isArray(skill.original_tags) &&
    (skill.registry_slug || isRemoteSourceUrl(skill.source_url))
  )
    return [];
  return normalizeStringArray(skill.tags);
}

export function getSkillFilterTags(
  skill: Skill,
  includeFrontmatter = false,
): string[] {
  return includeFrontmatter
    ? Array.from(
        new Set([...getUserSkillTags(skill), ...inferOriginalSkillTags(skill)]),
      )
    : getUserSkillTags(skill);
}

export interface SkillStats {
  favoriteCount: number;
  deployedCount: number;
  pendingCount: number;
  uniqueUserTags: string[];
}

function isSkillDeployed(
  skill: Skill,
  deployedSkillNames: Set<string>,
): boolean {
  return deployedSkillNames.has(skill.id) || deployedSkillNames.has(skill.name);
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
    if (isSkillDeployed(skill, deployedSkillNames)) {
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

/**
 * Build the candidate tag list shown in the My Skills tag filter.
 *
 * By default it returns the same user-tag set as `buildSkillStats(...).uniqueUserTags`,
 * so the header and the sidebar tag panel stay consistent. When
 * `includeFrontmatter` is enabled the SKILL.md frontmatter labels
 * (`original_tags`) are unioned in, so locally authored skills whose tags were
 * backfilled into `original_tags` can still be filtered without hiding the
 * platform-managed user tags.
 *
 * “我的 Skill”标签过滤控件的候选标签。默认与侧栏面板一致，只取用户标签
 * (`buildSkillStats(...).uniqueUserTags`)；开启 `includeFrontmatter` 后并集
 * SKILL.md frontmatter 标签（`original_tags`），使本地创建技能因迁移回填
 * `original_tags` 而被隐藏的标签也能重新参与过滤，同时不丢弃平台侧用户标签。
 */
export function buildSkillTagCandidates(
  skills: Skill[],
  includeFrontmatter: boolean,
): string[] {
  const tagSet = new Set<string>();
  for (const skill of skills) {
    for (const tag of getSkillFilterTags(skill, includeFrontmatter)) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}
