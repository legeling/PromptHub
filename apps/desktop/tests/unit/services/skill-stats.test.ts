import { describe, expect, it } from "vitest";

import type { Skill } from "@prompthub/shared/types";
import { buildSkillStats, buildSkillTagCandidates } from "../../../src/renderer/services/skill-stats";

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

describe("buildSkillTagCandidates", () => {
  const baseSkills: Skill[] = [
    {
      id: "skill-a",
      name: "a",
      protocol_type: "skill",
      tags: ["user-a", "shared"],
      original_tags: ["shared", "doc"],
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    },
    {
      id: "skill-b",
      name: "b",
      protocol_type: "skill",
      tags: ["user-b", "shared"],
      original_tags: ["shared", "readme"],
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    },
    {
      id: "skill-c",
      name: "c",
      protocol_type: "skill",
      tags: ["registry-1"],
      registry_slug: "store-skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    },
  ];

  it("defaults to the same user-tag set as buildSkillStats", () => {
    const candidates = buildSkillTagCandidates(baseSkills, false);
    expect(candidates).toEqual(
      buildSkillStats(baseSkills, new Set()).uniqueUserTags,
    );
    // shared/doc/readme are original (frontmatter) labels and stay excluded.
    expect(candidates).toEqual(["user-a", "user-b"]);
  });

  it("unions SKILL.md frontmatter labels when enabled", () => {
    const candidates = buildSkillTagCandidates(baseSkills, true);
    expect(candidates).toEqual([
      "doc",
      "readme",
      "registry-1",
      "shared",
      "user-a",
      "user-b",
    ]);
  });

  it("still treats registry-owned tags as original so they only appear when enabled", () => {
    expect(buildSkillTagCandidates(baseSkills, false)).not.toContain(
      "registry-1",
    );
    expect(buildSkillTagCandidates(baseSkills, true)).toContain("registry-1");
  });
});
