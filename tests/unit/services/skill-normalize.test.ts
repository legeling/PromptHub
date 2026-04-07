import { describe, expect, it } from "vitest";

import { normalizeSkill, normalizeStringArray } from "../../../src/renderer/services/skill-normalize";

describe("skill-normalize", () => {
  it("accepts legacy string arrays from old skill data", () => {
    expect(normalizeStringArray('["ops","docs"]')).toEqual(["ops", "docs"]);
    expect(normalizeStringArray("ops, docs\nplatform")).toEqual([
      "ops",
      "docs",
      "platform",
    ]);
  });

  it("normalizes malformed skill metadata into detail-safe values", () => {
    const normalized = normalizeSkill({
      id: "skill-1",
      name: "alpha",
      tags: '["ops","docs"]' as any,
      original_tags: "seed, legacy" as any,
      prerequisites: "git, node" as any,
      compatibility: '["cursor"]' as any,
      currentVersion: "3" as any,
      protocol_type: "skill",
      is_favorite: false,
      created_at: "1700000000000" as any,
      updated_at: "1700000001000" as any,
      category: { bad: true } as any,
      icon_url: ["oops"] as any,
      source_url: "" as any,
    });

    expect(normalized.tags).toEqual(["ops", "docs"]);
    expect(normalized.original_tags).toEqual(["seed", "legacy"]);
    expect(normalized.prerequisites).toEqual(["git", "node"]);
    expect(normalized.compatibility).toEqual(["cursor"]);
    expect(normalized.currentVersion).toBe(3);
    expect(normalized.created_at).toBe(1700000000000);
    expect(normalized.updated_at).toBe(1700000001000);
    expect(normalized.category).toBeUndefined();
    expect(normalized.icon_url).toBeUndefined();
    expect(normalized.source_url).toBeUndefined();
  });
});
