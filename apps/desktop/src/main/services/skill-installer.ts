/**
 * SkillInstaller — Facade / barrel module.
 *
 * The original ~2 100-line monolith has been split into focused sub-modules.
 * This file re-exports everything through a single `SkillInstaller` class so
 * that **all existing callers keep working with zero import changes**.
 *
 * Sub-modules:
 *   skill-installer-internal   — shared path / validation / init helpers
 *   skill-installer-remote     — SSRF protection & HTTP(S) fetching
 *   skill-installer-repo       — local repo CRUD (read / write / walk / delete)
 *   skill-installer-platform   — MCP platform & SKILL.md multi-platform mgmt
 *   skill-installer-export     — exportAsSkillMd / exportAsJson / importFromJson
 */
import * as fs from "fs/promises";
import * as path from "path";
import type {
  GitHubRepoMetadata,
  GitHubTreeEntry,
  GitHubTreeResponse,
  RegistrySkill,
  SafetyScanAIConfig,
  ScannedSkill,
  ScanLocalResult,
  Skill,
} from "@prompthub/shared/types";
import { isGitHubHost, parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { buildSkillSourceId } from "@prompthub/shared/utils/skill-identity";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { installSkillFromSource } from "../../../../../packages/core/src/skills/install-flow";
import { initDatabase } from "@/main/database";
import { SkillDB } from "@/main/database/skill";
import { readGithubTokenSetting } from "@/main/settings/settings-readers";
import { sanitizeImportedSkillDraft } from "./skill-import-sanitize";
import { parseSkillMd } from "./skill-validator";
export { SkillSafetyReviewRequiredError } from "./skill-update-safety";

function buildSkillFingerprintFields(directoryFingerprint: string) {
  return {
    directory_fingerprint: directoryFingerprint,
    fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
  };
}

function computePackageDirectoryFingerprint(
  entries: Parameters<typeof computeSkillPackageFingerprintV1Sync>[0],
): string {
  return computeSkillPackageFingerprintV1Sync(entries).fingerprint;
}
import {
  gitClone,
  gitGetCurrentBranch,
  gitListRemoteBranches,
  resolvePlatformPath,
} from "./skill-installer-utils";

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function slugifySkillName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function encodePathSegments(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

interface InstalledSkillRemoteSourceRow {
  source_url: string | null;
  content_url: string | null;
}

function parseHttpUrl(value: string | null | undefined): URL | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    return ["http:", "https:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeUrlPath(pathname: string): string {
  return pathname.replace(/\/+$/g, "");
}

function isUrlWithinSourceScope(target: URL, source: URL): boolean {
  if (target.origin !== source.origin) {
    return false;
  }

  const targetPath = normalizeUrlPath(target.pathname);
  const sourcePath = normalizeUrlPath(source.pathname);
  return targetPath === sourcePath || targetPath.startsWith(`${sourcePath}/`);
}

function isTrustedInstalledSkillRemoteUrl(
  targetUrl: string,
  rows: InstalledSkillRemoteSourceRow[],
): boolean {
  const target = parseHttpUrl(targetUrl);
  if (!target) {
    return false;
  }

  return rows.some((row) => {
    const contentUrl = parseHttpUrl(row.content_url);
    if (contentUrl?.href === target.href) {
      return true;
    }

    const sourceUrl = parseHttpUrl(row.source_url);
    return sourceUrl ? isUrlWithinSourceScope(target, sourceUrl) : false;
  });
}

function readInstalledSkillRemoteSources(
  db: { prepare?: (sql: string) => { all?: () => unknown[] } } | null,
): InstalledSkillRemoteSourceRow[] {
  if (!db || typeof db.prepare !== "function") {
    return [];
  }

  const statement = db.prepare(
    `SELECT source_url, content_url
     FROM skills
     WHERE (source_url IS NOT NULL AND source_url != '')
        OR (content_url IS NOT NULL AND content_url != '')`,
  );
  const rows = statement?.all?.();

  return Array.isArray(rows)
    ? rows.filter(
        (row): row is InstalledSkillRemoteSourceRow =>
          typeof row === "object" &&
          row !== null &&
          ("source_url" in row || "content_url" in row),
      )
    : [];
}

function isRemoteTreeEntry(
  value: unknown,
): value is GitHubTreeEntry & { path: string; type: string; sha?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function isSkillMarkdownPath(filePath: string): boolean {
  return filePath === "SKILL.md" || filePath.endsWith("/SKILL.md");
}

function buildRemoteGitStoreUrls(
  parsedRepo: ReturnType<typeof parseGitRepo> & {},
  branch: string,
  skillPath?: string,
): {
  repoApiBase: string;
  treeUrl: string;
  rawUrl?: string;
} {
  if (isGitHubHost(parsedRepo.host)) {
    const repoApiBase = `https://api.github.com/repos/${encodeURIComponent(parsedRepo.owner)}/${encodeURIComponent(parsedRepo.repo)}`;
    return {
      repoApiBase,
      treeUrl: `${repoApiBase}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      rawUrl: skillPath
        ? `https://raw.githubusercontent.com/${encodeURIComponent(parsedRepo.owner)}/${encodeURIComponent(parsedRepo.repo)}/${encodeURIComponent(branch)}/${encodePathSegments(skillPath)}`
        : undefined,
    };
  }

  const repoProtocol = parsedRepo.protocol === "http" ? "http" : "https";
  const repoApiBase = `${repoProtocol}://${parsedRepo.host}/api/v1/repos/${encodeURIComponent(parsedRepo.owner)}/${encodeURIComponent(parsedRepo.repo)}`;
  return {
    repoApiBase,
    treeUrl: `${repoApiBase}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    rawUrl: skillPath
      ? `${repoApiBase}/raw/${encodePathSegments(skillPath)}?ref=${encodeURIComponent(branch)}`
      : undefined,
  };
}

// ---- sub-module re-imports (used inside facade methods) ----
import {
  fileExists,
  getErrorCode,
  getErrorMessage,
  getSkillsDirAccessor,
  initSkillsDir,
  isPathWithin,
  normalizeExistingPath,
  validateRelativePath,
  validateSkillName,
} from "./skill-installer-internal";
import {
  fetchRemoteBytes,
  fetchRemoteText,
  isBlockedHostname,
  isPrivateAddress,
  isPrivateIPv4,
  isPrivateIPv6,
  resolvePublicAddress,
  type FetchRemoteTextOptions,
} from "./skill-installer-remote";
import {
  createLocalRepoDir,
  createLocalRepoDirByPath,
  copyRepoByPathToDirectory,
  deleteAllLocalRepos,
  deleteLocalRepo,
  deleteLocalRepoFile,
  deleteLocalRepoFileByPath,
  deleteManagedVariantContainer,
  deleteRepoByPath,
  getManagedContainerPathForSkill,
  getLocalPathStatus,
  getLocalRepoPath,
  getLocalRepoPathForSkillId,
  getPreferredLocalRepoContainerPathForSkill,
  getPreferredLocalRepoPathForSkill,
  isManagedRepoPath,
  listLocalRepoFiles,
  listLocalRepoFilesByPath,
  materializeManagedRepoSymlink,
  readLocalRepoFile,
  readLocalRepoFileByPath,
  readLocalRepoFileBuffersByPath,
  readLocalRepoFiles,
  readLocalRepoFilesByPath,
  renameLocalRepoPathByPath,
  replaceLocalRepoFilesByPath,
  saveContentToLocalRepo,
  saveContentToLocalRepoBySkillId,
  saveToLocalRepo,
  writeLocalRepoFile,
  writeLocalRepoFileBufferByPath,
  writeLocalRepoFileByPath,
} from "./skill-installer-repo";
import {
  beginManagedRepoReplacement,
  saveToLocalRepoBySkillId,
} from "./skill-installer-replacement";
import {
  collectSkillDirs,
  collectSkillDirsFromRepo,
  getDefaultSkillScanEntries,
  getScannedSkillInstallMetadata,
  readSkillManifest,
  resolveSingleSkillDirFromRepo,
  resolveSkillDirFromRepo,
} from "./skill-installer-discovery";
import {
  scanAgentPlatformSkills,
  uninstallAgentPlatformSkill,
} from "./skill-installer-agent-discovery";
import {
  detectInstalledPlatforms,
  getSkillMdInstallStatusForSkill,
  getSkillMdInstallStatusDetailsForSkill,
  getPlatformStatus,
  getSkillMdInstallStatus,
  getSkillMdInstallStatusDetails,
  getSupportedPlatforms,
  installSkillMd,
  installSkillMdForSkill,
  installSkillMdSymlink,
  installSkillMdSymlinkForSkill,
  installToPlatform,
  uninstallFromPlatform,
  uninstallSkillMd,
  uninstallSkillMdForSkill,
} from "./skill-installer-platform";
import {
  exportAsJson,
  exportAsSkillMd,
  importFromJson,
} from "./skill-installer-export";
import {
  getRemoteGitSkillPackageFingerprint,
  getRemoteGitSkillPackageSnapshot,
  getRemoteZipSkillPackageSnapshot,
  saveRemoteGitSkillPackage,
  saveRemoteZipSkillPackage,
  type RemoteGitPackageOptions,
  type RemotePackageSkill,
  type RemoteZipPackageOptions,
} from "./skill-installer-remote-package";
import { readValidatedSkillPackageSnapshot } from "./skill-package-snapshot";

// ========================================================================
// Facade class — every static method delegates to the appropriate sub-module
// ========================================================================

export class SkillInstaller {
  // ---- Internal helpers (delegated) ----
  private static get skillsDir(): string {
    return getSkillsDirAccessor();
  }

  // ---- Initialization ----
  static async init(): Promise<void> {
    return initSkillsDir();
  }

  // ---- Remote / SSRF (re-exported for tests & callers) ----
  static fetchRemoteText = fetchRemoteText;
  static fetchRemoteBytes = fetchRemoteBytes;
  static listRemoteBranches = gitListRemoteBranches;

  // ---- Repo CRUD (delegated) ----
  static isManagedRepoPath = isManagedRepoPath;
  static beginManagedRepoReplacement = beginManagedRepoReplacement;
  static saveToLocalRepo = saveToLocalRepo;
  static saveToLocalRepoBySkillId = saveToLocalRepoBySkillId;
  static saveContentToLocalRepo = saveContentToLocalRepo;
  static saveContentToLocalRepoBySkillId = saveContentToLocalRepoBySkillId;
  static readLocalRepoFiles = readLocalRepoFiles;
  static readLocalRepoFilesByPath = readLocalRepoFilesByPath;
  static readLocalRepoFileBuffersByPath = readLocalRepoFileBuffersByPath;
  static listLocalRepoFiles = listLocalRepoFiles;
  static listLocalRepoFilesByPath = listLocalRepoFilesByPath;
  static readLocalRepoFile = readLocalRepoFile;
  static readLocalRepoFileByPath = readLocalRepoFileByPath;
  static writeLocalRepoFile = writeLocalRepoFile;
  static writeLocalRepoFileBufferByPath = writeLocalRepoFileBufferByPath;
  static writeLocalRepoFileByPath = writeLocalRepoFileByPath;
  static deleteLocalRepoFile = deleteLocalRepoFile;
  static deleteLocalRepoFileByPath = deleteLocalRepoFileByPath;
  static createLocalRepoDir = createLocalRepoDir;
  static createLocalRepoDirByPath = createLocalRepoDirByPath;
  static copyRepoByPathToDirectory = copyRepoByPathToDirectory;
  static renameLocalRepoPathByPath = renameLocalRepoPathByPath;
  static getManagedContainerPathForSkill = getManagedContainerPathForSkill;
  static getLocalPathStatus = getLocalPathStatus;
  static getLocalRepoPath = getLocalRepoPath;
  static getLocalRepoPathForSkillId = getLocalRepoPathForSkillId;
  static getPreferredLocalRepoContainerPathForSkill =
    getPreferredLocalRepoContainerPathForSkill;
  static getPreferredLocalRepoPathForSkill = getPreferredLocalRepoPathForSkill;
  static materializeManagedRepoSymlink = materializeManagedRepoSymlink;
  static deleteLocalRepo = deleteLocalRepo;
  static deleteManagedVariantContainer = deleteManagedVariantContainer;
  static deleteRepoByPath = deleteRepoByPath;
  static deleteAllLocalRepos = deleteAllLocalRepos;
  static replaceLocalRepoFilesByPath = replaceLocalRepoFilesByPath;

  // ---- Platform management (delegated) ----
  static installToPlatform = installToPlatform;
  static uninstallFromPlatform = uninstallFromPlatform;
  static getPlatformStatus = getPlatformStatus;
  static getSupportedPlatforms = getSupportedPlatforms;
  static detectInstalledPlatforms = detectInstalledPlatforms;
  static installSkillMd = installSkillMd;
  static installSkillMdForSkill = installSkillMdForSkill;
  static uninstallSkillMd = uninstallSkillMd;
  static uninstallSkillMdForSkill = uninstallSkillMdForSkill;
  static getSkillMdInstallStatus = getSkillMdInstallStatus;
  static getSkillMdInstallStatusForSkill = getSkillMdInstallStatusForSkill;
  static getSkillMdInstallStatusDetails = getSkillMdInstallStatusDetails;
  static getSkillMdInstallStatusDetailsForSkill =
    getSkillMdInstallStatusDetailsForSkill;
  static installSkillMdSymlink = installSkillMdSymlink;
  static installSkillMdSymlinkForSkill = installSkillMdSymlinkForSkill;

  static scanPlatformSkills(
    platformId: string,
    options: { homeDir?: string } = {},
  ) {
    return scanAgentPlatformSkills(
      platformId,
      (paths) => this.scanLocalPreview(paths),
      options,
    );
  }

  static uninstallPlatformSkill = uninstallAgentPlatformSkill;

  // ---- Export / import (delegated) ----
  static exportAsSkillMd = exportAsSkillMd;
  static exportAsJson = exportAsJson;
  static importFromJson = importFromJson;

  // ========================================================================
  // Methods that orchestrate across multiple sub-modules stay in this file
  // ========================================================================

  private static readManifest = readSkillManifest;

  // ---- Install methods (orchestrating across sub-modules) ----

  static async installFromGithub(url: string, db: SkillDB): Promise<string> {
    await this.init();

    const parsedRepo = parseGitRepo(url);
    if (!parsedRepo) {
      throw new Error(
        "Invalid git repository URL: must be https://<host>/{owner}/{repo} or git@<host>:{owner}/{repo}.git",
      );
    }
    const userDir = parsedRepo.owner;
    const repoName = parsedRepo.repo;
    const installDir = path.join(this.skillsDir, `${userDir}-${repoName}`);

    // Validate installDir is inside skillsDir before writing to DB
    const skillsDirResolved = path.resolve(this.skillsDir);
    const installDirResolved = path.resolve(installDir);
    const installRelative = path.relative(
      skillsDirResolved,
      installDirResolved,
    );
    if (installRelative.startsWith("..") || path.isAbsolute(installRelative)) {
      throw new Error(
        "Path traversal detected: installDir is outside skills directory",
      );
    }

    // Check if skill already installed (by directory existence)
    try {
      await fs.access(installDir);
      throw new Error(
        `Skill ${userDir}/${repoName} already exists. Please delete it first.`,
      );
    } catch (error: unknown) {
      if (getErrorCode(error) !== "ENOENT") throw error;
    }

    // Also check if a skill with the same repo-derived name exists in DB
    // to provide a clear error before attempting git clone.
    const derivedName = repoName;
    const existingByName = db.getByName(derivedName);
    if (existingByName) {
      throw new Error(
        `A skill named "${derivedName}" already exists in the library (id: ${existingByName.id}). ` +
          `Delete it first or use a different repository.`,
      );
    }

    let createdSkill: {
      id: string;
      name: string;
      source_id?: string | null;
      variant_key?: string | null;
      local_repo_path?: string | null;
    } | null = null;
    let managedRepoPath: string | null = null;

    try {
      console.log(`Cloning ${parsedRepo.cloneUrl} to ${installDir}`);
      await gitClone(parsedRepo.cloneUrl, installDir);
      const skillDir = await this.resolveSingleSkillDirFromRepo(installDir);

      // Parse metadata
      const manifest = await this.readManifest(skillDir);

      // Load instructions from SKILL.md if not in manifest
      if (!manifest.instructions) {
        try {
          manifest.instructions = await fs.readFile(
            path.join(skillDir, "SKILL.md"),
            "utf-8",
          );
        } catch (e) {
          console.error("Failed to read SKILL.md:", e);
        }
      }

      // If still no instructions, maybe README.md?
      if (!manifest.instructions) {
        try {
          manifest.instructions = await fs.readFile(
            path.join(installDir, "README.md"),
            "utf-8",
          );
        } catch (e) {
          console.error("Failed to read README.md:", e);
        }
      }

      if (!manifest.instructions) {
        console.warn(
          `No SKILL.md, README.md, or manifest instructions found in ${installDir}. ` +
            `Skill will be created with empty content.`,
        );
      }

      // Create Skill in DB first, then move the cloned repo into the managed
      // variant container so all My Skills entries share one disk layout.
      const repoFiles = await this.readLocalRepoFileBuffersByPath(skillDir);
      const sourceDirectory =
        path.relative(installDir, skillDir).replace(/\\/g, "/") || undefined;
      const skill = db.create({
        name: manifest.name || repoName,
        description: manifest.description || `Installed from ${url}`,
        version: manifest.version || "1.0.0",
        author: manifest.author || userDir,
        content: manifest.instructions || "",
        instructions: manifest.instructions || "",
        protocol_type: "skill",
        source_url: url,
        source_label: `${userDir}/${repoName}`,
        source_directory: sourceDirectory,
        canonical_skill_path: sourceDirectory
          ? `${sourceDirectory}/SKILL.md`
          : "SKILL.md",
        local_repo_path: installDir,
        ...buildSkillFingerprintFields(
          computePackageDirectoryFingerprint(repoFiles),
        ),
        is_favorite: false,
        tags: [],
        original_tags: manifest.tags || ["github"],
      });
      createdSkill = skill;

      managedRepoPath = await saveToLocalRepoBySkillId(skill, skillDir);
      if (managedRepoPath !== skill.local_repo_path) {
        db.update(skill.id, { local_repo_path: managedRepoPath });
      }

      const managedRepoResolved = path.resolve(managedRepoPath);
      if (
        managedRepoResolved !== installDirResolved &&
        !isPathWithin(installDirResolved, managedRepoResolved)
      ) {
        await fs.rm(installDir, { recursive: true, force: true }).catch((e) => {
          console.error("Failed to clean up temporary clone directory:", e);
        });
      }

      return skill.id;
    } catch (error) {
      console.error("Installation failed:", error);
      if (createdSkill) {
        try {
          await deleteManagedVariantContainer(createdSkill);
        } catch (cleanupError) {
          console.error("Failed to clean up managed skill repo:", cleanupError);
        }
        try {
          db.delete(createdSkill.id);
        } catch (rollbackError) {
          console.error(
            "Failed to roll back created skill row:",
            rollbackError,
          );
        }
      }
      // Clean up
      try {
        await fs.rm(installDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Failed to clean up install directory:", e);
      }
      throw error;
    }
  }

  static async installFromSource(
    source: string,
    db: SkillDB,
    options?: { name?: string },
  ): Promise<string> {
    return installSkillFromSource(
      source,
      db,
      {
        fetchRemoteContent: this.fetchRemoteContent,
        importFromJson: this.importFromJson,
        installFromGithub: this.installFromGithub.bind(this),
        installFromSkillContent: this.installFromSkillContent.bind(this),
      },
      options,
    );
  }

  static async installFromLocalPath(
    sourcePath: string,
    db: SkillDB,
    options?: { name?: string },
  ): Promise<string> {
    const resolvedSourcePath = path.resolve(sourcePath);
    const sourceStat = await fs.stat(resolvedSourcePath).catch(() => null);

    if (!sourceStat) {
      throw new Error(`Skill source not found: ${resolvedSourcePath}`);
    }

    if (sourceStat.isDirectory()) {
      const skillMdPath = path.join(resolvedSourcePath, "SKILL.md");
      const skillMdExists = await fileExists(skillMdPath);

      if (!skillMdExists) {
        throw new Error(
          `SKILL.md not found in directory: ${resolvedSourcePath}`,
        );
      }

      const skillContent = await fs.readFile(skillMdPath, "utf-8");
      return this.installFromSkillContent(skillContent, db, {
        name: options?.name,
        sourceUrl: resolvedSourcePath,
        repoSourceDir: resolvedSourcePath,
      });
    }

    const extension = path.extname(resolvedSourcePath).toLowerCase();
    if (extension === ".json") {
      const jsonContent = await fs.readFile(resolvedSourcePath, "utf-8");
      return this.importFromJson(jsonContent, db);
    }

    const fileContent = await fs.readFile(resolvedSourcePath, "utf-8");
    return this.installFromSkillContent(fileContent, db, {
      name: options?.name,
      sourceUrl: resolvedSourcePath,
      repoSourceDir:
        path.basename(resolvedSourcePath).toLowerCase() === "skill.md"
          ? path.dirname(resolvedSourcePath)
          : undefined,
    });
  }

  static async installFromSkillContent(
    skillContent: string,
    db: SkillDB,
    options?: {
      name?: string;
      sourceUrl?: string;
      repoSourceDir?: string;
      repoImportMode?: "copy" | "symlink";
    },
  ): Promise<string> {
    const parsed = parseSkillMd(skillContent);
    const manifest = options?.repoSourceDir
      ? await this.readManifest(options.repoSourceDir)
      : {};
    const fallbackName = options?.repoSourceDir
      ? path.basename(options.repoSourceDir)
      : undefined;
    const skillName =
      options?.name?.trim() ||
      parsed?.frontmatter.name ||
      manifest.name ||
      fallbackName;

    if (!skillName || !skillName.trim()) {
      throw new Error(
        "Skill name is required; pass --name or add SKILL.md frontmatter",
      );
    }

    const sanitized = sanitizeImportedSkillDraft(
      {
        name: skillName,
        description: parsed?.frontmatter.description,
        fallbackDescription:
          manifest.description ||
          `Installed from ${options?.sourceUrl || "local source"}`,
        version: parsed?.frontmatter.version,
        fallbackVersion: manifest.version,
        author: parsed?.frontmatter.author,
        fallbackAuthor: manifest.author || "Local",
        tags: parsed?.frontmatter.tags,
        fallbackTags: manifest.tags,
        instructions: skillContent,
        source_url: options?.sourceUrl,
        local_repo_path: options?.repoSourceDir,
        protocol_type: "skill",
      },
      { defaultTags: [] },
    );
    const canonicalSkillPath = options?.repoSourceDir ? "SKILL.md" : undefined;

    // Save files first, then create DB record to avoid orphaned records
    const createdSkill = db.create({
      name: sanitized.name!,
      description: sanitized.description,
      instructions: sanitized.instructions,
      content: sanitized.instructions,
      protocol_type: sanitized.protocol_type,
      version: sanitized.version,
      author: sanitized.author,
      tags: [],
      original_tags: sanitized.tags,
      is_favorite: false,
      source_url: sanitized.source_url,
      source_label: options?.sourceUrl,
      local_repo_path: sanitized.local_repo_path,
      canonical_skill_path: canonicalSkillPath,
    });

    let localRepoPath: string | undefined;
    if (options?.repoSourceDir) {
      localRepoPath = await saveToLocalRepoBySkillId(
        createdSkill,
        options.repoSourceDir,
        options.repoImportMode,
      );
    } else {
      localRepoPath = await saveContentToLocalRepoBySkillId(
        createdSkill,
        skillContent,
      );
    }

    if (localRepoPath && createdSkill.local_repo_path !== localRepoPath) {
      const repoFiles =
        await this.readLocalRepoFileBuffersByPath(localRepoPath);
      db.update(createdSkill.id, {
        local_repo_path: localRepoPath,
        ...buildSkillFingerprintFields(
          computePackageDirectoryFingerprint(repoFiles),
        ),
      });
    } else if (localRepoPath) {
      const repoFiles =
        await this.readLocalRepoFileBuffersByPath(localRepoPath);
      db.update(createdSkill.id, {
        ...buildSkillFingerprintFields(
          computePackageDirectoryFingerprint(repoFiles),
        ),
      });
    }

    return createdSkill.id;
  }

  static saveRemoteGitSkillToLocalRepoBySkillId(
    skill: RemotePackageSkill,
    options: RemoteGitPackageOptions,
  ): Promise<string> {
    return saveRemoteGitSkillPackage(skill, options, (url) =>
      this.fetchRemoteBytes(url),
    );
  }

  static getRemoteGitSkillPackageFingerprint(options: {
    repoUrl: string;
    branch?: string;
    directory?: string;
    skillName?: string;
  }) {
    return getRemoteGitSkillPackageFingerprint(options, (url) =>
      this.fetchRemoteBytes(url),
    );
  }

  static getRemoteGitSkillPackageSnapshot(options: {
    repoUrl: string;
    branch?: string;
    directory?: string;
    skillName?: string;
  }) {
    return getRemoteGitSkillPackageSnapshot(options, (url) =>
      this.fetchRemoteBytes(url),
    );
  }
  static getLocalSkillPackageSnapshot = readValidatedSkillPackageSnapshot;
  static getRemoteZipSkillPackageSnapshot(options: { zipUrl: string }) {
    return getRemoteZipSkillPackageSnapshot(options, this.fetchRemoteBytes);
  }
  static saveRemoteZipSkillToLocalRepoBySkillId(
    skill: RemotePackageSkill,
    options: RemoteZipPackageOptions,
  ): Promise<string> {
    return saveRemoteZipSkillPackage(skill, options, (url) =>
      this.fetchRemoteBytes(url),
    );
  }

  // ---- Scan methods ----

  /**
   * Scan local SKILL.md files from various AI tool directories.
   *
   * Note: This method only scans SKILL.md format skills, NOT MCP configurations.
   */
  static collectSkillDirs = collectSkillDirs;
  static collectSkillDirsFromRepo = collectSkillDirsFromRepo;
  static getScannedSkillInstallMetadata = getScannedSkillInstallMetadata;
  static resolveSingleSkillDirFromRepo = resolveSingleSkillDirFromRepo;
  static resolveSkillDirFromRepo = resolveSkillDirFromRepo;

  static async scanRemoteGithub(
    repoUrl: string,
    registrySkills: RegistrySkill[],
    branch?: string,
    directory?: string,
  ): Promise<RegistrySkill[]> {
    await this.init();

    const parsedRepo = parseGitRepo(repoUrl);
    if (!parsedRepo) {
      throw new Error(
        "Invalid git repository URL: must be https://<host>/{owner}/{repo} or git@<host>:{owner}/{repo}.git",
      );
    }

    if (parsedRepo.protocol === "ssh" && isGitHubHost(parsedRepo.host)) {
      return this.scanRemoteGitRepoViaClone(
        parsedRepo,
        registrySkills,
        branch,
        directory,
      );
    }

    const initialUrls = buildRemoteGitStoreUrls(
      parsedRepo,
      branch?.trim() || "main",
    );
    const repoFetchOptions: FetchRemoteTextOptions = {
      allowPrivateNetwork: !isGitHubHost(parsedRepo.host),
    };
    if (parsedRepo.protocol === "http" && !isGitHubHost(parsedRepo.host)) {
      repoFetchOptions.allowInsecurePrivateNetworkHttp = true;
    }
    const repoMetaRaw = await this.fetchRemoteContent(
      initialUrls.repoApiBase,
      repoFetchOptions,
    );
    const repoMeta = parseJson<GitHubRepoMetadata>(repoMetaRaw || "{}", {});
    const normalizedBranch =
      branch?.trim() || repoMeta.default_branch || "main";
    const normalizedDirectory = directory?.trim().replace(/^\/+|\/+$/g, "");
    const remoteUrls = buildRemoteGitStoreUrls(parsedRepo, normalizedBranch);
    const treeRaw = await this.fetchRemoteContent(
      remoteUrls.treeUrl,
      repoFetchOptions,
    );
    const treeData = parseJson<GitHubTreeResponse>(treeRaw || "{}", {});
    const treeEntries = Array.isArray(treeData.tree)
      ? treeData.tree.filter(isRemoteTreeEntry)
      : [];
    const directoryPrefix = normalizedDirectory
      ? `${normalizedDirectory}/`
      : "";
    const skillFiles = treeEntries.filter(
      (item) =>
        item.type === "blob" &&
        isSkillMarkdownPath(item.path) &&
        (!directoryPrefix || item.path.startsWith(directoryPrefix)),
    );

    const scannedSkills: Array<RegistrySkill | null> = await Promise.all(
      skillFiles.map(async (item): Promise<RegistrySkill | null> => {
        const canonicalSkillPath = item.path.replace(/^\/+|\/+$/g, "");
        const sourceDirectory =
          canonicalSkillPath.toLowerCase() === "skill.md"
            ? normalizedDirectory || undefined
            : path.posix.dirname(canonicalSkillPath);
        const rawUrl = buildRemoteGitStoreUrls(
          parsedRepo,
          normalizedBranch,
          canonicalSkillPath,
        ).rawUrl;
        if (!rawUrl) {
          return null;
        }
        const content = await this.fetchRemoteContent(
          rawUrl,
          repoFetchOptions,
        ).catch(() => "");
        if (!content.trim()) {
          return null;
        }

        const parsedSkill = parseSkillMd(content);
        const directoryName = sourceDirectory
          ? sourceDirectory.split("/").filter(Boolean).at(-1) || ""
          : "";
        const slug = slugifySkillName(
          parsedSkill?.frontmatter.name || directoryName || parsedRepo.repo,
        );
        const builtin = registrySkills.find((item) => item.slug === slug);
        const name =
          builtin?.name ||
          parsedSkill?.frontmatter.name ||
          toTitleCase(slug || parsedRepo.repo);
        const description =
          builtin?.description ||
          parsedSkill?.frontmatter.description ||
          `${name} skill`;
        const sourceRepoUrl = sourceDirectory
          ? `${parsedRepo.repositoryUrl}/tree/${encodeURIComponent(normalizedBranch)}/${sourceDirectory}`
          : `${parsedRepo.repositoryUrl}/tree/${encodeURIComponent(normalizedBranch)}`;
        const sourceId = buildSkillSourceId({
          sourceType: "git-repo",
          sourceUrl: parsedRepo.repositoryUrl,
          branch: normalizedBranch,
          directory: sourceDirectory,
          skillPath: canonicalSkillPath,
        });

        return {
          slug,
          name,
          install_name: parsedSkill?.frontmatter.name || undefined,
          source_id: sourceId,
          source_label: `${parsedRepo.owner}/${parsedRepo.repo}`,
          source_branch: normalizedBranch,
          source_directory: sourceDirectory,
          canonical_skill_path: canonicalSkillPath,
          directory_fingerprint: undefined,
          description,
          category: builtin?.category || "general",
          icon_url: builtin?.icon_url,
          icon_background: builtin?.icon_background,
          icon_emoji: builtin?.icon_emoji,
          author:
            builtin?.author ||
            parsedSkill?.frontmatter.author ||
            parsedRepo.owner,
          source_url: sourceRepoUrl,
          tags: builtin?.tags?.length
            ? builtin.tags
            : parsedSkill?.frontmatter.tags?.length
              ? parsedSkill.frontmatter.tags
              : slug.split("-").filter(Boolean),
          version:
            builtin?.version || parsedSkill?.frontmatter.version || "1.0.0",
          content,
          content_url: rawUrl,
          prerequisites: builtin?.prerequisites,
          compatibility: builtin?.compatibility || ["claude", "cursor"],
        } satisfies RegistrySkill;
      }),
    );

    return scannedSkills.filter(
      (skill): skill is RegistrySkill => skill !== null,
    );
  }

  private static async scanRemoteGitRepoViaClone(
    parsedRepo: ReturnType<typeof parseGitRepo> & {},
    registrySkills: RegistrySkill[],
    branch?: string,
    directory?: string,
  ): Promise<RegistrySkill[]> {
    const tempRoot = await fs.mkdtemp(
      path.join(this.skillsDir, ".remote-scan-"),
    );
    const repoDir = path.join(
      tempRoot,
      `${parsedRepo.owner}-${parsedRepo.repo}`,
    );

    try {
      await gitClone(parsedRepo.cloneUrl, repoDir, branch);

      const normalizedBranch =
        branch?.trim() || (await gitGetCurrentBranch(repoDir)) || "main";
      const normalizedDirectory = directory?.trim().replace(/^\/+|\/+$/g, "");
      const searchRoot = normalizedDirectory
        ? path.resolve(repoDir, normalizedDirectory)
        : repoDir;

      if (!isPathWithin(repoDir, searchRoot)) {
        throw new Error(
          "Path traversal detected: skill directory is outside repository",
        );
      }
      if (!(await fileExists(searchRoot))) {
        throw new Error(
          `Skill directory does not exist in repository: ${normalizedDirectory}`,
        );
      }

      const skillDirs = await this.collectSkillDirsFromRepo(searchRoot);
      const scannedSkills = await Promise.all(
        skillDirs.map(async (skillDir): Promise<RegistrySkill | null> => {
          const skillMdPath = path.join(skillDir, "SKILL.md");
          const content = await fs
            .readFile(skillMdPath, "utf-8")
            .catch(() => "");
          if (!content.trim()) {
            return null;
          }

          const parsedSkill = parseSkillMd(content);
          const sourceDirectory = path
            .relative(repoDir, skillDir)
            .replace(/\\/g, "/");
          const canonicalSkillPath = path.posix.join(
            sourceDirectory,
            "SKILL.md",
          );
          const slug = slugifySkillName(
            parsedSkill?.frontmatter.name ||
              path.basename(skillDir) ||
              parsedRepo.repo,
          );
          const builtin = registrySkills.find((item) => item.slug === slug);
          const name =
            builtin?.name ||
            parsedSkill?.frontmatter.name ||
            toTitleCase(slug || parsedRepo.repo);
          const description =
            builtin?.description ||
            parsedSkill?.frontmatter.description ||
            `${name} skill`;
          const sourceUrl = `${parsedRepo.repositoryUrl}/tree/${encodeURIComponent(normalizedBranch)}/${sourceDirectory}`;
          const sourceId = buildSkillSourceId({
            sourceType: "git-repo",
            sourceUrl: parsedRepo.repositoryUrl,
            branch: normalizedBranch,
            directory: sourceDirectory,
            skillPath: canonicalSkillPath,
          });
          const rawUrl = buildRemoteGitStoreUrls(
            parsedRepo,
            normalizedBranch,
            canonicalSkillPath,
          ).rawUrl;

          return {
            slug,
            name,
            install_name: parsedSkill?.frontmatter.name || undefined,
            source_id: sourceId,
            source_label: `${parsedRepo.owner}/${parsedRepo.repo}`,
            source_branch: normalizedBranch,
            source_directory: sourceDirectory,
            canonical_skill_path: canonicalSkillPath,
            directory_fingerprint: computePackageDirectoryFingerprint(
              await this.readLocalRepoFileBuffersByPath(skillDir),
            ),
            description,
            category: builtin?.category || "general",
            icon_url: builtin?.icon_url,
            icon_background: builtin?.icon_background,
            icon_emoji: builtin?.icon_emoji,
            author:
              builtin?.author ||
              parsedSkill?.frontmatter.author ||
              parsedRepo.owner,
            source_url: sourceUrl,
            tags: builtin?.tags?.length
              ? builtin.tags
              : parsedSkill?.frontmatter.tags?.length
                ? parsedSkill.frontmatter.tags
                : slug.split("-").filter(Boolean),
            version:
              builtin?.version || parsedSkill?.frontmatter.version || "1.0.0",
            content,
            content_url: rawUrl,
            prerequisites: builtin?.prerequisites,
            compatibility: builtin?.compatibility || ["claude", "cursor"],
          } satisfies RegistrySkill;
        }),
      );

      return scannedSkills.filter(
        (skill): skill is RegistrySkill => skill !== null,
      );
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  static async scanLocal(db: SkillDB): Promise<ScanLocalResult> {
    let count = 0;
    const skipped: string[] = [];
    const scanPaths = getDefaultSkillScanEntries(this.skillsDir).map(
      (entry) => entry.path,
    );

    for (const scanPath of scanPaths) {
      if (!(await fileExists(scanPath))) {
        console.log(`Scan path does not exist, skipping: ${scanPath}`);
        continue;
      }

      try {
        console.log(`Scanning path for skills: ${scanPath}`);
        const skillDirs = await this.collectSkillDirs(scanPath);

        for (const skillFolderPath of skillDirs) {
          const skillMdPath = path.join(skillFolderPath, "SKILL.md");
          let skillDisplayName = path.basename(skillFolderPath);

          try {
            const instructions = await fs.readFile(skillMdPath, "utf-8");
            const manifest = await this.readManifest(skillFolderPath);

            // Use the skill-validator to parse SKILL.md frontmatter
            const parsedSkill = parseSkillMd(instructions);

            const sanitized = sanitizeImportedSkillDraft(
              {
                name: parsedSkill?.frontmatter.name,
                fallbackName: manifest.name || path.basename(skillFolderPath),
                description: parsedSkill?.frontmatter.description,
                fallbackDescription: manifest.description || undefined,
                version: parsedSkill?.frontmatter.version,
                fallbackVersion: manifest.version,
                author: parsedSkill?.frontmatter.author,
                fallbackAuthor: manifest.author || undefined,
                tags: parsedSkill?.frontmatter.tags,
                fallbackTags: [],
                instructions,
                local_repo_path: skillFolderPath,
                protocol_type: "skill",
              },
              { defaultTags: [] },
            );

            const name = sanitized.name;
            skillDisplayName = name || path.basename(skillFolderPath);

            if (!name || name.trim().length === 0) {
              console.warn(
                `Skipping skill with empty name in: ${skillFolderPath}`,
              );
              continue;
            }

            db.create({
              name,
              description: sanitized.description,
              version: sanitized.version,
              author: sanitized.author,
              instructions: sanitized.instructions,
              content: sanitized.instructions,
              protocol_type: sanitized.protocol_type,
              is_favorite: false,
              tags: [],
              original_tags: sanitized.tags,
              local_repo_path: sanitized.local_repo_path,
            });
            count++;
            console.log(
              `Discovered local skill via SKILL.md: ${name} in ${path.basename(skillFolderPath)}`,
            );
          } catch (error: unknown) {
            const msg = getErrorMessage(error);
            // Distinguish name collisions from other errors so callers
            // can report skipped skills to the user.
            if (msg.includes("Skill already exists")) {
              skipped.push(skillDisplayName);
              console.log(
                `Skipped already-installed skill: ${skillDisplayName}`,
              );
            } else {
              console.warn(
                `Failed to import skill "${skillDisplayName}":`,
                msg,
              );
            }
          }
        }
      } catch (e) {
        console.error(`Failed to scan path: ${scanPath}`, e);
      }
    }

    return { imported: count, skipped };
  }

  /**
   * Scan local SKILL.md files and return them as a preview list (without importing).
   *
   * When `customPaths` is provided, **only those directories are scanned** —
   * the default platform paths are intentionally excluded to avoid duplicates
   * (the same skill may exist in both a user's custom directory and a default
   * platform directory like ~/.claude/skills).  When called with no arguments
   * the full set of default platform directories is scanned.
   *
   * @param customPaths - If provided, ONLY these directories are scanned.
   *                      If omitted/empty, the default platform paths are scanned.
   */
  static async scanLocalPreview(
    customPaths?: string[],
    db?: SkillDB,
    aiConfig?: SafetyScanAIConfig,
  ): Promise<ScannedSkill[]> {
    // Use a map keyed by skill folder path to deduplicate across platforms
    const skillMap = new Map<string, ScannedSkill>();

    let scanEntries: Array<{ path: string; platformName: string }>;

    if (customPaths && customPaths.length > 0) {
      // Only scan the user-specified directories — do NOT mix in defaults
      scanEntries = [];
      for (const cp of customPaths) {
        const resolved = resolvePlatformPath(cp.trim());
        if (resolved && !scanEntries.find((e) => e.path === resolved)) {
          scanEntries.push({ path: resolved, platformName: "Custom" });
        }
      }
    } else {
      // No custom paths: scan all default platform directories
      scanEntries = getDefaultSkillScanEntries(this.skillsDir);
    }

    // Scan all platform directories in parallel.  The inner map-merge uses
    // only synchronous operations between reads, so concurrent access to
    // skillMap is safe in the single-threaded event loop.
    const settled = await Promise.allSettled(
      scanEntries.map(async ({ path: scanPath, platformName }) => {
        if (!(await fileExists(scanPath))) {
          return;
        }

        try {
          const skillDirs = await SkillInstaller.collectSkillDirs(scanPath);

          for (const skillFolderPath of skillDirs) {
            const skillMdPath = path.join(skillFolderPath, "SKILL.md");

            try {
              const instructions = await fs.readFile(skillMdPath, "utf-8");
              const manifest = await this.readManifest(skillFolderPath);
              const parsedSkill = parseSkillMd(instructions);

              const name =
                parsedSkill?.frontmatter.name ||
                manifest.name ||
                path.basename(skillFolderPath);

              if (!name || name.trim().length === 0) {
                console.warn(
                  `Skipping skill with empty name in: ${skillFolderPath}`,
                );
                continue;
              }

              // Deduplicate by skill folder path (not name) so same skill
              // in multiple platforms only appears once, but different
              // paths with the same name can both show up.
              const existing = skillMap.get(skillFolderPath);
              if (existing) {
                if (!existing.platforms.includes(platformName)) {
                  existing.platforms.push(platformName);
                }
                continue;
              }

              const sanitized = sanitizeImportedSkillDraft(
                {
                  name: parsedSkill?.frontmatter.name,
                  fallbackName: manifest.name || path.basename(skillFolderPath),
                  description: parsedSkill?.frontmatter.description,
                  fallbackDescription: manifest.description || undefined,
                  version: parsedSkill?.frontmatter.version,
                  fallbackVersion: manifest.version,
                  author: parsedSkill?.frontmatter.author,
                  fallbackAuthor: manifest.author || undefined,
                  tags: parsedSkill?.frontmatter.tags,
                  fallbackTags: [],
                  instructions,
                  local_repo_path: skillFolderPath,
                  protocol_type: "skill",
                },
                { defaultTags: [] },
              );
              const installMetadata =
                await this.getScannedSkillInstallMetadata(skillFolderPath);

              skillMap.set(skillFolderPath, {
                directory_fingerprint: computePackageDirectoryFingerprint(
                  await this.readLocalRepoFileBuffersByPath(skillFolderPath),
                ),
                name: sanitized.name!,
                description: sanitized.description || manifest.description,
                version: sanitized.version,
                author: sanitized.author || manifest.author,
                tags: sanitized.tags,
                instructions: sanitized.instructions || instructions,
                filePath: skillMdPath,
                installMode: installMetadata.installMode,
                isPromptHubManagedLink: installMetadata.isPromptHubManagedLink,
                localPath: skillFolderPath,
                platforms: [platformName],
                symlinkTargetPath: installMetadata.symlinkTargetPath,
              });
            } catch (err) {
              console.warn(`Failed to parse skill at ${skillMdPath}:`, err);
            }
          }
        } catch (e) {
          console.error(`Failed to scan path: ${scanPath}`, e);
        }
      }),
    );

    // Log any unexpected rejections (inner try-catch should prevent these,
    // but this ensures no failures are silently swallowed).
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === "rejected") {
        console.error(
          `Scan entry "${scanEntries[i].path}" (${scanEntries[i].platformName}) rejected unexpectedly:`,
          result.reason,
        );
      }
    }

    const results = Array.from(skillMap.values());

    // Mark skills whose names collide (case-insensitive) so the UI can
    // warn users that only the first will succeed during batch import.
    const nameCount = new Map<string, number>();
    for (const skill of results) {
      const key = skill.name.toLowerCase();
      nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
    }
    for (const skill of results) {
      if ((nameCount.get(skill.name.toLowerCase()) ?? 0) > 1) {
        skill.nameConflict = true;
      }
    }

    // Also mark skills whose names conflict with already-installed skills
    // in the database, so the UI can warn before import attempts.
    if (db) {
      for (const skill of results) {
        if (!skill.nameConflict && db.getByName(skill.name)) {
          skill.nameConflict = true;
        }
      }
    }

    return results;
  }

  /**
   * Fetch remote SKILL.md content from a URL. When the target host is a
   * GitHub endpoint, the user's configured personal access token (if any)
   * is attached to raise the API rate limit from 60 req/h (unauthenticated)
   * to 5000 req/h (authenticated). See #108.
   */
  static async fetchRemoteContent(
    url: string,
    options: FetchRemoteTextOptions = {},
  ): Promise<string> {
    try {
      let githubToken: string | null = null;
      let isInstalledSkillRemoteSource = false;
      try {
        const db = initDatabase();
        if (db && typeof db.prepare === "function") {
          githubToken = readGithubTokenSetting(db);
          isInstalledSkillRemoteSource = isTrustedInstalledSkillRemoteUrl(
            url,
            readInstalledSkillRemoteSources(db),
          );
        }
      } catch (tokenError) {
        // DB may be unavailable during very early startup or in tests —
        // fall back to an unauthenticated request without failing the
        // fetch.
        console.warn(
          "Unable to load skill remote fetch settings, continuing unauthenticated:",
          tokenError,
        );
      }
      return await fetchRemoteText(url, 0, {
        ...options,
        ...(isInstalledSkillRemoteSource
          ? {
              allowPrivateNetwork: true,
              allowInsecurePrivateNetworkHttp: true,
            }
          : {}),
        githubToken,
      });
    } catch (error) {
      console.error("Failed to fetch remote content from remote URL:", error);
      throw error;
    }
  }

  static async fetchRemoteContentBytes(url: string): Promise<Uint8Array> {
    try {
      let githubToken: string | null = null;
      let isInstalledSkillRemoteSource = false;
      try {
        const db = initDatabase();
        if (db && typeof db.prepare === "function") {
          githubToken = readGithubTokenSetting(db);
          isInstalledSkillRemoteSource = isTrustedInstalledSkillRemoteUrl(
            url,
            readInstalledSkillRemoteSources(db),
          );
        }
      } catch (tokenError) {
        console.warn(
          "Unable to load skill remote fetch settings, continuing unauthenticated:",
          tokenError,
        );
      }
      return await fetchRemoteBytes(url, 0, {
        ...(isInstalledSkillRemoteSource
          ? {
              allowPrivateNetwork: true,
              allowInsecurePrivateNetworkHttp: true,
            }
          : {}),
        githubToken,
      });
    } catch (error) {
      console.error("Failed to fetch remote bytes from remote URL:", error);
      throw error;
    }
  }
}
