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
  ScannedSkill,
  ScanLocalResult,
  SkillManifest,
} from "../../shared/types";
import { SkillDB } from "../database/skill";
import { parseSkillMd } from "./skill-validator";
import { sanitizeImportedSkillDraft } from "./skill-import-sanitize";
import {
  getPlatformSkillsDir,
  gitClone,
  resolvePlatformPath,
} from "./skill-installer-utils";
import {
  SKILL_PLATFORMS,
  type SkillPlatform,
} from "../../shared/constants/platforms";

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
  fetchRemoteText,
  isBlockedHostname,
  isPrivateAddress,
  isPrivateIPv4,
  isPrivateIPv6,
  resolvePublicAddress,
} from "./skill-installer-remote";
import {
  createLocalRepoDir,
  createLocalRepoDirByPath,
  deleteAllLocalRepos,
  deleteLocalRepo,
  deleteLocalRepoFile,
  deleteLocalRepoFileByPath,
  deleteRepoByPath,
  getLocalRepoPath,
  isManagedRepoPath,
  listLocalRepoFiles,
  listLocalRepoFilesByPath,
  readLocalRepoFile,
  readLocalRepoFileByPath,
  readLocalRepoFiles,
  readLocalRepoFilesByPath,
  renameManagedLocalRepo,
  renameLocalRepoPathByPath,
  replaceLocalRepoFilesByPath,
  saveContentToLocalRepo,
  saveToLocalRepo,
  writeLocalRepoFile,
  writeLocalRepoFileByPath,
} from "./skill-installer-repo";
import {
  detectInstalledPlatforms,
  getPlatformStatus,
  getSkillMdInstallStatus,
  getSupportedPlatforms,
  installSkillMd,
  installSkillMdSymlink,
  installToPlatform,
  uninstallFromPlatform,
  uninstallSkillMd,
} from "./skill-installer-platform";
import {
  exportAsJson,
  exportAsSkillMd,
  importFromJson,
} from "./skill-installer-export";

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

  // ---- Repo CRUD (delegated) ----
  static isManagedRepoPath = isManagedRepoPath;
  static saveToLocalRepo = saveToLocalRepo;
  static saveContentToLocalRepo = saveContentToLocalRepo;
  static readLocalRepoFiles = readLocalRepoFiles;
  static readLocalRepoFilesByPath = readLocalRepoFilesByPath;
  static listLocalRepoFiles = listLocalRepoFiles;
  static listLocalRepoFilesByPath = listLocalRepoFilesByPath;
  static readLocalRepoFile = readLocalRepoFile;
  static readLocalRepoFileByPath = readLocalRepoFileByPath;
  static writeLocalRepoFile = writeLocalRepoFile;
  static writeLocalRepoFileByPath = writeLocalRepoFileByPath;
  static deleteLocalRepoFile = deleteLocalRepoFile;
  static deleteLocalRepoFileByPath = deleteLocalRepoFileByPath;
  static createLocalRepoDir = createLocalRepoDir;
  static createLocalRepoDirByPath = createLocalRepoDirByPath;
  static renameLocalRepoPathByPath = renameLocalRepoPathByPath;
  static getLocalRepoPath = getLocalRepoPath;
  static renameManagedLocalRepo = renameManagedLocalRepo;
  static deleteLocalRepo = deleteLocalRepo;
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
  static uninstallSkillMd = uninstallSkillMd;
  static getSkillMdInstallStatus = getSkillMdInstallStatus;
  static installSkillMdSymlink = installSkillMdSymlink;

  // ---- Export / import (delegated) ----
  static exportAsSkillMd = exportAsSkillMd;
  static exportAsJson = exportAsJson;
  static importFromJson = importFromJson;

  // ========================================================================
  // Methods that orchestrate across multiple sub-modules stay in this file
  // ========================================================================

  /** Scan entries to check for local skills */
  private static getDefaultScanEntries(): Array<{
    path: string;
    platformName: string;
  }> {
    const scanEntries: Array<{ path: string; platformName: string }> = [
      {
        path: this.skillsDir,
        platformName: "PromptHub",
      },
    ];

    for (const p of SKILL_PLATFORMS) {
      const resolved = getPlatformSkillsDir(p);
      if (!scanEntries.find((entry) => entry.path === resolved)) {
        scanEntries.push({ path: resolved, platformName: p.name });
      }
    }

    return scanEntries;
  }

  /** Read and parse manifest.json from a skill directory */
  private static async readManifest(dir: string): Promise<SkillManifest> {
    const manifestPath = path.join(dir, "manifest.json");
    let content: string;
    try {
      content = await fs.readFile(manifestPath, "utf-8");
    } catch (err: unknown) {
      // File not found is expected (most repos don't have a manifest)
      if (getErrorCode(err) === "ENOENT") {
        return {};
      }
      // Permission or I/O errors should propagate
      throw new Error(
        `Failed to read manifest at ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      // Safe: JSON.parse returns `any`; narrowed to Record for property access
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const sanitized = sanitizeImportedSkillDraft(
        {
          name: parsed.name,
          description: parsed.description,
          version: parsed.version,
          author: parsed.author,
          tags: parsed.tags,
          instructions: parsed.instructions,
        },
        { defaultTags: [] },
      );
      return {
        name: sanitized.name,
        description: sanitized.description,
        version: sanitized.version,
        author: sanitized.author,
        tags: sanitized.tags.length > 0 ? sanitized.tags : undefined,
        instructions: sanitized.instructions,
      };
    } catch (err: unknown) {
      // Malformed JSON is a real error that callers should know about
      throw new Error(
        `Failed to parse manifest.json in ${dir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---- Install methods (orchestrating across sub-modules) ----

  static async installFromGithub(url: string, db: SkillDB): Promise<string> {
    await this.init();

    // Validate and extract owner/repo from GitHub URL
    const matches = url.match(
      /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
    );
    if (!matches) {
      throw new Error(
        "Invalid GitHub URL: must be https://github.com/{owner}/{repo}",
      );
    }
    const userDir = matches[1];
    const repoName = matches[2];
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

    try {
      console.log(`Cloning ${url} to ${installDir}`);
      await gitClone(url, installDir);

      // Parse metadata
      const manifest = await this.readManifest(installDir);

      // Load instructions from SKILL.md if not in manifest
      if (!manifest.instructions) {
        try {
          manifest.instructions = await fs.readFile(
            path.join(installDir, "SKILL.md"),
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

      // Create Skill in DB
      const skill = db.create({
        name: manifest.name || repoName,
        description: manifest.description || `Installed from ${url}`,
        version: manifest.version || "1.0.0",
        author: manifest.author || userDir,
        content: manifest.instructions || "",
        instructions: manifest.instructions || "",
        protocol_type: "skill",
        source_url: url,
        local_repo_path: installDir,
        is_favorite: false,
        tags: [],
        original_tags: manifest.tags || ["github"],
      });

      return skill.id;
    } catch (error) {
      console.error("Installation failed:", error);
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
    const trimmedSource = source.trim();
    if (!trimmedSource) {
      throw new Error("Skill source cannot be empty");
    }

    if (/^https?:\/\/github\.com\//i.test(trimmedSource)) {
      return this.installFromGithub(trimmedSource, db);
    }

    if (/^https:\/\//i.test(trimmedSource)) {
      const remoteContent = await this.fetchRemoteContent(trimmedSource);
      return this.installFromSkillContent(remoteContent, db, {
        name: options?.name,
        sourceUrl: trimmedSource,
      });
    }

    return this.installFromLocalPath(trimmedSource, db, options);
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

    // Save files first, then create DB record to avoid orphaned records
    let localRepoPath: string | undefined;
    if (options?.repoSourceDir) {
      localRepoPath = await saveToLocalRepo(skillName, options.repoSourceDir);
    } else {
      localRepoPath = await saveContentToLocalRepo(skillName, skillContent);
    }

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
      local_repo_path: localRepoPath || sanitized.local_repo_path,
    });

    return createdSkill.id;
  }

  // ---- Scan methods ----

  /**
   * Scan local SKILL.md files from various AI tool directories.
   *
   * Note: This method only scans SKILL.md format skills, NOT MCP configurations.
   */
  static async scanLocal(db: SkillDB): Promise<ScanLocalResult> {
    let count = 0;
    const skipped: string[] = [];
    const scanPaths = this.getDefaultScanEntries().map((entry) => entry.path);

    for (const scanPath of scanPaths) {
      if (!(await fileExists(scanPath))) {
        console.log(`Scan path does not exist, skipping: ${scanPath}`);
        continue;
      }

      try {
        console.log(`Scanning path for skills: ${scanPath}`);
        const entries = await fs.readdir(scanPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillFolderPath = path.join(scanPath, entry.name);
            const skillMdPath = path.join(skillFolderPath, "SKILL.md");

            if (await fileExists(skillMdPath)) {
              let skillDisplayName = entry.name;
              try {
                const instructions = await fs.readFile(skillMdPath, "utf-8");
                const manifest = await this.readManifest(skillFolderPath);

                // Use the skill-validator to parse SKILL.md frontmatter
                const parsedSkill = parseSkillMd(instructions);

                const sanitized = sanitizeImportedSkillDraft(
                  {
                    name: parsedSkill?.frontmatter.name,
                    fallbackName: manifest.name || entry.name,
                    description: parsedSkill?.frontmatter.description,
                    fallbackDescription:
                      manifest.description ||
                      `Local skill found in ${entry.name}`,
                    version: parsedSkill?.frontmatter.version,
                    fallbackVersion: manifest.version,
                    author: parsedSkill?.frontmatter.author,
                    fallbackAuthor: manifest.author || "Local",
                    tags: parsedSkill?.frontmatter.tags,
                    fallbackTags: [],
                    instructions,
                    local_repo_path: skillFolderPath,
                    protocol_type: "skill",
                  },
                  { defaultTags: [] },
                );

                const name = sanitized.name;
                skillDisplayName = name || entry.name;

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
                  `Discovered local skill via SKILL.md: ${name} in ${entry.name}`,
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
      scanEntries = this.getDefaultScanEntries();
    }

    // Scan all platform directories in parallel.  The inner map-merge uses
    // only synchronous operations between reads, so concurrent access to
    // skillMap is safe in the single-threaded event loop.
    await Promise.allSettled(
      scanEntries.map(async ({ path: scanPath, platformName }) => {
        if (!(await fileExists(scanPath))) {
          return;
        }

        try {
          const entries = await fs.readdir(scanPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const skillFolderPath = path.join(scanPath, entry.name);
              const skillMdPath = path.join(skillFolderPath, "SKILL.md");

              if (await fileExists(skillMdPath)) {
                try {
                  const instructions = await fs.readFile(skillMdPath, "utf-8");
                  const manifest = await this.readManifest(skillFolderPath);
                  const parsedSkill = parseSkillMd(instructions);

                  const name =
                    parsedSkill?.frontmatter.name ||
                    manifest.name ||
                    entry.name;

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
                  } else {
                    const sanitized = sanitizeImportedSkillDraft(
                      {
                        name: parsedSkill?.frontmatter.name,
                        fallbackName: manifest.name || entry.name,
                        description: parsedSkill?.frontmatter.description,
                        fallbackDescription:
                          manifest.description ||
                          `Local skill found in ${entry.name}`,
                        version: parsedSkill?.frontmatter.version,
                        fallbackVersion: manifest.version,
                        author: parsedSkill?.frontmatter.author,
                        fallbackAuthor: manifest.author || "Local",
                        tags: parsedSkill?.frontmatter.tags,
                        fallbackTags: [],
                        instructions,
                        local_repo_path: skillFolderPath,
                        protocol_type: "skill",
                      },
                      { defaultTags: [] },
                    );
                    skillMap.set(skillFolderPath, {
                      name: sanitized.name!,
                      description:
                        sanitized.description ||
                        `Local skill found in ${entry.name}`,
                      version: sanitized.version,
                      author: sanitized.author || "Local",
                      tags: sanitized.tags,
                      instructions: sanitized.instructions || instructions,
                      filePath: skillMdPath,
                      localPath: skillFolderPath,
                      platforms: [platformName],
                    });
                  }
                } catch (err) {
                  console.warn(`Failed to parse skill at ${skillMdPath}:`, err);
                }
              }
            }
          }
        } catch (e) {
          console.error(`Failed to scan path: ${scanPath}`, e);
        }
      }),
    );

    return Array.from(skillMap.values());
  }

  /**
   * Fetch remote SKILL.md content from a URL
   */
  static async fetchRemoteContent(url: string): Promise<string> {
    try {
      return await fetchRemoteText(url);
    } catch (error) {
      console.error("Failed to fetch remote content from remote URL:", error);
      throw error;
    }
  }
}
