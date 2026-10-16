import fs from "node:fs";
import path from "node:path";
import type { Skill, SkillFileSnapshot, SkillVersion } from "@prompthub/shared";
import type { CanonicalEntryMutation } from "@prompthub/core/canonical-entry-publication";
import {
  collectSkillPackageFiles,
  getManagedSkillPackagePath,
  readSkillEntrypoint,
  skillPackageEntry,
} from "@prompthub/core/skill-storage-files";
import { assertStoragePathComponentsSafe } from "@prompthub/core/runtime-storage-context";
import {
  decodeSkillFileSnapshot,
  encodeSkillFileSnapshot,
  validateSkillFileSnapshots,
  withSkillSnapshotEntrypoint,
} from "@prompthub/shared/utils/skill-file-snapshot";
import { getRootDir, getSkillsDir } from "../runtime-paths.js";

export function getWebSkillPackagePath(id: string): string {
  if (!id || id === "." || id === ".." || /[\u0000-\u001f\u007f]/u.test(id))
    throw new Error("Invalid Skill identity");
  const directory = getManagedSkillPackagePath(id, getSkillsDir());
  assertStoragePathComponentsSafe(getRootDir(), directory);
  return directory;
}

export function validateSkillWorkspaceSnapshotPaths(
  skills: Skill[],
  skillVersions: SkillVersion[],
  skillFilesById?: Record<string, SkillFileSnapshot[]>,
): void {
  const ids = new Set<string>();
  for (const skill of skills) {
    if (ids.has(skill.id))
      throw new Error("Duplicate Skill identity in snapshot");
    ids.add(skill.id);
    getWebSkillPackagePath(skill.id);
    if (skillFilesById?.[skill.id])
      withSkillSnapshotEntrypoint(
        skillFilesById[skill.id],
        skill.content ?? skill.instructions ?? "",
      );
  }
  for (const [id, files] of Object.entries(skillFilesById ?? {})) {
    if (!ids.has(id)) throw new Error("Skill files have no snapshot owner");
    validateSkillFileSnapshots(files);
  }
  for (const version of skillVersions) {
    if (!ids.has(version.skillId))
      throw new Error("Skill version has no snapshot owner");
    if (version.filesSnapshot !== undefined)
      validateSkillFileSnapshots(version.filesSnapshot);
  }
}

export function collectSkillWorkspaceFiles(
  skills: Skill[],
): Record<string, SkillFileSnapshot[]> {
  const result: Record<string, SkillFileSnapshot[]> = {};
  for (const skill of skills) result[skill.id] = readWebSkillFiles(skill.id);
  return result;
}

export function readWebSkillFiles(id: string): SkillFileSnapshot[] {
  const directory = getWebSkillPackagePath(id);
  readSkillEntrypoint(path.join(directory, "SKILL.md"));
  const files = collectSkillPackageFiles(directory).map((file) => {
    assertStoragePathComponentsSafe(getRootDir(), file.sourcePath);
    return encodeSkillFileSnapshot(file.path, fs.readFileSync(file.sourcePath));
  });
  validateSkillFileSnapshots(files);
  return files;
}

export function prepareWebSkillPackage(
  skill: Pick<Skill, "id" | "content" | "instructions">,
  suppliedFiles?: SkillFileSnapshot[],
  allowCreate = false,
): CanonicalEntryMutation {
  const targetPath = getWebSkillPackagePath(skill.id);
  const content = skill.instructions ?? skill.content ?? "";
  withSkillSnapshotEntrypoint([], content);
  if (suppliedFiles !== undefined) {
    const files = withSkillSnapshotEntrypoint(suppliedFiles, content);
    return {
      targetPath,
      prepare(stage) {
        fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
        for (const file of files) {
          const relativePath =
            file.relativePath.toLowerCase() === "skill.md"
              ? "SKILL.md"
              : file.relativePath;
          const target = path.join(stage, ...relativePath.split("/"));
          fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
          fs.writeFileSync(target, decodeSkillFileSnapshot(file), {
            mode: 0o600,
          });
        }
      },
    };
  }
  if (!allowCreate) readSkillEntrypoint(path.join(targetPath, "SKILL.md"));
  const files = fs.existsSync(targetPath)
    ? collectSkillPackageFiles(targetPath)
    : [];
  return skillPackageEntry(targetPath, files, content, getRootDir());
}
