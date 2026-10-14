import { describe, expect, it } from "vitest";
import { getSkillGalleryGridStyle } from "../../../src/renderer/components/skill/skill-manager-utils";
import { getMcpGalleryGridStyle } from "../../../src/renderer/components/mcp/mcp-manager-utils";
import { getPluginLibraryGalleryGridStyle } from "../../../src/renderer/components/plugin/plugin-manager-utils";

describe.each([
  ["Skill", getSkillGalleryGridStyle],
  ["MCP", getMcpGalleryGridStyle],
  ["Plugin", getPluginLibraryGalleryGridStyle],
] as const)("%s gallery column selection", (_name, gridStyle) => {
  it("uses the compact automatic layout without replacing explicit column choices", () => {
    expect(gridStyle("auto").gridTemplateColumns).toBe(
      "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
    );
    expect(gridStyle("2").gridTemplateColumns).toContain("/ 2)");
    expect(gridStyle("3").gridTemplateColumns).toContain("/ 3)");
  });
});
