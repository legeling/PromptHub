import { describe, expect, it } from "vitest";

import type { Skill } from "../../../src/shared/types";
import { buildSkillStats } from "../../../src/renderer/services/skill-stats";

function createSkill(index: number): Skill {
  return {
    id: `skill-${index}`,
    name: `skill-${String(index).padStart(4, "0")}`,
    description: `Skill ${index}`,
    protocol_type: "skill",
    tags: [
      `base-${index % 12}`,
      ...(index % 4 === 0 ? [`user-${index % 5}`] : []),
    ],
    original_tags: [`base-${index % 12}`],
    is_favorite: index % 7 === 0,
    created_at: index,
    updated_at: index,
  };
}

const skills = Array.from({ length: 1000 }, (_, index) => createSkill(index));
const deployedSkillNames = new Set(
  skills.slice(0, 620).map((skill) => skill.name),
);

describe("buildSkillStats", () => {
  it("aggregates 1000 skills without repeated scans in the view layer", () => {
    const stats = buildSkillStats(skills, deployedSkillNames);

    expect(stats.favoriteCount).toBe(143);
    expect(stats.deployedCount).toBe(620);
    expect(stats.pendingCount).toBe(380);
    expect(stats.uniqueUserTags).toEqual([
      "user-0",
      "user-1",
      "user-2",
      "user-3",
      "user-4",
    ]);
  });
});
