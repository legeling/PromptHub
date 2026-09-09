import * as childProcess from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

import type { SkillDB } from "@prompthub/db";
import type { ScannedSkill, SkillManifest } from "@prompthub/shared/types";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { getSkillsDir } from "../../runtime-paths";
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
  GIT_CLONE_TIMEOUT_MS,
  loadSkillPackageIgnoreMatcher,
  validateRepoPackageInventory,
} from "./paths";

export type FetchLike = typeof fetch;

export async function fetchRemoteContent(
  sourceUrl: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const parsedUrl = new URL(sourceUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS skill URLs are supported");
  }

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
  destinationDir: string,
): Promise<void> {
  if (!url.trim()) {
    throw new Error("Git clone URL cannot be empty");
  }
  if (url.startsWith("-")) {
    throw new Error("Git clone URL cannot start with '-'");
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS Git clone URLs are allowed");
  }

  await new Promise<void>((resolve, reject) => {
    const processRef = childProcess.spawn(
      "git",
      ["clone", "--depth", "1", "--", url, destinationDir],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      processRef.kill("SIGKILL");
      reject(
        new Error(
          `Git clone timed out after ${GIT_CLONE_TIMEOUT_MS / 1000}s for URL: ${url}`,
        ),
      );
    }, GIT_CLONE_TIMEOUT_MS);

    processRef.stderr?.on("data", (data: Buffer | string) => {
      stderr += data.toString();
    });

    processRef.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Git clone failed with code ${code}: ${stderr}`));
    });

    processRef.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Git clone error: ${error.message}`));
    });
  });
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

async function rollbackManagedRepoReplacement(
  destinationDir: string,
  stagingDir: string,
  backupDir: string,
): Promise<void> {
  if (await pathEntryExists(backupDir)) {
    await fs.rm(destinationDir, { recursive: true, force: true });
    await fs.rename(backupDir, destinationDir);
  }
  await fs.rm(stagingDir, { recursive: true, force: true });
}

async function replaceSkillDestination(
  destinationDir: string,
  createStaging: (stagingDir: string) => Promise<void>,
): Promise<void> {
  const suffix = `${process.pid}-${randomUUID()}`;
  const stagingDir = `${destinationDir}.staging-${suffix}`;
  const backupDir = `${destinationDir}.backup-${suffix}`;
  const hadDestination = await pathEntryExists(destinationDir);
  try {
    await createStaging(stagingDir);
    if (hadDestination) {
      await fs.rename(destinationDir, backupDir);
    }
    await fs.rename(stagingDir, destinationDir);
    if (hadDestination) {
      await fs.rm(backupDir, { recursive: true, force: true });
    }
  } catch (error) {
    try {
      await rollbackManagedRepoReplacement(
        destinationDir,
        stagingDir,
        backupDir,
      );
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Failed to replace Skill target and restore the previous copy",
      );
    }
    throw error;
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

export async function saveRepo(
  skillName: string,
  sourceDir: string,
): Promise<string> {
  const managedSkillsDir = getSkillsDir();
  const destinationDir = path.join(
    managedSkillsDir,
    validateSkillName(skillName),
  );
  await fs.mkdir(managedSkillsDir, { recursive: true });

  await validateRepoPackageInventory(sourceDir);
  const shouldIgnore = await loadSkillPackageIgnoreMatcher(sourceDir);
  await replaceSkillRepo(sourceDir, destinationDir, shouldIgnore);

  return destinationDir;
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

export async function saveContent(
  skillName: string,
  content: string,
): Promise<string> {
  const managedSkillsDir = getSkillsDir();
  const destinationDir = path.join(
    managedSkillsDir,
    validateSkillName(skillName),
  );
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.writeFile(path.join(destinationDir, "SKILL.md"), content, "utf-8");
  return destinationDir;
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
  const localRepoPath = options?.repoSourceDir
    ? await saveRepo(normalizedName, options.repoSourceDir)
    : await saveContent(normalizedName, skillContent);
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
    local_repo_path: localRepoPath,
    ...buildCliFingerprintFields(directoryFingerprint, {
      bindSource: Boolean(options?.sourceUrl),
    }),
  }).id;
}

export async function installFromGithub(
  sourceUrl: string,
  skillDb: SkillDB,
  gitCloneImpl: typeof gitClone,
): Promise<string> {
  const matches = sourceUrl.match(
    /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
  );
  if (!matches) {
    throw new Error(
      "Invalid GitHub URL: must be https://github.com/{owner}/{repo}",
    );
  }

  const owner = matches[1];
  const repoName = matches[2];
  const installDir = path.join(getSkillsDir(), `${owner}-${repoName}`);
  const checkoutDir = `${installDir}.checkout-${process.pid}-${randomUUID()}`;
  const relative = path.relative(
    path.resolve(getSkillsDir()),
    path.resolve(installDir),
  );
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      "Path traversal detected: installDir is outside skills directory",
    );
  }

  try {
    await fs.access(installDir);
    throw new Error(
      `Skill ${owner}/${repoName} already exists. Please delete it first.`,
    );
  } catch (error) {
    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    if (errorCode !== "ENOENT") {
      throw error;
    }
  }

  const existingByName = skillDb.getByName(repoName);
  if (existingByName) {
    throw new Error(
      `A skill named "${repoName}" already exists in the library (id: ${existingByName.id}). Delete it first or use a different repository.`,
    );
  }

  let managedPackageCreated = false;
  try {
    await fs.mkdir(path.dirname(installDir), { recursive: true });
    await gitCloneImpl(sourceUrl, checkoutDir);
    const skillDir = await resolveSingleSkillDirFromRepo(checkoutDir);
    const manifest = await readManifest(skillDir);

    if (!manifest.instructions) {
      try {
        manifest.instructions = await fs.readFile(
          path.join(skillDir, "SKILL.md"),
          "utf-8",
        );
      } catch {
        // Fall through to README fallback.
      }
    }

    if (!manifest.instructions) {
      try {
        manifest.instructions = await fs.readFile(
          path.join(checkoutDir, "README.md"),
          "utf-8",
        );
      } catch {
        // Leave empty if no markdown entry file exists.
      }
    }

    await validateRepoPackageInventory(skillDir);
    const shouldIgnore = await loadSkillPackageIgnoreMatcher(skillDir);
    await copySkillRepoToNewDestination(skillDir, installDir, shouldIgnore);
    managedPackageCreated = true;
    const directoryFingerprint =
      await computeRepoDirectoryFingerprintByPath(installDir);
    return skillDb.create({
      name: manifest.name || repoName,
      description: manifest.description || `Installed from ${sourceUrl}`,
      version: manifest.version || "1.0.0",
      author: manifest.author || owner,
      content: manifest.instructions || "",
      instructions: manifest.instructions || "",
      protocol_type: "skill",
      source_url: sourceUrl,
      local_repo_path: installDir,
      ...buildCliFingerprintFields(directoryFingerprint, { bindSource: true }),
      is_favorite: false,
      tags: [],
      original_tags: manifest.tags || ["github"],
    }).id;
  } catch (error) {
    if (managedPackageCreated) {
      await fs
        .rm(installDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    await fs
      .rm(checkoutDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
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
