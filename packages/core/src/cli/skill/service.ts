import fs from "fs/promises";
import { scanSkillContent } from "@prompthub/shared/utils/skill-content-scan";
import path from "path";
import {
  readSkillFileSnapshots,
  replaceSkillFileSnapshots,
} from "../../skills/file-snapshot";
import { mutateCanonicalSkillPackage } from "../../skills/canonical-package-mutation";
import { withSkillSnapshotEntrypoint } from "@prompthub/shared/utils/skill-file-snapshot";

import type { SkillDB } from "@prompthub/db";
import {
  SKILL_PLATFORMS,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import type {
  ScannedSkill,
  Skill,
  SkillFileSnapshot,
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
  SkillSafetyReport,
  SkillSafetyScanInput,
  SkillVersion,
} from "@prompthub/shared/types";
import {
  buildSkillSourceUpdateCheck,
  computeSkillContentSha256,
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { getSkillsDir } from "../../runtime-paths";
import { installSkillFromSource } from "../../skills/install-flow";
import {
  SHARED_AGENT_SKILLS_TARGET_ID,
  sharedSkillDistributionService,
} from "../../skill-distribution-targets";
import { serializeSkillMd } from "../../skills/skill-frontmatter";
import {
  parseSkillMd,
  sanitizeString,
  sanitizeTags,
  validateSkillName,
} from "./parse";
import {
  computeRepoDirectoryFingerprintByPath,
  fileExists,
  getPlatformSkillsDir,
  isInternalSkillRepoEntry,
  isPathWithin,
  normalizeExistingPath,
  readFileContent,
  validateRepoPackageInventory,
  resolvePlatformPath,
  resolveRepoBasePath,
  resolveRepoTargetPath,
  walkRepoDir,
} from "./paths";
import {
  buildCliFingerprintFields,
  collectSkillDirs,
  copyRepoToPlatform,
  fetchRemoteContent,
  gitClone,
  importFromJson,
  installFromGithub,
  installFromSkillContent,
  markNameConflicts,
  readManifest,
  saveContent,
  saveRepo,
  linkRepoToTarget,
  type FetchLike,
} from "./install";
import type { CliSkillService, CliSkillServiceDeps } from "./types";

export function createCliSkillService(
  deps: CliSkillServiceDeps = {},
): CliSkillService {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const gitCloneImpl = deps.gitCloneImpl ?? gitClone;
  async function isManagedRepoPath(absolutePath: string): Promise<boolean> {
    const managedSkillsDir = path.resolve(getSkillsDir());
    const targetPath = path.resolve(absolutePath);
    const relative = path.relative(managedSkillsDir, targetPath);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  async function deleteRepoByPath(absolutePath: string): Promise<void> {
    await fs.rm(path.resolve(absolutePath), { recursive: true, force: true });
  }

  async function resolveSkill(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<Skill> {
    const skill = skillDb.getById(skillId) ?? skillDb.getByName(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    return skill;
  }

  async function getRepoPathForSkill(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<string | null> {
    const skill = await resolveSkill(skillDb, skillId);

    if (
      skill.local_repo_path &&
      (await isManagedRepoPath(skill.local_repo_path))
    ) {
      return skill.local_repo_path;
    }

    if (skill.local_repo_path) {
      try {
        const stat = await fs.stat(skill.local_repo_path);
        if (stat.isDirectory()) {
          const saved = await saveRepo(skill.name, skill.local_repo_path);
          const directoryFingerprint =
            await computeRepoDirectoryFingerprintByPath(saved);
          if (saved !== skill.local_repo_path) {
            skillDb.update(skill.id, {
              local_repo_path: saved,
              ...buildCliFingerprintFields(directoryFingerprint),
            });
          } else {
            skillDb.update(skill.id, {
              ...buildCliFingerprintFields(directoryFingerprint),
            });
          }
          return saved;
        }
      } catch {
        // fall through to content bootstrap
      }
    }

    const content = skill.instructions || skill.content || "";
    if (!content.trim()) {
      return null;
    }

    const saved = await saveContent(skill.name, content);
    const directoryFingerprint =
      await computeRepoDirectoryFingerprintByPath(saved);
    if (saved !== skill.local_repo_path) {
      skillDb.update(skill.id, {
        local_repo_path: saved,
        ...buildCliFingerprintFields(directoryFingerprint),
      });
    } else {
      skillDb.update(skill.id, {
        ...buildCliFingerprintFields(directoryFingerprint),
      });
    }
    return saved;
  }

  async function getRepoPathForSkillName(
    skillDb: SkillDB,
    skillName: string,
  ): Promise<string | null> {
    const skill = skillDb.getByName(skillName);
    if (!skill) {
      return null;
    }

    return getRepoPathForSkill(skillDb, skill.id);
  }

  async function resolveRepoPathForSkill(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<string> {
    const repoPath = await getRepoPathForSkill(skillDb, skillId);
    if (!repoPath) {
      throw new Error(`Unable to resolve local repo for skill: ${skillId}`);
    }
    return repoPath;
  }

  async function listLocalFiles(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillLocalFileTreeEntry[]> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    return walkRepoDir<SkillLocalFileTreeEntry>({
      baseDir: repoPath,
      realBasePath: await normalizeExistingPath(repoPath),
      onEntry: async ({ relativePath, fullPath, isDirectory }) => {
        if (isDirectory) {
          return { path: relativePath, isDirectory: true };
        }
        const stat = await fs.stat(fullPath);
        return { path: relativePath, isDirectory: false, size: stat.size };
      },
    });
  }

  async function readLocalFiles(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillLocalFileEntry[]> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    return walkRepoDir<SkillLocalFileEntry>({
      baseDir: repoPath,
      realBasePath: await normalizeExistingPath(repoPath),
      onEntry: async ({ relativePath, fullPath, isDirectory, dirent }) => {
        if (isDirectory) {
          return { path: relativePath, content: "", isDirectory: true };
        }
        const contentInfo = await readFileContent(fullPath, dirent.name);
        return {
          path: relativePath,
          ...contentInfo,
          isDirectory: false,
        };
      },
    });
  }

  async function readLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath } = await resolveRepoTargetPath(repoPath, relativePath, {
      ensureBaseExists: false,
      allowOutsideSkillsDir: true,
    });
    if (!(await fileExists(fullPath))) {
      return null;
    }
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      return { path: relativePath, content: "", isDirectory: true };
    }
    const contentInfo = await readFileContent(
      fullPath,
      path.basename(fullPath),
      {
        includePreviewData: true,
      },
    );
    return {
      path: relativePath,
      ...contentInfo,
      isDirectory: false,
    };
  }

  async function writeLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    if (await mutateCanonicalSkillPackage(skillDb, skillId, { kind: "write", relativePath, content })) return;
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath } = await resolveRepoTargetPath(repoPath, relativePath, {
      ensureBaseExists: true,
      allowOutsideSkillsDir: true,
    });
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  async function deleteLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<void> {
    if (await mutateCanonicalSkillPackage(skillDb, skillId, { kind: "delete", relativePath })) return;
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath } = await resolveRepoTargetPath(repoPath, relativePath, {
      ensureBaseExists: false,
      allowOutsideSkillsDir: true,
    });
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  async function createLocalDir(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<void> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath } = await resolveRepoTargetPath(repoPath, relativePath, {
      ensureBaseExists: true,
      allowOutsideSkillsDir: true,
    });
    await fs.mkdir(fullPath, { recursive: true });
  }

  async function renameLocalPath(
    skillDb: SkillDB,
    skillId: string,
    oldRelativePath: string,
    newRelativePath: string,
  ): Promise<void> {
    if (await mutateCanonicalSkillPackage(skillDb, skillId, { kind: "rename", relativePath: oldRelativePath, newRelativePath })) return;
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    const { fullPath: oldFullPath } = await resolveRepoTargetPath(
      repoPath,
      oldRelativePath,
      { ensureBaseExists: false, allowOutsideSkillsDir: true },
    );
    const { fullPath: newFullPath } = await resolveRepoTargetPath(
      repoPath,
      newRelativePath,
      { ensureBaseExists: true, allowOutsideSkillsDir: true },
    );
    await fs.mkdir(path.dirname(newFullPath), { recursive: true });
    await fs.rename(oldFullPath, newFullPath);
  }

  async function replaceRepoFiles(
    skillDb: SkillDB,
    skillId: string,
    filesSnapshot?: SkillFileSnapshot[],
    entrypointContent?: string,
  ): Promise<void> {
    if (!filesSnapshot) {
      return;
    }
    const skill = await resolveSkill(skillDb, skillId);
    filesSnapshot = withSkillSnapshotEntrypoint(filesSnapshot, entrypointContent ?? skill.content ?? skill.instructions ?? "");
    if (await mutateCanonicalSkillPackage(skillDb, skillId, { kind: "replace", files: filesSnapshot })) return;
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    await replaceSkillFileSnapshots(repoPath, filesSnapshot);
  }

  async function createVersion(
    skillDb: SkillDB,
    skillId: string,
    note?: string,
  ): Promise<SkillVersion | null> {
    const snapshot = await createLocalRepoSnapshot(skillDb, skillId);
    return skillDb.createVersion(skillId, note, snapshot);
  }

  async function deleteVersion(
    skillDb: SkillDB,
    skillId: string,
    versionId: string,
  ): Promise<boolean> {
    return skillDb.deleteVersion(skillId, versionId);
  }

  async function rollbackVersion(
    skillDb: SkillDB,
    skillId: string,
    version: number,
  ): Promise<Skill | null> {
    const skill = await resolveSkill(skillDb, skillId);
    const targetVersion = skillDb.getVersion(skill.id, version);
    if (!targetVersion) {
      return null;
    }
    const currentFilesSnapshot = await createLocalRepoSnapshot(
      skillDb,
      skill.id,
    );
    await skillDb.createVersion(
      skill.id,
      `Rollback before restoring v${version}`,
      currentFilesSnapshot,
      skill,
    );
    await replaceRepoFiles(skillDb, skill.id, targetVersion.filesSnapshot, targetVersion.content);
    const updatedSkill = skillDb.update(skill.id, {
      content: targetVersion.content,
      instructions: targetVersion.content,
    });
    return updatedSkill;
  }

  async function syncFromRepo(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<Skill | null> {
    const skill = await resolveSkill(skillDb, skillId);
    const repoPath = await getRepoPathForSkill(skillDb, skill.id);
    if (!repoPath) {
      return skill;
    }
    const files = await readLocalFiles(skillDb, skill.id);
    const skillMdFile = files.find(
      (file) => !file.isDirectory && file.path.toLowerCase() === "skill.md",
    );
    if (!skillMdFile?.content) {
      return skill;
    }
    const parsed = parseSkillMd(skillMdFile.content);
    const update: import("@prompthub/shared/types").UpdateSkillParams = {
      content: skillMdFile.content,
      instructions: skillMdFile.content,
    };
    if (parsed?.frontmatter.description !== undefined) {
      update.description = parsed.frontmatter.description;
    }
    if (parsed?.frontmatter.version !== undefined) {
      update.version = parsed.frontmatter.version;
    }
    if (parsed?.frontmatter.author !== undefined) {
      update.author = parsed.frontmatter.author;
    }
    if (parsed?.frontmatter.tags !== undefined) {
      update.tags = parsed.frontmatter.tags;
    }
    Object.assign(
      update,
      buildCliFingerprintFields(
        await computeRepoDirectoryFingerprintByPath(repoPath),
      ),
    );
    return skillDb.update(skill.id, update);
  }

  async function updateMetadata(
    skillDb: SkillDB,
    skillId: string,
    data: import("@prompthub/shared/types").UpdateSkillParams,
  ): Promise<Skill | null> {
    const skill = skillDb.getById(skillId) ?? skillDb.getByName(skillId);
    if (!skill) {
      return null;
    }
    const allowed: import("@prompthub/shared/types").UpdateSkillParams = {};
    if (data.description !== undefined) allowed.description = data.description;
    if (data.version !== undefined) allowed.version = data.version;
    if (data.author !== undefined) allowed.author = data.author;
    if (data.tags !== undefined) allowed.tags = data.tags;
    if (data.is_favorite !== undefined) allowed.is_favorite = data.is_favorite;
    if (data.category !== undefined) allowed.category = data.category;
    if (data.source_label !== undefined) {
      allowed.source_label = data.source_label;
    }
    if (Object.keys(allowed).length === 0) {
      throw new Error("skill update requires at least one metadata field");
    }
    return skillDb.update(skill.id, allowed);
  }

  async function checkSourceUpdate(
    skillDb: SkillDB,
    skillId: string,
    options?: { fetchRemote?: boolean },
  ): Promise<import("@prompthub/shared/types").SkillSourceUpdateCheck> {
    const skill = await resolveSkill(skillDb, skillId);
    const repoPath = await getRepoPathForSkill(skillDb, skill.id);
    const localDirectoryFingerprint = repoPath
      ? await computeRepoDirectoryFingerprintByPath(repoPath)
      : skill.directory_fingerprint;
    let localContentHash = skill.installed_content_hash;
    let remoteContentHash: string | undefined;
    let remoteDirectoryFingerprint: string | undefined;

    if (repoPath) {
      try {
        const files = await readLocalFiles(skillDb, skill.id);
        const skillMd = files.find(
          (file) => !file.isDirectory && file.path.toLowerCase() === "skill.md",
        );
        if (skillMd?.content) {
          localContentHash = await computeSkillContentSha256(skillMd.content);
        }
      } catch {
        // keep prior hash
      }
    }

    if (options?.fetchRemote && skill.content_url) {
      const remoteContent = await fetchRemoteContent(
        skill.content_url,
        fetchImpl,
      );
      remoteContentHash = await computeSkillContentSha256(remoteContent);
      remoteDirectoryFingerprint = computeSkillPackageFingerprintV1Sync([
        { path: "SKILL.md", data: Buffer.from(remoteContent, "utf8") },
      ]).fingerprint;
    } else if (!options?.fetchRemote) {
      remoteContentHash = skill.installed_content_hash;
      remoteDirectoryFingerprint = skill.installed_directory_fingerprint;
    }

    const check = buildSkillSourceUpdateCheck({
      skillId: skill.id,
      sourceIdentity: skill.source_id ?? skill.source_url ?? skill.name,
      localContentHash,
      remoteContentHash,
      localDirectoryFingerprint,
      remoteDirectoryFingerprint,
      installedContentHash: skill.installed_content_hash,
      installedDirectoryFingerprint: skill.installed_directory_fingerprint,
      fingerprintAlgorithm:
        skill.fingerprint_algorithm ?? SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
      localVersion: skill.version,
      installedVersion: skill.installed_version ?? skill.version,
      remoteVersion: skill.version,
      resolvedAt: Date.now(),
    });

    const bindingState: import("@prompthub/shared/types").SkillSourceBindingState =
      check.status === "baseline-missing" || check.status === "no-source"
        ? "missing-baseline"
        : check.status === "source-unavailable"
          ? "detached"
          : "bound";

    skillDb.update(skill.id, {
      source_last_checked_at: Date.now(),
      source_last_error: null,
      source_binding_state: bindingState,
      directory_fingerprint: localDirectoryFingerprint,
    });

    return check;
  }

  async function installSkillMd(
    skillDb: SkillDB,
    skillName: string,
    skillMdContent: string,
    platformId: string,
    skillId?: string,
  ): Promise<void> {
    const canonicalRepoPath =
      (await getRepoPathForSkillName(skillDb, skillName)) ??
      (await saveContent(skillName, skillMdContent));
    if (platformId === SHARED_AGENT_SKILLS_TARGET_ID) {
      await sharedSkillDistributionService.install({
        skillId: skillId ?? skillName,
        skillName,
        sourcePath: canonicalRepoPath,
        mode: "copy",
      });
      return;
    }
    const platform = SKILL_PLATFORMS.find((item) => item.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }
    const skillDir = path.join(
      getPlatformSkillsDir(platform),
      validateSkillName(skillName),
    );
    await fs.mkdir(path.dirname(skillDir), { recursive: true });
    await copyRepoToPlatform(canonicalRepoPath, skillDir);
  }

  async function installSkillToProject(
    skillDb: SkillDB,
    skillId: string,
    options: {
      projectRoot?: string;
      targetRootDir?: string;
      mode?: "copy" | "symlink";
      ifExists?: "skip" | "overwrite" | "error";
    },
  ): Promise<{
    status: "installed" | "updated" | "skipped";
    skillId: string;
    skillName: string;
    projectRoot: string;
    targetRootDir: string;
    skillDir: string;
    mode: "copy" | "symlink";
  }> {
    const skill = await resolveSkill(skillDb, skillId);
    const repoPath = await resolveRepoPathForSkill(skillDb, skill.id);
    const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
    const targetRootDir = path.resolve(
      options.targetRootDir ?? path.join(projectRoot, ".agents", "skills"),
    );
    const skillName = validateSkillName(skill.name);
    const skillDir = path.join(targetRootDir, skillName);
    const mode = options.mode ?? "copy";
    const ifExists = options.ifExists ?? "skip";
    const canonicalRepoPath = await fs.realpath(repoPath);

    if (
      canonicalRepoPath === skillDir ||
      path.resolve(repoPath) === skillDir ||
      isPathWithin(canonicalRepoPath, targetRootDir) ||
      isPathWithin(path.resolve(repoPath), targetRootDir)
    ) {
      throw new Error(
        `Target directory must not be the source skill directory or inside it: ${targetRootDir}`,
      );
    }

    await validateRepoPackageInventory(canonicalRepoPath);

    await fs.mkdir(targetRootDir, { recursive: true });
    const existed = await fileExists(skillDir);
    if (existed) {
      if (ifExists === "skip") {
        return {
          status: "skipped",
          skillId: skill.id,
          skillName,
          projectRoot,
          targetRootDir,
          skillDir,
          mode,
        };
      }
      if (ifExists === "error") {
        throw new Error(
          `Skill already exists in target directory: ${skillDir}`,
        );
      }
    }

    if (mode === "symlink") {
      await linkRepoToTarget(canonicalRepoPath, skillDir);
    } else {
      await copyRepoToPlatform(canonicalRepoPath, skillDir, {
        policyChecked: true,
      });
    }

    return {
      status: existed ? "updated" : "installed",
      skillId: skill.id,
      skillName,
      projectRoot,
      targetRootDir,
      skillDir,
      mode,
    };
  }

  async function uninstallSkillMd(
    skillName: string,
    platformId: string,
    skillId?: string,
  ): Promise<void> {
    if (platformId === SHARED_AGENT_SKILLS_TARGET_ID) {
      await sharedSkillDistributionService.uninstall({
        skillId: skillId ?? skillName,
        skillName,
      });
      return;
    }
    const platform = SKILL_PLATFORMS.find((item) => item.id === platformId);
    if (!platform) {
      throw new Error(`Unknown platform: ${platformId}`);
    }
    const skillDir = path.join(
      getPlatformSkillsDir(platform),
      validateSkillName(skillName),
    );
    if (await fileExists(skillDir)) {
      await fs.rm(skillDir, { recursive: true, force: true });
    }
  }

  function getSupportedPlatforms(): SkillPlatform[] {
    return SKILL_PLATFORMS;
  }

  async function detectInstalledPlatforms(): Promise<string[]> {
    const installed: string[] = [];
    for (const platform of SKILL_PLATFORMS) {
      const skillsDir = getPlatformSkillsDir(platform);
      const parentDir = path.dirname(skillsDir);
      if (await fileExists(parentDir)) {
        installed.push(platform.id);
      }
    }
    return installed;
  }

  async function getSkillMdInstallStatus(
    skillName: string,
    skillId?: string,
  ): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    for (const platform of SKILL_PLATFORMS) {
      const skillDir = path.join(
        getPlatformSkillsDir(platform),
        validateSkillName(skillName),
      );
      status[platform.id] = await fileExists(skillDir);
    }
    const sharedStatus = await sharedSkillDistributionService.getStatus({
      skillId: skillId ?? skillName,
      skillName,
    });
    status[SHARED_AGENT_SKILLS_TARGET_ID] =
      sharedStatus.state === "managed-clean" ||
      sharedStatus.state === "managed-modified";
    return status;
  }

  function exportAsSkillMd(skill: Skill): string {
    return serializeSkillMd({
      name: skill.name,
      ...(skill.description !== undefined
        ? { description: skill.description }
        : {}),
      ...(skill.version !== undefined ? { version: skill.version } : {}),
      ...(skill.author !== undefined ? { author: skill.author } : {}),
      ...(skill.tags !== undefined ? { tags: skill.tags } : {}),
      ...(skill.compatibility !== undefined
        ? { compatibility: skill.compatibility }
        : {}),
      instructions: skill.instructions || skill.content || "",
    });
  }

  function exportAsJson(skill: Skill): string {
    return JSON.stringify(
      {
        name: skill.name,
        description: skill.description || "",
        version: skill.version || "1.0.0",
        author: skill.author || "",
        tags: skill.tags || [],
        instructions: skill.instructions || "",
        protocol_type: skill.protocol_type || "skill",
        source_url: skill.source_url || "",
        icon_url: skill.icon_url || "",
        icon_emoji: skill.icon_emoji || "",
        icon_background: skill.icon_background || "",
        exported_at: new Date().toISOString(),
        format_version: "1.0",
      },
      null,
      2,
    );
  }

  async function scanSafety(
    input: SkillSafetyScanInput,
  ): Promise<SkillSafetyReport> {
    if (input.enabled !== true) throw new Error("SAFETY_SCAN_DISABLED");
    if (input.method && input.method !== "static")
      throw new Error("CLI safety scan supports static content analysis only");
    const files = input.localRepoPath
      ? await readSkillFileSnapshots(input.localRepoPath)
      : undefined;
    return scanSkillContent({ ...input, files });
  }

  async function createLocalRepoSnapshot(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillFileSnapshot[]> {
    const repoPath = await resolveRepoPathForSkill(skillDb, skillId);
    await validateRepoPackageInventory(repoPath);
    return readSkillFileSnapshots(repoPath);
  }

  return {
    createVersion,
    createLocalDir,
    deleteLocalFile,
    deleteRepoByPath,
    deleteVersion,
    detectInstalledPlatforms,
    exportAsJson,
    exportAsSkillMd,
    getSupportedPlatforms,
    getSkillMdInstallStatus,
    installFromSource: async (
      source: string,
      skillDb: SkillDB,
      options?: { name?: string },
    ): Promise<string> =>
      installSkillFromSource(
        source,
        skillDb,
        {
          fetchRemoteContent: (sourceUrl) =>
            fetchRemoteContent(sourceUrl, fetchImpl),
          importFromJson,
          installFromGithub: (sourceUrl, targetSkillDb) =>
            installFromGithub(sourceUrl, targetSkillDb, gitCloneImpl),
          installFromSkillContent,
        },
        options,
      ),
    installSkillMd,
    installSkillToProject,
    isManagedRepoPath,
    listLocalFiles,
    readCurrentFilesSnapshot: createLocalRepoSnapshot,
    readLocalFile,
    renameLocalPath,
    replaceRepoFiles,
    rollbackVersion,
    updateMetadata,
    checkSourceUpdate,
    scanLocalPreview: async (customPaths?: string[], skillDb?: SkillDB) => {
      const skillMap = new Map<string, ScannedSkill>();
      const scanEntries =
        customPaths && customPaths.length > 0
          ? customPaths
              .map((customPath) => resolvePlatformPath(customPath.trim()))
              .filter(Boolean)
              .map((scanPath) => ({ path: scanPath, platformName: "Custom" }))
          : [
              { path: getSkillsDir(), platformName: "PromptHub" },
              ...SKILL_PLATFORMS.map((platform) => ({
                path: getPlatformSkillsDir(platform),
                platformName: platform.name,
              })),
            ];

      await Promise.all(
        scanEntries.map(async ({ path: scanPath, platformName }) => {
          if (!(await fileExists(scanPath))) {
            return;
          }

          const skillDirs = await collectSkillDirs(scanPath);
          for (const skillFolderPath of skillDirs) {
            const skillMdPath = path.join(skillFolderPath, "SKILL.md");
            try {
              const instructions = await fs.readFile(skillMdPath, "utf-8");
              const manifest = await readManifest(skillFolderPath);
              const parsed = parseSkillMd(instructions);
              const name =
                sanitizeString(parsed?.frontmatter.name) ||
                sanitizeString(manifest.name) ||
                path.basename(skillFolderPath);
              if (!name) {
                continue;
              }

              const existing = skillMap.get(skillFolderPath);
              if (existing) {
                if (!existing.platforms.includes(platformName)) {
                  existing.platforms.push(platformName);
                }
                continue;
              }

              skillMap.set(skillFolderPath, {
                name,
                description:
                  sanitizeString(
                    parsed?.frontmatter.description,
                    sanitizeString(manifest.description, ""),
                  ) || "",
                version: sanitizeString(
                  parsed?.frontmatter.version,
                  sanitizeString(manifest.version),
                ),
                author:
                  sanitizeString(
                    parsed?.frontmatter.author,
                    sanitizeString(manifest.author, "Local"),
                  ) || "Local",
                tags: sanitizeTags(parsed?.frontmatter.tags, manifest.tags),
                instructions,
                directory_fingerprint:
                  await computeRepoDirectoryFingerprintByPath(skillFolderPath),
                filePath: skillMdPath,
                localPath: skillFolderPath,
                platforms: [platformName],
              });
            } catch {
              // Ignore malformed skills so scan previews remain resilient.
            }
          }
        }),
      );

      const results = Array.from(skillMap.values());
      markNameConflicts(results, skillDb);
      return results;
    },
    scanSafety,
    syncFromRepo,
    uninstallSkillMd,
    writeLocalFile,
  };
}

export const coreCliSkillService = createCliSkillService();
