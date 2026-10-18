import { distributionPresence } from "@prompthub/shared/utils/resource-observation";
import {
  filterResources,
  type ResourceFilter,
} from "@prompthub/shared/utils/resource-library";
import type { ScannedSkill, Skill } from "@prompthub/shared/types";
import { getSkillFilterTags } from "./skill-stats";
import type { SkillFilterType, SkillStoreView } from "../stores/skill.store";

interface FilterVisibleSkillsOptions {
  deployedSkillNames: Set<string>;
  platformStatuses?: Record<string, Record<string, boolean>>;
  filterTags?: string[];
  includeFrontmatter?: boolean;
  filterType: SkillFilterType;
  searchQuery?: string;
  skills: Skill[];
  storeView: SkillStoreView;
}

function isSkillDeployed(
  skill: Skill,
  deployedSkillNames: Set<string>,
): boolean {
  return deployedSkillNames.has(skill.id) || deployedSkillNames.has(skill.name);
}

export function filterVisibleSkills({
  deployedSkillNames,
  platformStatuses,
  filterTags = [],
  includeFrontmatter = false,
  filterType,
  searchQuery = "",
  skills,
  storeView,
}: FilterVisibleSkillsOptions): Skill[] {
  const filter: ResourceFilter =
    storeView === "distribution" || filterType === "deployed"
      ? "distributed"
      : filterType === "favorites" || filterType === "pending"
        ? filterType
        : "all";
  const candidates =
    storeView !== "distribution" && filterType === "installed"
      ? skills.filter((skill) => Boolean(skill.registry_slug))
      : skills;
  return filterResources(
    candidates,
    (skill) => ({
      id: skill.id,
      favorite: skill.is_favorite,
      presence: platformStatuses
        ? distributionPresence(platformStatuses[skill.id])
        : isSkillDeployed(skill, deployedSkillNames)
          ? "distributed"
          : "absent",
      tags: getSkillFilterTags(skill, includeFrontmatter),
      search: [
        skill.name,
        skill.description || "",
        skill.author || "",
        skill.instructions || "",
        skill.content || "",
        skill.source_url || "",
        skill.local_repo_path || "",
        ...(skill.tags || []),
      ],
    }),
    { filter, query: searchQuery, tags: filterTags },
  );
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
