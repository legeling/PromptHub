import type { SkillFileSnapshot } from "../types/skill";
import {
  validateSkillFileSnapshots,
  withSkillSnapshotEntrypoint,
} from "./skill-file-snapshot";
import { createSkillPackageIgnoreMatcher } from "./skill-package-policy";
import { sha256HexSync } from "./mcp-entry-sha256";

export function managedSkillFilesRevision(
  files: readonly SkillFileSnapshot[],
): string {
  return sha256HexSync(
    JSON.stringify(
      [...files]
        .sort((a, b) =>
          a.relativePath < b.relativePath
            ? -1
            : a.relativePath > b.relativePath
              ? 1
              : 0,
        )
        .map((file) => ({
          relativePath: file.relativePath,
          content: file.content,
          encoding: file.encoding ?? "utf8",
        })),
    ),
  );
}

/** Transport validation for complete managed packages, shared by Node and Worker. */
export function parseManagedSkillFiles(input: unknown): SkillFileSnapshot[] {
  if (!Array.isArray(input)) throw new Error("Skill files must be an array");
  const files: SkillFileSnapshot[] = [];
  for (const value of input) {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof value.relativePath !== "string" ||
      typeof value.content !== "string" ||
      (value.encoding !== undefined &&
        value.encoding !== "utf8" &&
        value.encoding !== "base64")
    ) {
      throw new Error("Invalid Skill file snapshot");
    }
    files.push({
      relativePath: value.relativePath,
      content: value.content,
      ...(value.encoding ? { encoding: value.encoding } : {}),
    });
  }
  validateSkillFileSnapshots(files);
  const primary = files.find((file) => file.relativePath === "SKILL.md");
  if (!primary || primary.encoding === "base64")
    throw new Error("A UTF-8 SKILL.md is required");
  withSkillSnapshotEntrypoint(files, primary.content);
  validateManagedPaths(files);
  return files;
}

function validateManagedPaths(files: SkillFileSnapshot[]): void {
  const rules = files.find((file) => file.relativePath === ".prompthubignore");
  if (rules?.encoding === "base64")
    throw new Error("Skill ignore rules must be UTF-8");
  const ignore = createSkillPackageIgnoreMatcher(rules?.content ?? "");
  const paths = new Set<string>();
  for (const file of files) {
    const key = file.relativePath.toLowerCase();
    if (paths.has(key))
      throw new Error("Skill package has conflicting file paths");
    paths.add(key);
    if (
      key === ".canonical-bundle-hash" ||
      key.split("/").includes(".package-lifecycle") ||
      ignore(file.relativePath)
    ) {
      throw new Error("Skill package contains an excluded file");
    }
  }
}
