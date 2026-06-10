import { describe, expect, it } from "vitest";

import {
  getRemoteStoreSkillCount,
  getRemoteStoreSkills,
} from "../../../src/renderer/services/remote-store-entry";

describe("remote store entry helpers", () => {
  it("returns an empty skill list for missing or malformed legacy entries", () => {
    expect(getRemoteStoreSkills(undefined)).toEqual([]);
    expect(getRemoteStoreSkills(null)).toEqual([]);
    expect(getRemoteStoreSkills({})).toEqual([]);
    expect(getRemoteStoreSkills({ skills: "legacy-invalid" })).toEqual([]);
    expect(getRemoteStoreSkillCount({ skills: { slug: "not-an-array" } })).toBe(
      0,
    );
  });

  it("returns the cached skill list when skills is an array", () => {
    const skills = [
      {
        slug: "writer",
        name: "Writer",
        description: "Writes content",
        category: "general",
        author: "PromptHub",
        source_url: "https://example.com/writer",
        tags: [],
        version: "1.0.0",
        content: "# Writer",
      },
    ];

    expect(getRemoteStoreSkills({ skills })).toBe(skills);
    expect(getRemoteStoreSkillCount({ skills })).toBe(1);
  });
});
