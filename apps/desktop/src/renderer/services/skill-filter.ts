import type { ScannedSkill, Skill } from "@prompthub/shared/types";
import type {
  SkillFilterType,
  SkillStoreView,
} from "../stores/skill.store";

interface FilterVisibleSkillsOptions {
  deployedSkillNames: Set<string>;
  filterTags?: string[];
  filterType: SkillFilterType;
  searchQuery?: string;
  skills: Skill[];
  storeView: SkillStoreView;
}

function isSkillDeployed(skill: Skill, deployedSkillNames: Set<string>): boolean {
  return deployedSkillNames.has(skill.id) || deployedSkillNames.has(skill.name);
}

export function filterVisibleSkills({
  deployedSkillNames,
  filterTags = [],
  filterType,
  searchQuery = "",
  skills,
  storeView,
}: FilterVisibleSkillsOptions): Skill[] {
  let result = skills;

  if (storeView === "distribution") {
    result = result.filter((skill) => isSkillDeployed(skill, deployedSkillNames));
  } else if (filterType === "favorites") {
    result = result.filter((skill) => skill.is_favorite);
  } else if (filterType === "installed") {
    result = result.filter((skill) => Boolean(skill.registry_slug));
  } else if (filterType === "deployed") {
    result = result.filter((skill) => isSkillDeployed(skill, deployedSkillNames));
  } else if (filterType === "pending") {
    result = result.filter((skill) => !isSkillDeployed(skill, deployedSkillNames));
  }

  if (filterTags.length > 0) {
    // Normalize both sides so a tag stored with surrounding whitespace in a
    // skill still matches the trimmed candidate shown in the filter UI. The
    // sidebar tags and the My Skills tag filter both surface trimmed values,
    // while persisted `skill.tags` may keep raw spaces.
    // 对双方统一 trim：列表候选/侧栏展示的都是 trim 后的标签值，而持久化的
    // skill.tags 可能带前后空格，这样点选“editor”也能命中原始“  editor  ”。
    const normalizedTags = filterTags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (normalizedTags.length > 0) {
      result = result.filter(
        (skill) =>
          skill.tags &&
          skill.tags.some((rawTag) => {
            const trimmed = rawTag.trim();
            return trimmed.length > 0 && normalizedTags.includes(trimmed);
          }),
      );
    }
  }

  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return result;
  }

  return result.filter((skill) => {
    const fields = [
      skill.name,
      skill.description || "",
      skill.author || "",
      skill.instructions || "",
      skill.content || "",
      skill.source_url || "",
      skill.local_repo_path || "",
      ...(skill.tags || []),
    ];

    return fields.some((value) => value.toLowerCase().includes(query));
  });
}

export function filterVisibleScannedSkills(
  scannedSkills: ScannedSkill[],
  searchQuery = "",
): ScannedSkill[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return scannedSkills;
  }

  return scannedSkills.filter((skill) => {
    const fields = [
      skill.name,
      skill.description || "",
      skill.author || "",
      skill.instructions || "",
      skill.filePath || "",
      skill.localPath || "",
      ...(skill.tags || []),
      ...(skill.platforms || []),
    ];

    return fields.some(
      (value) =>
        typeof value === "string" && value.toLowerCase().includes(query),
    );
  });
}
