import path from "node:path";
import fs from "node:fs/promises";
import {
  parseGitRepo,
  parseGitHubTreeLocation,
} from "@prompthub/shared/utils/git-repo";

export interface SkillSourceInstallOptions {
  name?: string;
  branch?: string;
  directory?: string;
}

export interface SkillGitSource {
  cloneUrl: string;
  branch?: string;
  directory?: string;
}

export function resolveSkillGitSource(
  source: string,
  options: SkillSourceInstallOptions = {},
): SkillGitSource | null {
  const repo = parseGitRepo(source);
  if (!repo || /\.(md|json)$/iu.test(source)) return null;
  const tree = parseGitHubTreeLocation(source);
  const branch =
    options.branch?.trim() ||
    (tree ? decodeURIComponent(tree.branch) : undefined);
  const directory =
    options.directory ??
    (tree?.directory ? decodeURIComponent(tree.directory) : undefined);
  if (branch && (branch.startsWith("-") || /[\u0000\r\n]/u.test(branch)))
    throw new Error("Invalid Git branch");
  if (directory !== undefined) validateSkillGitDirectory(directory);
  return { cloneUrl: repo.cloneUrl, branch, directory };
}

export function validateSkillGitDirectory(directory: string): void {
  if (
    !directory.trim() ||
    path.posix.isAbsolute(directory) ||
    path.win32.isAbsolute(directory) ||
    /[\u0000\r\n\\:]/u.test(directory) ||
    directory.split("/").some((part) => part === "..")
  ) {
    throw new Error("Skill repository directory must be a safe relative path");
  }
}

export async function resolveSelectedSkillDirectory(
  checkout: string,
  directory: string,
): Promise<string> {
  validateSkillGitDirectory(directory);
  const root = await fs.realpath(checkout);
  const selected = await fs.realpath(path.join(root, directory));
  const relative = path.relative(root, selected);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error("Skill directory escapes repository");
  const entrypoint = await fs.realpath(path.join(selected, "SKILL.md"));
  const entryRelative = path.relative(selected, entrypoint);
  if (
    entryRelative === ".." ||
    entryRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(entryRelative)
  )
    throw new Error("Skill entrypoint escapes package");
  return selected;
}
