import * as fs from "fs/promises";
import path from "path";
import type {
  ScannedSkill,
  Skill,
  SkillManifest,
} from "@prompthub/shared/types";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { collectSkillDirsFromRepo } from "@prompthub/core/skills/directory-discovery";
export {
  collectSkillDirs,
  collectSkillDirsFromRepo,
} from "@prompthub/core/skills/directory-discovery";
import { sanitizeImportedSkillDraft } from "./skill-import-sanitize";
import { fileExists, getErrorCode } from "./skill-installer-internal";
import { isManagedRepoPath } from "./skill-installer-repo";
import { getPlatformSkillsDir } from "./skill-installer-utils";
import { parseSkillMd } from "./skill-validator";

/** Build the de-duplicated local directories that participate in discovery. */
export function getDefaultSkillScanEntries(
  managedSkillsDir: string,
): Array<{ path: string; platformName: string }> {
  const entries = [{ path: managedSkillsDir, platformName: "PromptHub" }];
  for (const platform of SKILL_PLATFORMS) {
    const resolved = getPlatformSkillsDir(platform);
    if (!entries.some((entry) => entry.path === resolved)) {
      entries.push({ path: resolved, platformName: platform.name });
    }
  }
  return entries;
}

/** Read the optional manifest without hiding permission, I/O, or JSON errors. */
export async function readSkillManifest(dir: string): Promise<SkillManifest> {
  const manifestPath = path.join(dir, "manifest.json");
  let content: string;
  try {
    content = await fs.readFile(manifestPath, "utf-8");
  } catch (error: unknown) {
    if (getErrorCode(error) === "ENOENT") return {};
    throw new Error(
      `Failed to read manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const skill = sanitizeImportedSkillDraft(parsed, { defaultTags: [] });
    return {
      name: skill.name,
      description: skill.description,
      version: skill.version,
      author: skill.author,
      tags: skill.tags.length > 0 ? skill.tags : undefined,
      instructions: skill.instructions,
    };
  } catch (error: unknown) {
    throw new Error(
      `Failed to parse manifest.json in ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function normalizeSkillLookupValue(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export async function getScannedSkillInstallMetadata(
  skillFolderPath: string,
): Promise<{
  installMode: ScannedSkill["installMode"];
  symlinkTargetPath?: string;
  isPromptHubManagedLink?: boolean;
}> {
  const stat = await fs.lstat(skillFolderPath).catch(() => null);
  if (!stat?.isSymbolicLink()) return { installMode: "copy" };
  const rawTarget = await fs.readlink(skillFolderPath).catch(() => null);
  const symlinkTargetPath = rawTarget
    ? path.isAbsolute(rawTarget)
      ? rawTarget
      : path.resolve(path.dirname(skillFolderPath), rawTarget)
    : undefined;
  const isPromptHubManagedLink = symlinkTargetPath
    ? await isManagedRepoPath(symlinkTargetPath).catch(() => false)
    : false;
  return {
    installMode: "symlink",
    symlinkTargetPath,
    isPromptHubManagedLink,
  };
}

export async function resolveSingleSkillDirFromRepo(
  repoDir: string,
): Promise<string> {
  const skillDirs = await collectSkillDirsFromRepo(repoDir);
  if (skillDirs.length === 0) {
    throw new Error("Repository does not contain a SKILL.md file.");
  }
  if (skillDirs.length > 1) {
    throw new Error(
      "Repository contains multiple skills. Import it as a local skill folder instead.",
    );
  }
  return skillDirs[0];
}

function getCandidateSkillNames(skillDir: string): string[] {
  return [normalizeSkillLookupValue(path.basename(skillDir))];
}

interface SkillDirectoryMatch {
  directory: string;
  priority: number;
}

const STANDARD_SKILLS_PREFIXES = ["skills", "data/skills"];

function pathUsesPrefix(relativePath: string, prefix: string): boolean {
  return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

function isHiddenAgentSkillsPath(relativePath: string): boolean {
  const parts = relativePath.split("/");
  const skillsIndex = parts.lastIndexOf("skills");
  return (
    parts[0]?.startsWith(".") === true &&
    skillsIndex >= 1 &&
    skillsIndex < parts.length - 1
  );
}

function getSkillDirectoryPriority(repoDir: string, skillDir: string): number {
  const relativePath = path
    .relative(repoDir, skillDir)
    .replace(/\\/g, "/")
    .toLocaleLowerCase();
  if (!relativePath) return 0;
  if (
    STANDARD_SKILLS_PREFIXES.some((prefix) =>
      pathUsesPrefix(relativePath, prefix),
    )
  ) {
    return 1;
  }
  if (isHiddenAgentSkillsPath(relativePath)) {
    return 2;
  }
  return 3;
}

async function getParsedSkillName(skillDir: string): Promise<string> {
  const content = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf-8");
  return normalizeSkillLookupValue(parseSkillMd(content)?.frontmatter.name);
}

function selectRankedSkillMatch(
  repoDir: string,
  matches: string[],
  displayName: string,
): string | null {
  if (matches.length === 0) return null;
  const ranked: SkillDirectoryMatch[] = matches.map((directory) => ({
    directory,
    priority: getSkillDirectoryPriority(repoDir, directory),
  }));
  const bestPriority = Math.min(...ranked.map((match) => match.priority));
  const bestMatches = ranked.filter((match) => match.priority === bestPriority);
  if (bestMatches.length === 1) return bestMatches[0].directory;
  throw new Error(
    `Repository contains multiple skills matching "${displayName}". Specify a skill directory.`,
  );
}

async function findMatchingSkillDirectories(
  skillDirs: string[],
  targetNames: Set<string>,
): Promise<{ frontmatter: string[]; directory: string[] }> {
  const frontmatter: string[] = [];
  const directory: string[] = [];
  for (const candidate of skillDirs) {
    const parsedName = await getParsedSkillName(candidate);
    if (parsedName && targetNames.has(parsedName)) {
      frontmatter.push(candidate);
      continue;
    }
    if (
      getCandidateSkillNames(candidate).some((name) => targetNames.has(name))
    ) {
      directory.push(candidate);
    }
  }
  return { frontmatter, directory };
}

async function resolveMatchingSkillDir(
  repoDir: string,
  skillDirs: string[],
  skill: Pick<Skill, "name" | "logical_name" | "variant_key">,
): Promise<string> {
  const targetNames = new Set(
    [skill.name, skill.logical_name, skill.variant_key]
      .map(normalizeSkillLookupValue)
      .filter(Boolean),
  );
  const matches = await findMatchingSkillDirectories(skillDirs, targetNames);
  const frontmatterMatch = selectRankedSkillMatch(
    repoDir,
    matches.frontmatter,
    skill.name,
  );
  if (frontmatterMatch) return frontmatterMatch;
  const directoryMatch = selectRankedSkillMatch(
    repoDir,
    matches.directory,
    skill.name,
  );
  if (directoryMatch) return directoryMatch;
  throw new Error(
    `Repository contains multiple skills or a mismatched package, but none matches "${skill.name}". Specify a skill directory.`,
  );
}

/** Resolve an exact selector without accepting an unrelated single package. */
export async function resolveSkillDirBySelectorFromRepo(
  repoDir: string,
  skillName: string,
): Promise<string> {
  const skillDirs = await collectSkillDirsFromRepo(repoDir);
  if (skillDirs.length === 0) {
    throw new Error("Repository does not contain a SKILL.md file.");
  }
  return resolveMatchingSkillDir(repoDir, skillDirs, { name: skillName });
}

export async function resolveSkillDirFromRepo(
  repoDir: string,
  skill: Pick<Skill, "name" | "logical_name" | "variant_key">,
): Promise<string> {
  const skillDirs = await collectSkillDirsFromRepo(repoDir);
  if (skillDirs.length <= 1) return resolveSingleSkillDirFromRepo(repoDir);
  return resolveMatchingSkillDir(repoDir, skillDirs, skill);
}
