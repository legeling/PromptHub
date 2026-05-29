/**
 * Local repository storage layer for skill files.
 *
 * Handles all file-system CRUD for managed skill repos: reading, writing,
 * listing, deleting, and atomic replacement of repo contents.
 */
import * as fs from "fs/promises";
import * as path from "path";
import type {
  Skill,
  SkillLocalFileBufferEntry,
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
} from "@prompthub/shared/types";
import { computeStableTextHash } from "@prompthub/shared/utils/skill-identity";
import {
  fileExists,
  getErrorCode,
  getSkillsDirAccessor,
  initSkillsDir,
  isPathWithin,
  normalizeExistingPath,
  resolveRepoBasePath,
  resolveRepoTargetPath,
  validateRelativePath,
  validateSkillName,
} from "./skill-installer-internal";

export interface CopyRepoByPathToDirectoryOptions {
  ifExists?: "overwrite" | "skip" | "error";
  mode?: "copy" | "symlink";
}

// ==================== Constants ====================

/** Maximum recursion depth for directory walking */
const MAX_WALK_DEPTH = 5;
/** Maximum number of file entries to collect */
const MAX_WALK_FILES = 500;
/** Maximum file size (1 MB) for reading text content */
const MAX_FILE_SIZE_BYTES = 1_048_576;

/**
 * Text file extensions recognized for content reading (all lowercase).
 */
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".py",
  ".js",
  ".ts",
  ".json",
  ".yaml",
  ".yml",
  ".txt",
  ".sh",
  ".toml",
  ".cfg",
  ".ini",
  ".css",
  ".html",
  ".xml",
  ".sql",
  ".r",
  ".jl",
  ".lua",
  ".rb",
  ".go",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".rs",
]);

const INTERNAL_REPO_DIRS = new Set([".git", ".prompthub"]);

interface SkillVariantSourceMetadata {
  logicalName: string;
  variantKey: string;
  sourceType: string;
  sourceId?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  branch?: string;
  directory?: string;
  directoryFingerprint?: string;
}

interface SkillVariantMetadata {
  logicalName: string;
  variantKey: string;
  repoMode: "copy" | "symlink";
  createdAt: number;
  updatedAt: number;
}

const MANAGED_REPO_DIRNAME = "repo";
const INTERNAL_METADATA_DIRNAME = ".prompthub";
const SOURCE_METADATA_FILE = "source.json";
const VARIANT_METADATA_FILE = "variant.json";

function normalizeRepoBaseDirectory(absolutePath: string): string {
  return /[\\/]SKILL\.md$/i.test(absolutePath)
    ? path.dirname(absolutePath)
    : absolutePath;
}

function normalizeLogicalSkillName(value?: string | null): string {
  const trimmed = (value ?? "").trim().toLowerCase();
  const normalized = trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "skill";
}

function normalizeVariantLabel(value?: string | null): string {
  if (!value) {
    return "local";
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "local";
}

function buildVariantKeyFromSkill(skill: Pick<Skill, "id" | "name" | "source_id" | "variant_key">): string {
  if (skill.variant_key?.trim()) {
    return skill.variant_key.trim();
  }

  const logicalName = normalizeLogicalSkillName(skill.name || skill.id);
  const stableSuffix = computeStableTextHash(skill.source_id?.trim() || skill.id.trim()).slice(0, 8);
  return `${logicalName}--${stableSuffix}`;
}

function buildSkillVariantSourceMetadata(
  skill: Pick<Skill, "id" | "name" | "source_id" | "source_url" | "directory_fingerprint" | "logical_name" | "variant_key">,
  mode: "copy" | "symlink",
): { source: SkillVariantSourceMetadata; variant: SkillVariantMetadata } {
  const logicalName =
    skill.logical_name?.trim() || normalizeLogicalSkillName(skill.name || skill.id);
  const variantKey = buildVariantKeyFromSkill(skill);
  const timestamp = Date.now();
  return {
    source: {
      logicalName,
      variantKey,
      sourceType: skill.source_id ? "managed-import" : "local-authored",
      sourceId: skill.source_id,
      sourceUrl: skill.source_url,
      directoryFingerprint: skill.directory_fingerprint,
    },
    variant: {
      logicalName,
      variantKey,
      repoMode: mode,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

function getManagedContainerPathFromInstanceKey(instanceKey: string): string {
  const skillsDir = getSkillsDirAccessor();
  return path.join(skillsDir, instanceKey);
}

async function writeVariantSidecarFiles(
  containerDir: string,
  metadata: { source: SkillVariantSourceMetadata; variant: SkillVariantMetadata },
): Promise<void> {
  const internalDir = path.join(containerDir, INTERNAL_METADATA_DIRNAME);
  await fs.mkdir(internalDir, { recursive: true });
  await fs.writeFile(
    path.join(internalDir, SOURCE_METADATA_FILE),
    `${JSON.stringify(metadata.source, null, 2)}\n`,
    "utf-8",
  );
  await fs.writeFile(
    path.join(internalDir, VARIANT_METADATA_FILE),
    `${JSON.stringify(metadata.variant, null, 2)}\n`,
    "utf-8",
  );
}

async function resolveManagedRepoRoot(absolutePath: string): Promise<string> {
  const normalized = normalizeRepoBaseDirectory(absolutePath);
  const repoCandidate = path.join(normalized, MANAGED_REPO_DIRNAME);
  if (await fileExists(repoCandidate)) {
    const stat = await fs.stat(repoCandidate).catch(() => null);
    if (stat?.isDirectory()) {
      return repoCandidate;
    }
  }
  return normalized;
}

export function isInternalSkillRepoEntry(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]+/)
    .some((segment) => INTERNAL_REPO_DIRS.has(segment));
}

// ==================== Internal helpers ====================

/**
 * Generic directory walker with security guards.
 *
 * Recursively traverses `baseDir`, enforcing MAX_WALK_DEPTH, MAX_WALK_FILES,
 * symlink rejection, and realpath-within-base validation on every entry.
 * Callers supply an `onEntry` callback that receives each validated entry and
 * returns either `T` (to collect) or `null` (to skip). For directory entries,
 * `onEntry` is called *before* recursing into the directory.
 */
async function walkRepoDir<T>(opts: {
  baseDir: string;
  realBasePath: string;
  onEntry: (entry: {
    relativePath: string;
    fullPath: string;
    isDirectory: boolean;
    dirent: import("fs").Dirent;
  }) => Promise<T | null>;
}): Promise<T[]> {
  const { baseDir, realBasePath, onEntry } = opts;
  const results: T[] = [];

  const recurse = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_WALK_DEPTH) return;
    if (results.length >= MAX_WALK_FILES) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of entries) {
      if (results.length >= MAX_WALK_FILES) return;

      if (dirent.isSymbolicLink()) {
        continue;
      }
      const fullPath = path.join(dir, dirent.name);
      const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
      if (!isPathWithin(realBasePath, realFullPath)) {
        continue;
      }
      const relativePath = path.relative(baseDir, fullPath);
      const isDirectory = dirent.isDirectory();

      if (isInternalSkillRepoEntry(relativePath)) {
        continue;
      }

      const item = await onEntry({
        relativePath,
        fullPath,
        isDirectory,
        dirent,
      });
      if (item !== null) {
        results.push(item);
      }

      if (isDirectory) {
        await recurse(fullPath, depth + 1);
      }
    }
  };

  await recurse(baseDir, 0);
  return results;
}

/**
 * Read a single file's content, returning a placeholder for binary or
 * oversized files.  Shared by walkRepoDir callers and readLocalRepoFileByPath.
 */
async function readFileContent(
  fullPath: string,
  fileName: string,
): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    return "[binary file]";
  }
  const stat = await fs.stat(fullPath);
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    return "[file too large]";
  }
  return fs.readFile(fullPath, "utf-8");
}

// ==================== Managed path check ====================

export async function isManagedRepoPath(
  absolutePath: string,
): Promise<boolean> {
  const skillsDir = getSkillsDirAccessor();
  const normalizedSkillsDir = await normalizeExistingPath(skillsDir);
  const normalizedAbsolutePath = await normalizeExistingPath(
    await resolveManagedRepoRoot(absolutePath),
  );
  return isPathWithin(normalizedSkillsDir, normalizedAbsolutePath);
}

// ==================== Save ====================

/**
 * Copy an entire source directory into the local skill repo.
 *
 * If the destination already exists it is removed first (update/overwrite).
 *
 * @returns The absolute path of the destination directory.
 */
export async function saveToLocalRepo(
  skillName: string,
  sourceDir: string,
  mode: "copy" | "symlink" = "copy",
): Promise<string> {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  // Validate sourceDir: must be an existing directory (prevent arbitrary path copy)
  try {
    const stat = await fs.stat(sourceDir);
    if (!stat.isDirectory()) {
      throw new Error(`Invalid sourceDir: not a directory: ${sourceDir}`);
    }
  } catch (error: unknown) {
    if (getErrorCode(error) === "ENOENT") {
      throw new Error(
        `Invalid sourceDir: directory does not exist: ${sourceDir}`,
      );
    }
    throw error;
  }

  await initSkillsDir();
  const destDir = path.join(skillsDir, skillName);

  // Remove existing destination if present
  if (await fileExists(destDir)) {
    await fs.rm(destDir, { recursive: true, force: true });
  }

  if (mode === "symlink") {
    const canonicalSourceDir = await fs.realpath(sourceDir);
    await fs.symlink(canonicalSourceDir, destDir, "dir");
    return destDir;
  }

  // Filter out symlinks to prevent leaking files outside the source directory
  await fs.cp(sourceDir, destDir, {
    recursive: true,
    filter: async (src: string) => {
      try {
        const stat = await fs.lstat(src);
        return !stat.isSymbolicLink();
      } catch {
        return false;
      }
    },
  });

  return destDir;
}

export async function copyRepoByPathToDirectory(
  sourceDir: string,
  skillName: string,
  targetRootDir: string,
  options: CopyRepoByPathToDirectoryOptions = {},
): Promise<string> {
  validateSkillName(skillName);

  const resolvedSourceDir = path.resolve(sourceDir);
  const resolvedTargetRootDir = path.resolve(targetRootDir);

  const sourceStat = await fs.stat(resolvedSourceDir).catch((error: unknown) => {
    if (getErrorCode(error) === "ENOENT") {
      throw new Error(`Source skill directory does not exist: ${resolvedSourceDir}`);
    }
    throw error;
  });
  if (!sourceStat.isDirectory()) {
    throw new Error(`Source skill directory is not a directory: ${resolvedSourceDir}`);
  }

  const targetDir = path.join(resolvedTargetRootDir, skillName);
  if (resolvedSourceDir === targetDir) {
    throw new Error(
      `Target skill directory must not equal the source skill directory: ${targetDir}`,
    );
  }
  if (isPathWithin(resolvedSourceDir, resolvedTargetRootDir)) {
    throw new Error(
      `Target directory must not be inside the source skill directory: ${resolvedTargetRootDir}`,
    );
  }

  await fs.mkdir(resolvedTargetRootDir, { recursive: true });
  if (await fileExists(targetDir)) {
    const ifExists = options.ifExists ?? "overwrite";
    if (ifExists === "skip") {
      return targetDir;
    }
    if (ifExists === "error") {
      throw new Error(`Skill already exists in target directory: ${targetDir}`);
    }
    await fs.rm(targetDir, { recursive: true, force: true });
  }

  if (options.mode === "symlink") {
    const canonicalSourceDir = await fs.realpath(resolvedSourceDir);
    await fs.symlink(canonicalSourceDir, targetDir, "dir");
    return targetDir;
  }

  await fs.cp(resolvedSourceDir, targetDir, {
    recursive: true,
    filter: async (src: string) => {
      const relativePath = path.relative(resolvedSourceDir, src);
      if (!relativePath) {
        return true;
      }
      if (isInternalSkillRepoEntry(relativePath)) {
        return false;
      }
      try {
        const stat = await fs.lstat(src);
        return !stat.isSymbolicLink();
      } catch {
        return false;
      }
    },
  });

  return targetDir;
}

/**
 * Save a single SKILL.md content string into the local skill repo.
 *
 * @returns The absolute path of the destination directory.
 */
export async function saveContentToLocalRepo(
  skillName: string,
  content: string,
): Promise<string> {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  await initSkillsDir();
  const destDir = path.join(skillsDir, skillName);

  await fs.mkdir(destDir, { recursive: true });
  await fs.writeFile(path.join(destDir, "SKILL.md"), content, "utf-8");

  return destDir;
}

// ==================== Read ====================

/**
 * Recursively read all files under the local skill repo directory.
 *
 * Text files are returned with their content; binary files have
 * content set to "[binary file]".
 */
export async function readLocalRepoFiles(
  skillName: string,
): Promise<{ path: string; content: string; isDirectory: boolean }[]> {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  const baseDir = path.join(skillsDir, skillName);

  if (!(await fileExists(baseDir))) {
    return [];
  }

  const realBasePath = await fs.realpath(baseDir).catch(() => baseDir);

  return walkRepoDir<{ path: string; content: string; isDirectory: boolean }>({
    baseDir,
    realBasePath,
    onEntry: async ({ relativePath, fullPath, isDirectory, dirent }) => {
      if (isDirectory) {
        return { path: relativePath, content: "", isDirectory: true };
      }
      const content = await readFileContent(fullPath, dirent.name);
      return { path: relativePath, content, isDirectory: false };
    },
  });
}

/**
 * Recursively read all files under an absolute directory path.
 * Same logic as readLocalRepoFiles but accepts an absolute path directly
 * instead of constructing the path from a skill name.
 */
export async function readLocalRepoFilesByPath(
  absolutePath: string,
): Promise<SkillLocalFileEntry[]> {
  const normalizedBasePath = normalizeRepoBaseDirectory(absolutePath);
  const { realBasePath } = await resolveRepoBasePath(normalizedBasePath, {
    allowOutsideSkillsDir: true,
  });

  if (!(await fileExists(normalizedBasePath))) {
    return [];
  }

  const baseDir = normalizedBasePath;

  return walkRepoDir<SkillLocalFileEntry>({
    baseDir,
    realBasePath,
    onEntry: async ({ relativePath, fullPath, isDirectory, dirent }) => {
      if (isDirectory) {
        return { path: relativePath, content: "", isDirectory: true };
      }
      const content = await readFileContent(fullPath, dirent.name);
      return { path: relativePath, content, isDirectory: false };
    },
  });
}

export async function readLocalRepoFileBuffersByPath(
  absolutePath: string,
): Promise<SkillLocalFileBufferEntry[]> {
  const normalizedBasePath = normalizeRepoBaseDirectory(absolutePath);
  const { realBasePath } = await resolveRepoBasePath(normalizedBasePath, {
    allowOutsideSkillsDir: true,
  });

  if (!(await fileExists(normalizedBasePath))) {
    return [];
  }

  const baseDir = normalizedBasePath;

  return walkRepoDir<SkillLocalFileBufferEntry>({
    baseDir,
    realBasePath,
    onEntry: async ({ relativePath, fullPath, isDirectory }) => {
      if (isDirectory) {
        return null;
      }

      return {
        path: relativePath,
        data: await fs.readFile(fullPath),
      };
    },
  });
}

export async function listLocalRepoFiles(
  skillName: string,
): Promise<SkillLocalFileTreeEntry[]> {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  await initSkillsDir();
  const absolutePath = path.join(skillsDir, skillName);
  return listLocalRepoFilesByPath(absolutePath);
}

export async function listLocalRepoFilesByPath(
  absolutePath: string,
): Promise<SkillLocalFileTreeEntry[]> {
  const normalizedBasePath = normalizeRepoBaseDirectory(absolutePath);
  const { realBasePath } = await resolveRepoBasePath(normalizedBasePath, {
    allowOutsideSkillsDir: true,
  });

  if (!(await fileExists(normalizedBasePath))) {
    return [];
  }

  const baseDir = normalizedBasePath;

  return walkRepoDir<SkillLocalFileTreeEntry>({
    baseDir,
    realBasePath,
    onEntry: async ({ relativePath, fullPath, isDirectory }) => {
      if (isDirectory) {
        return { path: relativePath, isDirectory: true };
      }
      const stat = await fs.stat(fullPath);
      return { path: relativePath, isDirectory: false, size: stat.size };
    },
  });
}

export async function readLocalRepoFile(
  skillName: string,
  relativePath: string,
): Promise<SkillLocalFileEntry | null> {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  await initSkillsDir();
  const absolutePath = path.join(skillsDir, skillName);
  return readLocalRepoFileByPath(absolutePath, relativePath);
}

export async function readLocalRepoFileByPath(
  absoluteBasePath: string,
  relativePath: string,
): Promise<SkillLocalFileEntry | null> {
  const normalizedBasePath = normalizeRepoBaseDirectory(absoluteBasePath);
  const { fullPath, realBasePath } = await resolveRepoTargetPath(
    normalizedBasePath,
    relativePath,
    { allowOutsideSkillsDir: true },
  );
  if (!(await fileExists(fullPath))) {
    return null;
  }

  const lstat = await fs.lstat(fullPath);
  if (lstat.isSymbolicLink()) {
    throw new Error("Symlinked files are not allowed in managed repos");
  }
  const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
  if (!isPathWithin(realBasePath, realFullPath)) {
    throw new Error("Repo file path resolves outside managed repo");
  }
  const stat = await fs.stat(fullPath);
  if (stat.isDirectory()) {
    return { path: relativePath, content: "", isDirectory: true };
  }

  const content = await readFileContent(fullPath, path.basename(relativePath));

  return {
    path: relativePath,
    content,
    isDirectory: false,
  };
}

// ==================== Write ====================

/**
 * Write a single file to the local skill repo.
 *
 * Intermediate directories are created automatically.
 */
export async function writeLocalRepoFile(
  skillName: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  await initSkillsDir();
  const absoluteBasePath = path.join(skillsDir, skillName);
  await writeLocalRepoFileByPath(absoluteBasePath, relativePath, content);
}

/**
 * Write a single file using an absolute base directory path.
 * Mirrors writeLocalRepoFile but accepts the resolved repo path directly
 * (e.g. for skills with a custom local_repo_path).
 */
export async function writeLocalRepoFileByPath(
  absoluteBasePath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  await initSkillsDir();
  const normalizedBasePath = normalizeRepoBaseDirectory(absoluteBasePath);
  const { fullPath } = await resolveRepoTargetPath(
    normalizedBasePath,
    relativePath,
    { ensureBaseExists: true, allowOutsideSkillsDir: true },
  );
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

export async function writeLocalRepoFileBufferByPath(
  absoluteBasePath: string,
  relativePath: string,
  content: Uint8Array,
): Promise<void> {
  await initSkillsDir();
  const normalizedBasePath = normalizeRepoBaseDirectory(absoluteBasePath);
  const { fullPath } = await resolveRepoTargetPath(
    normalizedBasePath,
    relativePath,
    { ensureBaseExists: true, allowOutsideSkillsDir: true },
  );
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content);
}

// ==================== Delete ====================

/**
 * Delete a single file from the local skill repo.
 */
export async function deleteLocalRepoFile(
  skillName: string,
  relativePath: string,
): Promise<void> {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  await initSkillsDir();
  const absoluteBasePath = path.join(skillsDir, skillName);
  await deleteLocalRepoFileByPath(absoluteBasePath, relativePath);
}

/**
 * Delete a single file using an absolute base directory path.
 */
export async function deleteLocalRepoFileByPath(
  absoluteBasePath: string,
  relativePath: string,
): Promise<void> {
  const normalizedBasePath = normalizeRepoBaseDirectory(absoluteBasePath);
  const { fullPath } = await resolveRepoTargetPath(
    normalizedBasePath,
    relativePath,
    { allowOutsideSkillsDir: true },
  );
  await fs.rm(fullPath, { recursive: true, force: true });
}

// ==================== Directory creation ====================

/**
 * Create a sub-directory inside the local skill repo.
 * Uses resolveRepoTargetPath() to prevent path traversal via symlinks.
 */
export async function createLocalRepoDir(
  skillName: string,
  relativePath: string,
): Promise<void> {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  validateRelativePath(relativePath);
  await initSkillsDir();

  const basePath = path.join(skillsDir, skillName);
  // Ensure the skill base directory exists first
  await fs.mkdir(basePath, { recursive: true });
  const { fullPath } = await resolveRepoTargetPath(basePath, relativePath, {
    ensureBaseExists: true,
  });
  await fs.mkdir(fullPath, { recursive: true });
}

/**
 * Create a sub-directory using an absolute base directory path.
 */
export async function createLocalRepoDirByPath(
  absoluteBasePath: string,
  relativePath: string,
): Promise<void> {
  await initSkillsDir();
  const normalizedBasePath = normalizeRepoBaseDirectory(absoluteBasePath);
  const { fullPath } = await resolveRepoTargetPath(
    normalizedBasePath,
    relativePath,
    { ensureBaseExists: true, allowOutsideSkillsDir: true },
  );
  await fs.mkdir(fullPath, { recursive: true });
}

// ==================== Rename ====================

export async function renameLocalRepoPathByPath(
  absoluteBasePath: string,
  oldRelativePath: string,
  newRelativePath: string,
): Promise<void> {
  const normalizedBasePath = normalizeRepoBaseDirectory(absoluteBasePath);
  const { fullPath: oldFullPath } = await resolveRepoTargetPath(
    normalizedBasePath,
    oldRelativePath,
    { allowOutsideSkillsDir: true },
  );
  const { fullPath: newFullPath } = await resolveRepoTargetPath(
    normalizedBasePath,
    newRelativePath,
    { ensureBaseExists: true, allowOutsideSkillsDir: true },
  );

  await fs.mkdir(path.dirname(newFullPath), { recursive: true });
  await fs.rename(oldFullPath, newFullPath);
}

/**
 * Return the absolute path of a skill's local repo directory.
 */
export function getLocalRepoPath(skillName: string): string {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  return path.join(skillsDir, skillName);
}

export function getLocalRepoPathForSkillId(skillId: string): string {
  const normalizedSkillId = skillId.trim();
  if (!normalizedSkillId) {
    throw new Error("Skill id cannot be empty");
  }
  if (normalizedSkillId.includes("/") || normalizedSkillId.includes("\\")) {
    throw new Error("Skill id must not contain path separators");
  }
  return path.join(
    getManagedContainerPathFromInstanceKey(normalizedSkillId),
    MANAGED_REPO_DIRNAME,
  );
}

export function getLocalRepoContainerPathForSkillId(skillId: string): string {
  const normalizedSkillId = skillId.trim();
  if (!normalizedSkillId) {
    throw new Error("Skill id cannot be empty");
  }
  if (normalizedSkillId.includes("/") || normalizedSkillId.includes("\\")) {
    throw new Error("Skill id must not contain path separators");
  }
  return getManagedContainerPathFromInstanceKey(normalizedSkillId);
}

export async function ensureManagedVariantContainer(
  skill: Pick<Skill, "id" | "name" | "source_id" | "source_url" | "directory_fingerprint" | "logical_name" | "variant_key">,
  mode: "copy" | "symlink",
): Promise<{ containerDir: string; repoDir: string }> {
  const containerDir = getLocalRepoContainerPathForSkillId(skill.id);
  const repoDir = getLocalRepoPathForSkillId(skill.id);
  await initSkillsDir();
  await fs.mkdir(containerDir, { recursive: true });
  await writeVariantSidecarFiles(containerDir, buildSkillVariantSourceMetadata(skill, mode));
  return { containerDir, repoDir };
}

export async function saveToLocalRepoBySkillId(
  skillOrId:
    | string
    | Pick<Skill, "id" | "name" | "source_id" | "source_url" | "directory_fingerprint" | "logical_name" | "variant_key">,
  sourceDir: string,
  mode: "copy" | "symlink" = "copy",
): Promise<string> {
  const skill =
    typeof skillOrId === "string"
      ? ({ id: skillOrId, name: skillOrId } as Pick<Skill, "id" | "name">)
      : skillOrId;
  const { containerDir, repoDir } = await ensureManagedVariantContainer(skill, mode);
  const sourceStat = await fs.stat(sourceDir).catch((error: unknown) => {
    if (getErrorCode(error) === "ENOENT") {
      throw new Error(`Invalid sourceDir: directory does not exist: ${sourceDir}`);
    }
    throw error;
  });
  if (!sourceStat.isDirectory()) {
    throw new Error(`Invalid sourceDir: not a directory: ${sourceDir}`);
  }

  if (await fileExists(repoDir)) {
    await fs.rm(repoDir, { recursive: true, force: true });
  }

  if (mode === "symlink") {
    const canonicalSourceDir = await fs.realpath(sourceDir);
    await fs.symlink(canonicalSourceDir, repoDir, "dir");
    return repoDir;
  }

  await fs.cp(sourceDir, repoDir, {
    recursive: true,
    filter: async (src: string) => {
      try {
        const stat = await fs.lstat(src);
        return !stat.isSymbolicLink();
      } catch {
        return false;
      }
    },
  });

  await writeVariantSidecarFiles(
    containerDir,
    buildSkillVariantSourceMetadata(skill, mode),
  );
  return repoDir;
}

export async function saveContentToLocalRepoBySkillId(
  skillOrId:
    | string
    | Pick<Skill, "id" | "name" | "source_id" | "source_url" | "directory_fingerprint" | "logical_name" | "variant_key">,
  content: string,
): Promise<string> {
  const skill =
    typeof skillOrId === "string"
      ? ({ id: skillOrId, name: skillOrId } as Pick<Skill, "id" | "name">)
      : skillOrId;
  const { containerDir, repoDir } = await ensureManagedVariantContainer(skill, "copy");
  await fs.mkdir(repoDir, { recursive: true });
  await fs.writeFile(path.join(repoDir, "SKILL.md"), content, "utf-8");
  await writeVariantSidecarFiles(
    containerDir,
    buildSkillVariantSourceMetadata(skill, "copy"),
  );
  return repoDir;
}

export async function renameManagedLocalRepo(
  oldSkillName: string,
  newSkillName: string,
  existingRepoPath?: string | null,
): Promise<string | null> {
  validateSkillName(oldSkillName);
  validateSkillName(newSkillName);
  await initSkillsDir();

  if (existingRepoPath && !(await isManagedRepoPath(existingRepoPath))) {
    return existingRepoPath;
  }

  const sourcePath = existingRepoPath
    ? path.resolve(existingRepoPath)
    : getLocalRepoPath(oldSkillName);
  const targetPath = getLocalRepoPath(newSkillName);

  if (sourcePath === targetPath) {
    return targetPath;
  }

  if (!(await fileExists(sourcePath))) {
    return targetPath;
  }

  if (await fileExists(targetPath)) {
    throw new Error(`Local repo already exists for skill: ${newSkillName}`);
  }

  await fs.rename(sourcePath, targetPath);
  return targetPath;
}

/**
 * Delete the local repo directory for a single skill.
 *
 * If the directory does not exist, this method silently succeeds.
 */
export async function deleteLocalRepo(skillName: string): Promise<void> {
  const skillsDir = getSkillsDirAccessor();
  validateSkillName(skillName);
  const dirPath = path.join(skillsDir, skillName);

  if (await fileExists(dirPath)) {
    await fs.rm(dirPath, { recursive: true, force: true });
  }
}

/**
 * Delete a local repo directory given its absolute path.
 * Applies path containment validation before deletion to prevent traversal.
 *
 * If the directory does not exist, this method silently succeeds.
 */
export async function deleteRepoByPath(absolutePath: string): Promise<void> {
  const skillsDir = getSkillsDirAccessor();
  const resolved = path.resolve(absolutePath);
  const realSkillsDir = await fs
    .realpath(path.resolve(skillsDir))
    .catch(() => path.resolve(skillsDir));
  const realResolved = await fs.realpath(resolved).catch(() => resolved);
  const relative = path.relative(skillsDir, resolved);
  const realRelative = path.relative(realSkillsDir, realResolved);
  if (
    (relative.startsWith("..") || path.isAbsolute(relative)) &&
    (realRelative.startsWith("..") || path.isAbsolute(realRelative))
  ) {
    console.error(
      `[Security] Path traversal blocked on delete: ${absolutePath}`,
    );
    throw new Error(
      "Path traversal detected: path is outside skills directory",
    );
  }

  // Directly attempt removal instead of check-then-delete (TOCTOU prevention)
  try {
    await fs.rm(resolved, { recursive: true, force: true });
  } catch (error: unknown) {
    if (getErrorCode(error) !== "ENOENT") {
      throw error;
    }
    // ENOENT is fine — directory was already gone
  }
}

/**
 * Delete all local repo directories and recreate an empty skills root.
 *
 * If the skills root does not exist, it is created.
 */
export async function deleteAllLocalRepos(): Promise<void> {
  const skillsRoot = getSkillsDirAccessor();

  if (await fileExists(skillsRoot)) {
    await fs.rm(skillsRoot, { recursive: true, force: true });
  }

  await fs.mkdir(skillsRoot, { recursive: true });
}

// ==================== Atomic replace ====================

/**
 * Replace all files in a local repo using an absolute repo path.
 * Uses a staging directory for atomic replacement: writes to a temp dir first,
 * then swaps with the original to prevent data loss on partial failure.
 */
export async function replaceLocalRepoFilesByPath(
  absoluteBasePath: string,
  filesSnapshot: { relativePath: string; content: string }[],
): Promise<void> {
  const normalizedBasePath = normalizeRepoBaseDirectory(absoluteBasePath);
  const { resolvedBasePath } = await resolveRepoBasePath(normalizedBasePath, {
    ensureExists: true,
  });

  // Stage writes in a temp directory next to the target
  const stagingDir = `${resolvedBasePath}.staging-${Date.now()}`;
  await fs.mkdir(stagingDir, { recursive: true });

  try {
    const realStagingDir = await fs
      .realpath(stagingDir)
      .catch(() => stagingDir);

    for (const file of filesSnapshot) {
      validateRelativePath(file.relativePath);
      const fullPath = path.resolve(stagingDir, file.relativePath);
      const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
      const realBasedFullPath = path.resolve(realStagingDir, file.relativePath);
      if (
        !isPathWithin(realStagingDir, fullPath) &&
        !isPathWithin(realStagingDir, realFullPath) &&
        !isPathWithin(realStagingDir, realBasedFullPath)
      ) {
        throw new Error("Path traversal detected while restoring repo files");
      }
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, "utf-8");
    }

    // Atomic swap: remove old, rename staging into place
    const backupDir = `${resolvedBasePath}.old-${Date.now()}`;
    const hadOriginal = await fileExists(resolvedBasePath);
    if (hadOriginal) {
      await fs.rename(resolvedBasePath, backupDir);
    }
    try {
      await fs.rename(stagingDir, resolvedBasePath);
      // Clean up the backup only after successful rename
      if (hadOriginal) {
        await fs.rm(backupDir, { recursive: true, force: true });
      }
    } catch (renameError) {
      // Restore from backup on failure
      if (hadOriginal) {
        await fs.rename(backupDir, resolvedBasePath).catch(() => {
          // Best effort restoration
        });
      }
      throw renameError;
    }
  } catch (error) {
    // Clean up staging on any error
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
