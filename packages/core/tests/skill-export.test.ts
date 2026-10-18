import { expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { createSkillZip, exportAsJson } from "../src/skills/export";

it("exports nested package text and exact binary bytes without adding metadata files", () => {
  const zip = createSkillZip([
    { relativePath: "SKILL.md", content: "# Writer" },
    { relativePath: "docs/example.md", content: "你好" },
    { relativePath: "assets/icon.bin", content: "AP8D", encoding: "base64" },
  ]);
  const files = unzipSync(zip);
  expect(Object.keys(files).sort()).toEqual([
    "SKILL.md",
    "assets/icon.bin",
    "docs/example.md",
  ]);
  expect(strFromU8(files["docs/example.md"])).toBe("你好");
  expect([...files["assets/icon.bin"]]).toEqual([0, 255, 3]);
  expect(() =>
    createSkillZip([{ relativePath: "../outside", content: "bad" }]),
  ).toThrow();
});

it("exports portable JSON with source identity and never exports local filesystem paths", () => {
  const json = JSON.parse(
    exportAsJson({
      name: "writer",
      instructions: "# Writer",
      source_url: "https://github.com/a/b",
      source_branch: "release",
      source_directory: "skills/writer",
    }),
  );
  expect(json).toMatchObject({
    name: "writer",
    instructions: "# Writer",
    source_branch: "release",
    source_directory: "skills/writer",
    format_version: "1.0",
  });
  expect(json).not.toHaveProperty("local_repo_path");
});
