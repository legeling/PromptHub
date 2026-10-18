import { expect, it } from "vitest";
import { parseManagedSkillFiles } from "@prompthub/shared/utils/managed-skill-files";

it("preserves text, nested binary files and explicit ignore rules", () => {
  const files = [
    { relativePath: "SKILL.md", content: "# Writer" },
    { relativePath: "assets/icon.bin", content: "AP8D", encoding: "base64" },
    { relativePath: ".prompthubignore", content: "scratch/\n" },
  ];
  expect(parseManagedSkillFiles(files)).toEqual(files);
});

it.each(
  [
    [],
    [{ relativePath: "SKILL.md", content: "AA==", encoding: "base64" }],
    [{ relativePath: "SKILL.md", content: "bad\0entry" }],
    [{ relativePath: "../escape", content: "bad" }],
    [{ relativePath: "assets/icon.bin", content: "!!!", encoding: "base64" }],
    [{ relativePath: "skill.md", content: "duplicate" }],
    [{ relativePath: ".git/config", content: "private" }],
    [{ relativePath: ".canonical-bundle-hash", content: "metadata" }],
    [
      { relativePath: ".prompthubignore", content: "scratch/" },
      { relativePath: "scratch/file", content: "ignored" },
    ],
  ].map((extra) => ({ extra })),
)("rejects an incomplete, ambiguous or unsafe package (%#)", ({ extra }) => {
  const hasEntrypoint = extra.some((file) => file.relativePath === "SKILL.md");
  const files =
    extra.length && !hasEntrypoint
      ? [{ relativePath: "SKILL.md", content: "# Writer" }, ...extra]
      : extra;
  expect(() => parseManagedSkillFiles(files)).toThrow();
});
