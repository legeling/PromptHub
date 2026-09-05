import { describe, expect, it } from "vitest";
import type { Skill } from "@prompthub/shared/types";
import {
  filterVisibleScannedSkills,
  filterVisibleSkills,
} from "../../../src/renderer/services/skill-filter";

const skills = [
  {
    id: "skill-1",
    name: "alpha",
    description: "alpha deploy",
    tags: ["ops"],
    protocol_type: "skill",
    is_favorite: false,
    created_at: 1,
    updated_at: 1,
  },
  {
    id: "skill-2",
    name: "beta",
    description: "beta pending",
    tags: ["docs"],
    protocol_type: "skill",
    is_favorite: true,
    created_at: 1,
    updated_at: 1,
  },
] as any;

describe("filterVisibleSkills", () => {
  it("uses distribution view as deployed-only source of truth", () => {
    const result = filterVisibleSkills({
      deployedSkillNames: new Set(["alpha"]),
      filterType: "pending",
      skills,
      storeView: "distribution",
    });

    expect(result.map((skill) => skill.name)).toEqual(["alpha"]);
  });

  it("filters pending skills from my-skills view", () => {
    const result = filterVisibleSkills({
      deployedSkillNames: new Set(["alpha"]),
      filterType: "pending",
      skills,
      storeView: "my-skills",
    });

    expect(result.map((skill) => skill.name)).toEqual(["beta"]);
  });

  it("applies search on top of current visible skill set", () => {
    const result = filterVisibleSkills({
      deployedSkillNames: new Set(["alpha"]),
      filterType: "pending",
      searchQuery: "beta",
      skills,
      storeView: "my-skills",
    });

    expect(result.map((skill) => skill.name)).toEqual(["beta"]);
  });

  it("does not crash when scanned skills contain missing text fields", () => {
    const result = filterVisibleScannedSkills(
      [
        {
          name: "slide-deck-generator",
          description: "",
          author: "",
          instructions: "",
          filePath: "/tmp/skills/slide-deck-generator/SKILL.md",
          localPath: "/tmp/skills/slide-deck-generator",
          tags: [],
          platforms: [],
        },
        {
          name: "broken-skill",
          description: undefined as unknown as string,
          author: undefined as unknown as string,
          instructions: undefined as unknown as string,
          filePath: undefined as unknown as string,
          localPath: undefined as unknown as string,
          tags: undefined as unknown as string[],
          platforms: undefined as unknown as string[],
        },
      ],
      "slide",
    );

    expect(result.map((skill) => skill.name)).toEqual(["slide-deck-generator"]);
  });
});

describe("filterVisibleSkills tag filter normalization", () => {
  function skillWithTags(name: string, tags: string[]): Skill {
    return {
      id: `skill-${name}`,
      name,
      tags,
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    };
  }

  it("matches an active tag against raw skill tags that carry surrounding whitespace", () => {
    const spacedSkills: Skill[] = [
      skillWithTags("alpha", ["  ops  "]),
      skillWithTags("beta", ["docs"]),
    ];
    const result = filterVisibleSkills({
      deployedSkillNames: new Set(),
      filterType: "all",
      filterTags: ["ops"],
      skills: spacedSkills,
      storeView: "my-skills",
    });

    expect(result.map((skill) => skill.name)).toEqual(["alpha"]);
  });

  it("ignores whitespace-only entries in the active tag list", () => {
    const result = filterVisibleSkills({
      deployedSkillNames: new Set(),
      filterType: "all",
      filterTags: ["   "],
      skills: [
        skillWithTags("alpha", ["ops"]),
        skillWithTags("beta", ["docs"]),
      ],
      storeView: "my-skills",
    });

    expect(result.map((skill) => skill.name)).toEqual(["alpha", "beta"]);
  });
});
