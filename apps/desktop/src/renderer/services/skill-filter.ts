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
    result = result.filter((skill) => deployedSkillNames.has(skill.id));
  } else if (filterType === "favorites") {
    result = result.filter((skill) => skill.is_favorite);
  } else if (filterType === "installed") {
    result = result.filter((skill) => Boolean(skill.registry_slug));
  } else if (filterType === "deployed") {
    result = result.filter((skill) => deployedSkillNames.has(skill.id));
  } else if (filterType === "pending") {
    result = result.filter((skill) => !deployedSkillNames.has(skill.id));
  }

  if (filterTags.length > 0) {
    result = result.filter(
      (skill) =>
        skill.tags && filterTags.some((tag) => skill.tags?.includes(tag)),
    );
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
