import { describe, expect, it } from "vitest";

import type { Skill } from "../../../src/shared/types";
import { buildSkillSyncUpdateFromRepo } from "../../../src/main/services/skill-repo-sync";

const baseSkill: Skill = {
  id: "skill-1",
  name: "write",
  description: "Old description",
  instructions: "---\ndescription: Old description\n---\n\n# Write",
  content: "---\ndescription: Old description\n---\n\n# Write",
  protocol_type: "skill",
  version: "1.0.0",
  author: "Local",
  tags: ["general"],
  compatibility: ["claude"],
  is_favorite: false,
  currentVersion: 1,
  created_at: Date.now(),
  updated_at: Date.now(),
};

describe("skill-repo-sync", () => {
  it("builds update payload from latest SKILL.md frontmatter", () => {
    const next = buildSkillSyncUpdateFromRepo(
      baseSkill,
      [
        "---",
        "description: Updated description",
        "version: 2.0.0",
        "author: Repo Author",
        "tags: [writing, local]",
        "compatibility: [claude, cursor]",
        "---",
        "",
        "# Write",
        "",
        "Updated body.",
      ].join("\n"),
    );

    expect(next).toMatchObject({
      description: "Updated description",
      version: "2.0.0",
      author: "Repo Author",
      tags: ["writing", "local"],
      compatibility: ["claude", "cursor"],
    });
    expect(next?.instructions).toContain("Updated body.");
    expect(next?.content).toContain("Updated body.");
  });

  it("returns null when repo content matches current stored fields", () => {
    const next = buildSkillSyncUpdateFromRepo(baseSkill, baseSkill.content || "");
    expect(next).toBeNull();
  });
});
