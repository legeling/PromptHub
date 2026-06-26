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

  it("does not silently truncate long imported strings or list items", () => {
    const longInstructions = `# Long Skill\n\n${"Keep this package content.\n".repeat(599)}Keep this package content.`;
    const longTag = `tag-${"x".repeat(180)}`;
    const longPrerequisite = `tool-${"y".repeat(300)}`;
    const longSourceUrl = `https://example.com/${"path/".repeat(300)}`;

    const sanitized = sanitizeImportedSkillDraft({
      name: `skill-${"n".repeat(300)}`,
      description: `desc-${"d".repeat(12_000)}`,
      version: `1.0.0-${"v".repeat(300)}`,
      author: `author-${"a".repeat(300)}`,
      tags: [longTag],
      instructions: longInstructions,
      source_url: longSourceUrl,
      prerequisites: [longPrerequisite],
      compatibility: [`runtime-${"z".repeat(300)}`],
    });

    expect(sanitized.instructions).toBe(longInstructions);
    expect(sanitized.description).toBe(`desc-${"d".repeat(12_000)}`);
    expect(sanitized.version).toBe(`1.0.0-${"v".repeat(300)}`);
    expect(sanitized.author).toBe(`author-${"a".repeat(300)}`);
    expect(sanitized.tags).toEqual([longTag]);
    expect(sanitized.source_url).toBe(longSourceUrl);
    expect(sanitized.prerequisites).toEqual([longPrerequisite]);
    expect(sanitized.compatibility).toEqual([`runtime-${"z".repeat(300)}`]);
  });
});
