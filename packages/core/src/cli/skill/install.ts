import { materializeRemoteGitRepository } from "../../skills/git-materialize";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { fetchRemoteBytes, fetchRemoteText } from "../../skills/remote-fetch";
import {
  readSkillNetworkSettings,
  skillFetchOptions,
  skillGitEnvironment,
} from "../../skills/network-settings";
import {
  resolveSkillGitSource,
  resolveSelectedSkillDirectory,
  type SkillSourceInstallOptions,
} from "../../skills/git-source";
import { cloneSkillRepository } from "../../skills/git-transport";
import { replaceSkillDestination } from "../../skills/destination";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

import type { SkillDB } from "@prompthub/db";
import type { ScannedSkill, SkillManifest } from "@prompthub/shared/types";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { getOperationsDir } from "../../runtime-paths";
import {
  parseSkillMd,
  sanitizeProtocolType,
  sanitizeString,
  sanitizeStringList,
  sanitizeTags,
  validateSkillName,
} from "./parse";
import {
  computeRepoDirectoryFingerprintByPath,
  fileExists,
  loadSkillPackageIgnoreMatcher,
  validateRepoPackageInventory,
} from "./paths";

export type FetchLike = typeof fetch;

export async function fetchRemoteContent(
  sourceUrl: string,
  fetchImpl?: FetchLike,
): Promise<string> {
  const parsedUrl = new URL(sourceUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS skill URLs are supported");
  }

  if (!fetchImpl)
    return fetchRemoteText(
      sourceUrl,
      0,
      skillFetchOptions(readSkillNetworkSettings()),
    );
  const response = await fetchImpl(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch remote skill: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

export async function gitClone(
  url: string,
  destination: string,
  branch?: string,
): Promise<void> {
  const settings = readSkillNetworkSettings();
  await cloneSkillRepository(
    url,
    destination,
    branch,
    undefined,
    skillGitEnvironment(url, settings),
  );
}

async function fetchConfiguredArchive(source: string): Promise<Uint8Array> {
  const settings = readSkillNetworkSettings();
  const url = new URL(source);
  // GitHub's authenticated archive endpoint redirects without forwarding the PAT.
  const archive =
    url.hostname === "codeload.github.com"
      ? url.pathname.match(/^\/([^/]+)\/([^/]+)\/zip\/(.+)$/)
      : null;
  const target =
    archive && settings.githubToken
      ? `https://api.github.com/repos/${archive[1]}/${archive[2]}/zipball/${archive[3]}`
      : source;
  return fetchRemoteBytes(target, 0, skillFetchOptions(settings));
}

export async function readManifest(skillDir: string): Promise<SkillManifest> {
  const manifestPath = path.join(skillDir, "manifest.json");
  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      name: sanitizeString(parsed.name),
      description: sanitizeString(parsed.description),
      version: sanitizeString(parsed.version),
      author: sanitizeString(parsed.author),
      tags: sanitizeTags(parsed.tags, undefined),
      instructions: sanitizeString(parsed.instructions),
    };
  } catch (error) {
    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    if (errorCode === "ENOENT") {
      return {};
    }
    throw new Error(
      `Failed to parse manifest.json in ${skillDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function createSkillRepoCopyFilter(
  sourceDir: string,
  shouldIgnore: (relativePath: string) => boolean,
) {
  return async (sourcePath: string): Promise<boolean> => {
    try {
      const stat = await fs.lstat(sourcePath);
      const relativePath = path.relative(sourceDir, sourcePath);
      return (
        !stat.isSymbolicLink() && (!relativePath || !shouldIgnore(relativePath))
      );
    } catch {
      return false;
    }
  };
}

async function pathEntryExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function replaceSkillRepo(
  sourceDir: string,
  destinationDir: string,
  shouldIgnore: (relativePath: string) => boolean,
): Promise<void> {
  await replaceSkillDestination(destinationDir, (stagingDir) =>
    fs.cp(sourceDir, stagingDir, {
      recursive: true,
      filter: createSkillRepoCopyFilter(sourceDir, shouldIgnore),
    }),
  );
}

async function copySkillRepoToNewDestination(
  sourceDir: string,
  destinationDir: string,
  shouldIgnore: (relativePath: string) => boolean,
): Promise<void> {
  const stagingDir = `${destinationDir}.staging-${process.pid}-${randomUUID()}`;
  try {
    await fs.cp(sourceDir, stagingDir, {
      recursive: true,
      filter: createSkillRepoCopyFilter(sourceDir, shouldIgnore),
    });
    await fs.rename(stagingDir, destinationDir);
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

export async function linkRepoToTarget(
  sourceDir: string,
  destinationDir: string,
): Promise<void> {
  await replaceSkillDestination(destinationDir, (stagingDir) =>
    fs.symlink(sourceDir, stagingDir, "dir"),
  );
}

export async function copyRepoToPlatform(
  sourceDir: string,
  destinationDir: string,
  options: { policyChecked?: boolean } = {},
): Promise<void> {
  if (!options.policyChecked) {
    await validateRepoPackageInventory(sourceDir);
  }
  const shouldIgnore = await loadSkillPackageIgnoreMatcher(sourceDir);
  await replaceSkillRepo(sourceDir, destinationDir, shouldIgnore);
}

export function buildCliFingerprintFields(
  directoryFingerprint: string,
  options?: { bindSource?: boolean },
) {
  return {
    directory_fingerprint: directoryFingerprint,
    fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    ...(options?.bindSource
      ? {
          installed_directory_fingerprint: directoryFingerprint,
          source_last_checked_at: Date.now(),
          source_last_error: null,
          source_binding_state: "bound" as const,
        }
      : {}),
  };
}

export async function installFromSkillContent(
  skillContent: string,
  skillDb: SkillDB,
  options?: {
    name?: string;
    sourceUrl?: string;
    sourceBranch?: string;
    sourceDirectory?: string;
    repoSourceDir?: string;
  },
): Promise<string> {
  const parsed = parseSkillMd(skillContent);
  const manifest = options?.repoSourceDir
    ? await readManifest(options.repoSourceDir)
    : {};
  const fallbackName = options?.repoSourceDir
    ? path.basename(options.repoSourceDir)
    : undefined;
  const skillName =
    sanitizeString(options?.name) ||
    sanitizeString(parsed?.frontmatter.name) ||
    sanitizeString(manifest.name) ||
    fallbackName;

  if (!skillName) {
    throw new Error(
      "Skill name is required; pass --name or add SKILL.md frontmatter",
    );
  }

  const normalizedName = validateSkillName(skillName);
  await fs.mkdir(getOperationsDir(), { recursive: true });
  const stagingRoot = await fs.mkdtemp(
    path.join(getOperationsDir(), "skill-import-"),
  );
  const localRepoPath = path.join(stagingRoot, "files");
  try {
    if (options?.repoSourceDir) {
      await validateRepoPackageInventory(options.repoSourceDir);
      const ignore = await loadSkillPackageIgnoreMatcher(options.repoSourceDir);
      await copySkillRepoToNewDestination(
        options.repoSourceDir,
        localRepoPath,
        ignore,
      );
    } else {
      await fs.mkdir(localRepoPath);
      await fs.writeFile(
        path.join(localRepoPath, "SKILL.md"),
        skillContent,
        "utf8",
      );
    }
    const directoryFingerprint =
      await computeRepoDirectoryFingerprintByPath(localRepoPath);

    return skillDb.create({
      name: normalizedName,
      description:
        sanitizeString(
          parsed?.frontmatter.description,
          sanitizeString(
            manifest.description,
            `Installed from ${options?.sourceUrl ?? "local source"}`,
          ),
        ) || `Installed from ${options?.sourceUrl ?? "local source"}`,
      instructions: skillContent,
      content: skillContent,
      protocol_type: "skill",
      version:
        sanitizeString(
          parsed?.frontmatter.version,
          sanitizeString(manifest.version, "1.0.0"),
        ) || "1.0.0",
      author:
        sanitizeString(
          parsed?.frontmatter.author,
          sanitizeString(manifest.author, "Local"),
        ) || "Local",
      tags: [],
      original_tags: sanitizeTags(parsed?.frontmatter.tags, manifest.tags),
      is_favorite: false,
      source_url: options?.sourceUrl,
      source_branch: options?.sourceBranch,
      source_directory: options?.sourceDirectory,
      local_repo_path: localRepoPath,
      ...buildCliFingerprintFields(directoryFingerprint, {
        bindSource: Boolean(options?.sourceUrl),
      }),
    }).id;
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function withSelectedGitSkill<T>(
  sourceUrl: string,
  options: SkillSourceInstallOptions,
  gitCloneImpl: typeof gitClone,
  read: (
    directory: string,
    source: NonNullable<ReturnType<typeof resolveSkillGitSource>>,
  ) => Promise<T>,
  fetchArchive: (url: string) => Promise<Uint8Array> = fetchConfiguredArchive,
): Promise<T> {
  const source = resolveSkillGitSource(sourceUrl, options);
  if (!source) throw new Error("Invalid Git repository source");
  await fs.mkdir(getOperationsDir(), { recursive: true });
  const stagingRoot = await fs.mkdtemp(
    path.join(getOperationsDir(), "skill-git-"),
  );
  try {
    const repo = parseGitRepo(source.cloneUrl);
    if (!repo) throw new Error("Invalid Git repository source");
    const checkoutDir = await materializeRemoteGitRepository(
      repo,
      source.branch,
      stagingRoot,
      fetchArchive,
      source.directory,
      gitCloneImpl,
    );
    const skillDir = source.directory
      ? await resolveSelectedSkillDirectory(checkoutDir, source.directory)
      : await resolveSingleSkillDirFromRepo(checkoutDir);
    return await read(skillDir, source);
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function installFromGithub(
  sourceUrl: string,
  skillDb: SkillDB,
  gitCloneImpl: typeof gitClone,
  options: SkillSourceInstallOptions = {},
  fetchArchive?: (url: string) => Promise<Uint8Array>,
): Promise<string> {
  return withSelectedGitSkill(
    sourceUrl,
    options,
    gitCloneImpl,
    async (skillDir, source) => {
      const content = await fs.readFile(
        path.join(skillDir, "SKILL.md"),
        "utf8",
      );
      return installFromSkillContent(content, skillDb, {
        name: options.name,
        sourceUrl,
        sourceBranch: source.branch,
        sourceDirectory: source.directory,
        repoSourceDir: skillDir,
      });
    },
    fetchArchive,
  );
}

export async function importFromJson(
  jsonContent: string,
  skillDb: SkillDB,
): Promise<string> {
  const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
  const skillName = sanitizeString(parsed.name)?.trim();
  if (!skillName) {
    throw new Error("Invalid skill JSON: missing name");
  }
  const instructions = sanitizeString(parsed.instructions);

  return skillDb.create({
    name: skillName,
    description: sanitizeString(parsed.description),
    version: sanitizeString(parsed.version),
    author: sanitizeString(parsed.author),
    instructions,
    content: instructions,
    protocol_type: sanitizeProtocolType(parsed.protocol_type),
    tags: sanitizeTags(parsed.tags, ["imported"]),
    is_favorite: false,
    icon_url: sanitizeString(parsed.icon_url),
    icon_emoji: sanitizeString(parsed.icon_emoji),
    icon_background: sanitizeString(parsed.icon_background),
    prerequisites: sanitizeStringList(parsed.prerequisites),
    compatibility: sanitizeStringList(parsed.compatibility),
    source_url: sanitizeString(parsed.source_url),
  }).id;
}

export async function collectSkillDirs(scanPath: string): Promise<string[]> {
  if (!(await fileExists(scanPath))) {
    return [];
  }

  const entries = await fs.readdir(scanPath, { withFileTypes: true });
  const skillDirs: string[] = [];
  const baseDirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(scanPath, entry.name));

  for (const baseDir of baseDirs) {
    if (await fileExists(path.join(baseDir, "SKILL.md"))) {
      skillDirs.push(baseDir);
      continue;
    }

    try {
      const nestedEntries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const nestedEntry of nestedEntries) {
        if (!nestedEntry.isDirectory() || nestedEntry.name.startsWith(".")) {
          continue;
        }

        const nestedDir = path.join(baseDir, nestedEntry.name);
        if (await fileExists(path.join(nestedDir, "SKILL.md"))) {
          skillDirs.push(nestedDir);
        }
      }
    } catch {
      // Ignore unreadable nested directories during scan preview.
    }
  }

  return skillDirs;
}

export async function resolveSingleSkillDirFromRepo(
  repoRoot: string,
): Promise<string> {
  if (await fileExists(path.join(repoRoot, "SKILL.md"))) {
    return repoRoot;
  }

  const skillDirs = await collectSkillDirs(repoRoot);
  if (skillDirs.length === 1) {
    return skillDirs[0];
  }
  if (skillDirs.length === 0) {
    throw new Error(`SKILL.md not found in repository: ${repoRoot}`);
  }

  throw new Error(
    `Multiple skill directories found in repository: ${repoRoot}. Install a specific skill directory instead of the repo root.`,
  );
}

export function markNameConflicts(
  results: ScannedSkill[],
  skillDb?: SkillDB,
): void {
  const counts = new Map<string, number>();
  for (const result of results) {
    const key = result.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const result of results) {
    if ((counts.get(result.name.toLowerCase()) ?? 0) > 1) {
      result.nameConflict = true;
      continue;
    }

    if (skillDb?.getByName(result.name)) {
      result.nameConflict = true;
    }
  }
}
