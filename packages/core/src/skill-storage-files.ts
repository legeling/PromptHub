import fs from "node:fs";
import path from "node:path";
import type { SkillPackagePayloadSource } from "./skill-resource-schema";
import type { CanonicalEntryMutation } from "./canonical-entry-publication";
import { createSkillPackageIgnoreMatcher } from "@prompthub/shared/utils/skill-package-policy";
import {
  MAX_SKILL_PACKAGE_DEPTH,
  MAX_SKILL_PACKAGE_ENTRIES,
  MAX_SKILL_PACKAGE_FILES,
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
} from "@prompthub/shared/constants/skill-package";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import { getSkillsDir, getUserDataPath } from "./runtime-paths";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";

export function getManagedSkillPackagePath(
  skillId: string,
  skillsRoot = getSkillsDir(),
): string {
  return path.join(
    skillsRoot,
    encodeCanonicalResourceDirectory(skillId),
    "files",
  );
}

/** Enumerates package references without keeping every file's bytes in memory. */
export function collectSkillPackageFiles(
  directory: string,
): SkillPackagePayloadSource[] {
  const root = path.resolve(directory);
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Skill package root is unsafe");
  const ignorePath = path.join(root, ".prompthubignore");
  const ignore = createSkillPackageIgnoreMatcher(
    fs.existsSync(ignorePath) ? readSkillEntrypoint(ignorePath) : "",
  );
  const pending = [{ directory: root, depth: 0 }];
  const files: SkillPackagePayloadSource[] = [];
  let entries = 0;
  let bytes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current.directory, {
      withFileTypes: true,
    })) {
      const sourcePath = path.join(current.directory, entry.name);
      const relative = path
        .relative(root, sourcePath)
        .split(path.sep)
        .join("/");
      if (
        relative === ".canonical-bundle-hash" ||
        ignore(relative + (entry.isDirectory() ? "/" : ""))
      )
        continue;
      if (++entries > MAX_SKILL_PACKAGE_ENTRIES)
        throw new Error("Skill package entry limit exceeded");
      if (entry.isSymbolicLink())
        throw new Error("Skill package contains a symbolic link");
      if (entry.isDirectory()) {
        if (current.depth >= MAX_SKILL_PACKAGE_DEPTH)
          throw new Error("Skill package depth limit exceeded");
        pending.push({ directory: sourcePath, depth: current.depth + 1 });
      } else {
        if (!entry.isFile())
          throw new Error("Skill package contains an unsafe file");
        const size = fs.lstatSync(sourcePath).size;
        bytes += size;
        if (
          size > MAX_SKILL_PACKAGE_FILE_BYTES ||
          bytes > MAX_SKILL_PACKAGE_TOTAL_BYTES ||
          files.length >= MAX_SKILL_PACKAGE_FILES
        )
          throw new Error("Skill package file limit exceeded");
        files.push({ path: relative, sourcePath });
      }
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function readSkillEntrypoint(file: string): string {
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_SKILL_PACKAGE_FILE_BYTES)
      throw new Error("Skill entrypoint is unsafe or too large");
    const bytes = fs.readFileSync(descriptor);
    const content = bytes.toString("utf8");
    if (!Buffer.from(content, "utf8").equals(bytes))
      throw new Error("Skill entrypoint must be UTF-8");
    return content;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function skillPackageEntry(
  targetPath: string,
  files: readonly SkillPackagePayloadSource[],
  content?: string,
  rootPath = getUserDataPath(),
): CanonicalEntryMutation {
  assertStoragePathComponentsSafe(rootPath, targetPath);
  return {
    targetPath,
    prepare(stage) {
      fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
      for (const file of files) {
        const target = path.join(stage, ...file.path.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        fs.copyFileSync(file.sourcePath, target, fs.constants.COPYFILE_EXCL);
      }
      const sidecar = path.join(targetPath, ".prompthub");
      if (fs.existsSync(sidecar)) {
        assertStoragePathComponentsSafe(rootPath, sidecar);
        fs.cpSync(sidecar, path.join(stage, ".prompthub"), {
          recursive: true,
          dereference: false,
          errorOnExist: true,
          force: false,
        });
      }
      if (content !== undefined)
        fs.writeFileSync(path.join(stage, "SKILL.md"), content, {
          mode: 0o600,
        });
      readSkillEntrypoint(path.join(stage, "SKILL.md"));
    },
  };
}
