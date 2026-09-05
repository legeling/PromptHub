import { describe, expect, it } from "vitest";
import { filterSkillTagOptions } from "../../../src/renderer/services/skill-tag-options";

describe("filterSkillTagOptions", () => {
  const options = ["alpha", "editor", "Editorial", "writer"];

  it("returns all options for a blank or whitespace query", () => {
    expect(filterSkillTagOptions(options, "")).toEqual(options);
    expect(filterSkillTagOptions(options, "   ")).toEqual(options);
  });

  it("matches case-insensitive substrings", () => {
    expect(filterSkillTagOptions(options, "EDIT")).toEqual([
      "editor",
      "Editorial",
    ]);
    expect(filterSkillTagOptions(options, "ed")).toEqual([
      "editor",
      "Editorial",
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterSkillTagOptions(options, "nope")).toEqual([]);
  });

  it("handles an empty option set", () => {
    expect(filterSkillTagOptions([], "anything")).toEqual([]);
    expect(filterSkillTagOptions([], "")).toEqual([]);
  });
});
