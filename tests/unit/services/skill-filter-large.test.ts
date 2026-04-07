import { describe, expect, it } from "vitest";

import type { Skill } from "../../../src/shared/types";
import { filterVisibleSkills } from "../../../src/renderer/services/skill-filter";

function createSkill(index: number): Skill {
  return {
    id: `skill-${index}`,
    name: `skill-${String(index).padStart(4, "0")}`,
    description:
      index === 777 ? "Batch deploy helper for remote sync" : `Skill ${index}`,
    instructions: `# Skill ${index}`,
    content: `# Skill ${index}`,
    protocol_type: "skill",
    author: index % 3 === 0 ? "Remote" : "Local",
    local_repo_path: `/tmp/skill-${index}`,
    tags: [`tag-${index % 12}`, ...(index === 777 ? ["focus-tag"] : [])],
    is_favorite: index % 8 === 0,
    registry_slug: index % 5 === 0 ? `registry-${index}` : undefined,
    currentVersion: 0,
    created_at: index,
    updated_at: index,
  };
}

const skills = Array.from({ length: 1000 }, (_, index) => createSkill(index));
const deployedSkillNames = new Set(
  skills.slice(0, 620).map((skill) => skill.name),
);

describe("filterVisibleSkills large dataset", () => {
  it("filters 1000 skills down by pending state, search, and tags", () => {
    const result = filterVisibleSkills({
      deployedSkillNames,
      filterTags: ["focus-tag"],
      filterType: "pending",
      searchQuery: "batch deploy helper",
      skills,
      storeView: "my-skills",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("skill-0777");
  });

  it("uses distribution view as the source of truth even with a large dataset", () => {
    const result = filterVisibleSkills({
      deployedSkillNames,
      filterType: "pending",
      skills,
      storeView: "distribution",
    });

    expect(result).toHaveLength(620);
    expect(result.every((skill) => deployedSkillNames.has(skill.name))).toBe(true);
  });
});
