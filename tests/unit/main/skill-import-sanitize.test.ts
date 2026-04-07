import { describe, expect, it } from "vitest";

import { sanitizeImportedSkillDraft } from "../../../src/main/services/skill-import-sanitize";

describe("skill-import-sanitize", () => {
  it("sanitizes malformed imported metadata into safe values before persistence", () => {
    const sanitized = sanitizeImportedSkillDraft(
      {
        name: "  custom-skill  ",
        description: { bad: true },
        fallbackDescription: "Safe description",
        version: 123,
        fallbackVersion: "1.0.0",
        author: ["bad"],
        fallbackAuthor: "Local",
        tags: ["alpha", "", 42, " beta "] as any,
        instructions: "# Title",
        icon_url: ["bad"] as any,
        category: { bad: true },
        prerequisites: ["git", 7, " node "] as any,
        compatibility: "cursor" as any,
        protocol_type: "broken",
      },
      { defaultTags: ["imported"] },
    );

    expect(sanitized).toEqual({
      name: "custom-skill",
      description: "Safe description",
      version: "1.0.0",
      author: "Local",
      tags: ["alpha", "beta"],
      instructions: "# Title",
      icon_url: undefined,
      icon_emoji: undefined,
      icon_background: undefined,
      category: undefined,
      prerequisites: ["git", "node"],
      compatibility: undefined,
      source_url: undefined,
      local_repo_path: undefined,
      protocol_type: "skill",
    });
  });

  it("falls back to default imported tags when the source tag field is unusable", () => {
    const sanitized = sanitizeImportedSkillDraft(
      {
        name: "json-import",
        tags: { broken: true },
      },
      { defaultTags: ["imported"] },
    );

    expect(sanitized.tags).toEqual(["imported"]);
  });
});
