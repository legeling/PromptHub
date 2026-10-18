import { withPlatformTargetRollback } from "./platform-recovery";
import {
  PLATFORM_ACTIVATION_STATE_FILE,
  readActivationState,
  writeActivationState,
  withPlatformOperationLock,
  type PlatformActivationMap,
} from "./platform-activation";
export {
  parsePlatformActivationState,
  PLATFORM_ACTIVATION_STATE_FILE,
  MAX_PLATFORM_ACTIVATION_RECORDS,
} from "./platform-activation";
export type {
  PlatformActivationMap,
  PlatformActivationRecord,
} from "./platform-activation";
import {
  assertPlatformContentWritable,
  fingerprintPlatformPackage,
  inspectPlatformContent,
} from "./platform-content";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import type {
  Skill,
  SkillPlatformInstallStatus,
  SkillPlatformInstallStatusMap,
  SkillPlatformInstallResult,
} from "@prompthub/shared/types";
import {
  SHARED_AGENT_SKILLS_TARGET_ID,
  sharedSkillDistributionService,
} from "../skill-distribution-targets";
import { replaceSkillDestination } from "./destination";
import { SkillPlatformError } from "./platform-error";
import {
  fileExists,
  getErrorCode,
  validateSkillName,
  isInternalSkillRepoEntry,
} from "./platform-files";
import * as cherry from "./cherry-studio-skill-platform";
export type {
  SkillMdInstallOptions,
  SkillPlatformIdentity,
  SkillPlatformDependencies,
  SkillPlatformService,
} from "./platform-types";
import type {
  SkillMdInstallOptions,
  SkillPlatformIdentity,
  SkillPlatformDependencies,
  SkillPlatformService,
} from "./platform-types";
export function createSkillPlatformService(
  deps: SkillPlatformDependencies,
): SkillPlatformService {
  const {
    getSupportedPlatforms,
    getPlatformSkillsDir,
    saveContentToLocalRepo,
    getSkillsDirAccessor,
    initSkillsDir,
  } = deps;
  const isCherryStudioPlatform = cherry.isCherryStudioPlatform;
  const cherryOptions = (
    platform: SkillPlatform,
  ): cherry.CherryStudioPlatformOptions => ({
    overrides: { [platform.id]: deps.getPlatformRootDir(platform) },
  });
  const installCherryStudioSkill: typeof cherry.installCherryStudioSkill = (
    platform,
    name,
    source,
    options,
  ) =>
    cherry.installCherryStudioSkill(platform, name, source, {
      ...cherryOptions(platform),
      ...options,
    });
  const uninstallCherryStudioSkill: typeof cherry.uninstallCherryStudioSkill = (
    platform,
    name,
  ) =>
    cherry.uninstallCherryStudioSkill(platform, name, cherryOptions(platform));
  const getCherryStudioSkillStatus: typeof cherry.getCherryStudioSkillStatus = (
    platform,
    name,
  ) =>
    cherry.getCherryStudioSkillStatus(platform, name, cherryOptions(platform));
  function getPlatformActivationStatePath(platform: SkillPlatform): string {
    return path.join(
      getPlatformSkillsDir(platform),
      PLATFORM_ACTIVATION_STATE_FILE,
    );
  }

  async function readPlatformActivationState(
    platform: SkillPlatform,
  ): Promise<PlatformActivationMap> {
    return readActivationState(getPlatformActivationStatePath(platform));
  }

  async function writePlatformActivationState(
    platform: SkillPlatform,
    state: PlatformActivationMap,
  ): Promise<void> {
    await writeActivationState(getPlatformActivationStatePath(platform), state);
  }

  async function setPlatformActivation(
    platform: SkillPlatform,
    skill: Pick<Skill, "id" | "name">,
    sourcePath?: string,
  ): Promise<void> {
    const state = await readPlatformActivationState(platform);
    const target = path.join(getPlatformSkillsDir(platform), skill.name);
    const installedFingerprint = isCherryStudioPlatform(platform.id)
      ? undefined
      : await fingerprintPlatformPackage(target);
    state[skill.name] = {
      skillId: skill.id,
      skillName: skill.name,
      installedFingerprint,
      sourcePath,
    };
    await writePlatformActivationState(platform, state);
  }

  async function clearPlatformActivation(
    platform: SkillPlatform,
    skill: Pick<Skill, "id" | "name">,
  ): Promise<void> {
    const state = await readPlatformActivationState(platform);
    const current = state[skill.name];
    if (!current) {
      return;
    }
    if (current.skillId !== skill.id) {
      return;
    }
    delete state[skill.name];
    await writePlatformActivationState(platform, state);
  }

  async function isPlatformActivationCurrent(
    platform: SkillPlatform,
    skill: Pick<Skill, "id" | "name">,
  ): Promise<boolean> {
    const state = await readPlatformActivationState(platform);
    const current = state[skill.name];
    if (!current) {
      return false;
    }
    return current.skillId === skill.id;
  }

  function isRemoteUrl(value: string): boolean {
    return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value);
  }

  function resolveLocalSkillSourceDir(
    value: string | undefined,
  ): string | null {
    const trimmed = value?.trim();
    if (!trimmed || isRemoteUrl(trimmed)) {
      return null;
    }

    const resolved = path.resolve(trimmed);
    return path.basename(resolved).toLowerCase() === "skill.md"
      ? path.dirname(resolved)
      : resolved;
  }

  function getDirectPlatformSkillName(
    platform: SkillPlatform,
    sourceDir: string,
  ): string | null {
    const skillsDir = path.resolve(getPlatformSkillsDir(platform));
    const resolvedSourceDir = path.resolve(sourceDir);
    const relative = path.relative(skillsDir, resolvedSourceDir);

    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return null;
    }

    const segments = relative.split(path.sep).filter(Boolean);
    return segments.length === 1 ? segments[0] : null;
  }

  async function inspectSkillSourcePathInstall(
    platform: SkillPlatform,
    skill: SkillPlatformIdentity,
  ): Promise<SkillPlatformInstallStatus | null> {
    const sourceDirs = Array.from(
      new Set(
        [skill.source_url, skill.local_repo_path]
          .map(resolveLocalSkillSourceDir)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    for (const sourceDir of sourceDirs) {
      const platformSkillName = getDirectPlatformSkillName(platform, sourceDir);
      if (!platformSkillName) {
        continue;
      }

      const status = await inspectPlatformSkillInstall(
        platform,
        platformSkillName,
      );
      if (status.installed) {
        return status;
      }
    }

    return null;
  }

  async function removePlatformSkillDir(
    platform: SkillPlatform,
    platformSkillName: string,
  ): Promise<void> {
    validateSkillName(platformSkillName);
    const skillsDir = getPlatformSkillsDir(platform);
    const skillDir = path.join(skillsDir, platformSkillName);
    await fs.rm(skillDir, { recursive: true, force: true });
  }

  async function cleanupLegacyPlatformSkillDirs(
    platform: SkillPlatform,
    effectivePlatformSkillName: string,
    legacySkillNames?: string[],
  ): Promise<void> {
    if (!legacySkillNames || legacySkillNames.length === 0) {
      return;
    }

    for (const legacyName of legacySkillNames) {
      if (!legacyName || legacyName === effectivePlatformSkillName) {
        continue;
      }
      await removePlatformSkillDir(platform, legacyName);
    }
  }

  async function cleanupLegacyCherryStudioSkills(
    platform: SkillPlatform,
    effectivePlatformSkillName: string,
    legacySkillNames?: string[],
  ): Promise<void> {
    if (!legacySkillNames || legacySkillNames.length === 0) {
      return;
    }

    for (const legacyName of legacySkillNames) {
      if (!legacyName || legacyName === effectivePlatformSkillName) {
        continue;
      }
      await uninstallCherryStudioSkill(platform, legacyName);
    }
  }

  async function copySkillRepoToPlatform(
    sourceDir: string,
    targetDir: string,
  ): Promise<void> {
    const canonicalSourceDir = await fs.realpath(sourceDir);
    await replaceSkillDestination(targetDir, (stage) =>
      fs.cp(canonicalSourceDir, stage, {
        recursive: true,
        filter: (_src, dest) =>
          !isInternalSkillRepoEntry(path.relative(stage, dest)),
      }),
    );
  }

  /**
   * Install SKILL.md to a specific platform.
   *
   * Also ensures the canonical copy in the local repo exists.
   */
  async function installSkillMd(
    skillName: string,
    skillMdContent: string,
    platformId: string,
    canonicalRepoPath?: string,
    options?: SkillMdInstallOptions,
  ): Promise<void> {
    validateSkillName(skillName);
    const platform = getSupportedPlatforms().find((p) => p.id === platformId);
    if (!platform) {
      throw new SkillPlatformError(
        "platform-unsupported",
        `Unknown platform: ${platformId}`,
      );
    }

    // Ensure the canonical copy exists in local repo
    const canonicalDir =
      canonicalRepoPath ??
      (await saveContentToLocalRepo(skillName, skillMdContent));

    const skillsDir = getPlatformSkillsDir(platform);
    const skillDir = path.join(skillsDir, skillName);

    try {
      if (isCherryStudioPlatform(platform.id)) {
        await installCherryStudioSkill(platform, skillName, canonicalDir);
        await cleanupLegacyCherryStudioSkills(
          platform,
          skillName,
          options?.legacySkillNames,
        );
        return;
      }

      await fs.mkdir(skillsDir, { recursive: true });
      await copySkillRepoToPlatform(canonicalDir, skillDir);
      await cleanupLegacyPlatformSkillDirs(
        platform,
        skillName,
        options?.legacySkillNames,
      );
    } catch (error) {
      console.error(
        `Failed to install skill directory to ${platform.name}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Uninstall SKILL.md from a specific platform.
   */
  async function uninstallSkillMd(
    skillName: string,
    platformId: string,
    options?: SkillMdInstallOptions,
  ): Promise<void> {
    validateSkillName(skillName);
    const platform = getSupportedPlatforms().find((p) => p.id === platformId);
    if (!platform) {
      throw new SkillPlatformError(
        "platform-unsupported",
        `Unknown platform: ${platformId}`,
      );
    }

    try {
      if (isCherryStudioPlatform(platform.id)) {
        await uninstallCherryStudioSkill(platform, skillName);
        await cleanupLegacyCherryStudioSkills(
          platform,
          skillName,
          options?.legacySkillNames,
        );
        return;
      }

      await removePlatformSkillDir(platform, skillName);
      await cleanupLegacyPlatformSkillDirs(
        platform,
        skillName,
        options?.legacySkillNames,
      );
    } catch (error) {
      console.error(
        `Failed to uninstall SKILL.md from ${platform.name}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get SKILL.md installation status across all platforms
   */
  async function getSkillMdInstallStatus(
    skillName: string,
    options?: SkillMdInstallOptions,
  ): Promise<Record<string, boolean>> {
    validateSkillName(skillName);
    const status: Record<string, boolean> = {};

    for (const platform of getSupportedPlatforms()) {
      const skillsDir = getPlatformSkillsDir(platform);
      const platformSkillNames = [
        skillName,
        ...(options?.legacySkillNames ?? []),
      ].filter((value, index, list) => value && list.indexOf(value) === index);

      status[platform.id] = false;
      for (const platformSkillName of platformSkillNames) {
        if (isCherryStudioPlatform(platform.id)) {
          if (await getCherryStudioSkillStatus(platform, platformSkillName)) {
            status[platform.id] = true;
            break;
          }
          continue;
        }

        const skillMdPath = path.join(skillsDir, platformSkillName, "SKILL.md");
        if (await fileExists(skillMdPath)) {
          status[platform.id] = true;
          break;
        }
      }
    }

    return status;
  }

  async function inspectPlatformSkillInstall(
    platform: SkillPlatform,
    platformSkillName: string,
  ): Promise<SkillPlatformInstallStatus> {
    validateSkillName(platformSkillName);
    if (isCherryStudioPlatform(platform.id)) {
      if (!(await getCherryStudioSkillStatus(platform, platformSkillName))) {
        return { installed: false };
      }

      const skillDir = path.join(
        getPlatformSkillsDir(platform),
        platformSkillName,
      );
      try {
        const stat = await fs.lstat(skillDir);
        return {
          installed: true,
          mode: stat.isSymbolicLink() ? "symlink" : "copy",
        };
      } catch {
        return { installed: true, mode: "copy" };
      }
    }

    const skillDir = path.join(
      getPlatformSkillsDir(platform),
      platformSkillName,
    );
    const skillMdPath = path.join(skillDir, "SKILL.md");

    try {
      const stat = await fs.lstat(skillDir);
      if (stat.isSymbolicLink()) {
        return { installed: true, mode: "symlink" };
      }
      if (stat.isDirectory() || stat.isFile()) {
        return {
          installed: await fileExists(skillMdPath),
          mode: "copy",
        };
      }
    } catch (error: unknown) {
      if (getErrorCode(error) !== "ENOENT") {
        throw error;
      }
    }

    if (await fileExists(skillMdPath)) {
      return { installed: true, mode: "copy" };
    }

    return { installed: false };
  }

  async function getSkillMdInstallStatusDetails(
    skillName: string,
    options?: SkillMdInstallOptions,
  ): Promise<SkillPlatformInstallStatusMap> {
    validateSkillName(skillName);
    const status: SkillPlatformInstallStatusMap = {};

    for (const platform of getSupportedPlatforms()) {
      const platformSkillNames = [
        skillName,
        ...(options?.legacySkillNames ?? []),
      ].filter((value, index, list) => value && list.indexOf(value) === index);

      status[platform.id] = { installed: false };
      for (const platformSkillName of platformSkillNames) {
        const installStatus = await inspectPlatformSkillInstall(
          platform,
          platformSkillName,
        );
        if (installStatus.installed) {
          status[platform.id] = installStatus;
          break;
        }
      }
    }

    return status;
  }

  /**
   * Install SKILL.md to a platform via symlink (soft install)
   *
   * Creates a platform skill directory as a directory symlink to the managed
   * repo. This makes the entire skill folder the installation unit.
   */
  async function installSkillMdSymlink(
    skillName: string,
    skillMdContent: string,
    platformId: string,
    canonicalRepoPath?: string,
    options?: SkillMdInstallOptions,
  ): Promise<SkillPlatformInstallResult> {
    const mainSkillsDir = getSkillsDirAccessor();
    validateSkillName(skillName);
    const platform = getSupportedPlatforms().find((p) => p.id === platformId);
    if (!platform) {
      throw new SkillPlatformError(
        "platform-unsupported",
        `Unknown platform: ${platformId}`,
      );
    }

    await initSkillsDir();

    // 1. Write the canonical copy into PromptHub's own skills dir
    const canonicalDir =
      canonicalRepoPath ?? path.join(mainSkillsDir, skillName);
    if (!canonicalRepoPath) {
      await fs.mkdir(canonicalDir, { recursive: true });
      await fs.writeFile(
        path.join(canonicalDir, "SKILL.md"),
        skillMdContent,
        "utf-8",
      );
    }

    // 2. Create a platform skill dir as a directory symlink to the managed repo
    const platformSkillsDir = getPlatformSkillsDir(platform);
    const platformSkillDir = path.join(platformSkillsDir, skillName);
    const fallbackInstall = async (
      reason: string,
    ): Promise<SkillPlatformInstallResult> => {
      console.warn(
        `Symlink install unsupported for "${skillName}" on ${platform.name}; falling back to copy install. Reason: ${reason}`,
      );
      await installSkillMd(
        skillName,
        skillMdContent,
        platformId,
        canonicalDir,
        options,
      );
      return {
        requestedMode: "symlink",
        effectiveMode: "copy",
        fallbackReason: reason,
      };
    };

    try {
      if (isCherryStudioPlatform(platform.id)) {
        await installCherryStudioSkill(platform, skillName, canonicalDir, {
          mode: "symlink",
        });
        await cleanupLegacyCherryStudioSkills(
          platform,
          skillName,
          options?.legacySkillNames,
        );
        return {
          requestedMode: "symlink",
          effectiveMode: "symlink",
        };
      }

      // Ensure parent exists
      await fs.mkdir(platformSkillsDir, { recursive: true });

      await replaceSkillDestination(platformSkillDir, (stage) =>
        fs.symlink(canonicalDir, stage, "dir"),
      );
      await cleanupLegacyPlatformSkillDirs(
        platform,
        skillName,
        options?.legacySkillNames,
      );
      return {
        requestedMode: "symlink",
        effectiveMode: "symlink",
      };
    } catch (error) {
      const code = getErrorCode(error);
      const message = error instanceof Error ? error.message : String(error);
      // Cherry's native library and mirror publication must retain the requested mode.
      if (isCherryStudioPlatform(platform.id)) throw error;
      // Windows needs either admin or Developer Mode to call CreateSymbolicLink.
      // macOS/Linux commonly fail with EACCES on read-only file systems. In all
      // these cases the copy fallback is the right behavior — the user still
      // gets the skill installed. We log a structured warning so that a
      // partial-failure toast (see renderer #93 handling) can tell the user
      // that a copy was used instead of a symlink.
      if (
        code === "EPERM" ||
        code === "EACCES" ||
        code === "ENOTSUP" ||
        code === "UNKNOWN"
      ) {
        return fallbackInstall(`${code}: ${message}`);
      }

      console.error(
        `Failed to create symlink for "${skillName}" to ${platform.name}:`,
        error,
      );
      // Rethrow with a more actionable message so the renderer can show a
      // localizable error. The raw node error message is preserved in .cause.
      const formatted = new Error(
        `Symlink install failed for "${skillName}" on ${platform.name}: ${message}${
          code ? ` (${code})` : ""
        }`,
      );
      if (error instanceof Error) {
        (formatted as Error & { cause?: unknown }).cause = error;
      }
      throw formatted;
    }
  }

  async function withActivationRollback<T>(
    platform: SkillPlatform,
    skill: SkillPlatformIdentity,
    operation: () => Promise<T>,
    legacySkillNames: string[] = [],
  ): Promise<T> {
    if (isCherryStudioPlatform(platform.id)) return operation();
    const legacyNames = [...new Set(legacySkillNames)].filter(
      (name) => name && name !== skill.name,
    );
    const state = await readPlatformActivationState(platform);
    for (const name of legacyNames) {
      validateSkillName(name);
      await assertPlatformContentWritable(
        path.join(getPlatformSkillsDir(platform), name),
        skill.local_repo_path,
        state[name],
        skill.id,
        true,
      );
    }
    const protect = (names: string[]): Promise<T> => {
      const [name, ...rest] = names;
      return name
        ? withPlatformTargetRollback(
            path.join(getPlatformSkillsDir(platform), name),
            () => protect(rest),
          )
        : operation();
    };
    return protect([skill.name, ...legacyNames]);
  }

  async function assertOwnedTarget(
    platform: SkillPlatform,
    skill: SkillPlatformIdentity,
    source?: string,
    removing = false,
  ): Promise<void> {
    if (isCherryStudioPlatform(platform.id)) return;
    const state = await readPlatformActivationState(platform);
    await assertPlatformContentWritable(
      path.join(getPlatformSkillsDir(platform), skill.name),
      source ?? skill.local_repo_path,
      state[skill.name],
      skill.id,
      removing,
    );
  }

  async function installSkillMdForSkill(
    skill: SkillPlatformIdentity,
    skillMdContent: string,
    platformId: string,
    canonicalRepoPath?: string,
    legacySkillNames?: string[],
  ): Promise<void> {
    if (platformId === SHARED_AGENT_SKILLS_TARGET_ID) {
      const sourcePath =
        canonicalRepoPath ??
        (await saveContentToLocalRepo(skill.name, skillMdContent));
      await sharedSkillDistributionService.install({
        skillId: skill.id,
        skillName: skill.name,
        sourcePath,
        mode: "copy",
      });
      return;
    }
    const platform = getSupportedPlatforms().find(
      (entry) => entry.id === platformId,
    );
    if (!platform) {
      throw new SkillPlatformError(
        "platform-unsupported",
        `Unknown platform: ${platformId}`,
      );
    }

    canonicalRepoPath ??=
      skill.local_repo_path ??
      (await saveContentToLocalRepo(skill.name, skillMdContent));
    await assertOwnedTarget(platform, skill, canonicalRepoPath);
    await withActivationRollback(
      platform,
      skill,
      async () => {
        await installSkillMd(
          skill.name,
          skillMdContent,
          platformId,
          canonicalRepoPath,
          {
            legacySkillNames,
          },
        );
        await setPlatformActivation(
          platform,
          skill,
          canonicalRepoPath ?? skill.local_repo_path,
        );
      },
      legacySkillNames,
    );
  }

  async function installSkillMdSymlinkForSkill(
    skill: SkillPlatformIdentity,
    skillMdContent: string,
    platformId: string,
    canonicalRepoPath?: string,
    legacySkillNames?: string[],
  ): Promise<SkillPlatformInstallResult> {
    if (platformId === SHARED_AGENT_SKILLS_TARGET_ID) {
      const sourcePath =
        canonicalRepoPath ??
        (await saveContentToLocalRepo(skill.name, skillMdContent));
      const result = await sharedSkillDistributionService.install({
        skillId: skill.id,
        skillName: skill.name,
        sourcePath,
        mode: "symlink",
      });
      return {
        requestedMode: "symlink",
        effectiveMode: result.effectiveMode ?? "symlink",
      };
    }
    const platform = getSupportedPlatforms().find(
      (entry) => entry.id === platformId,
    );
    if (!platform) {
      throw new SkillPlatformError(
        "platform-unsupported",
        `Unknown platform: ${platformId}`,
      );
    }

    canonicalRepoPath ??=
      skill.local_repo_path ??
      (await saveContentToLocalRepo(skill.name, skillMdContent));
    await assertOwnedTarget(platform, skill, canonicalRepoPath);
    return withActivationRollback(
      platform,
      skill,
      async () => {
        const result = await installSkillMdSymlink(
          skill.name,
          skillMdContent,
          platformId,
          canonicalRepoPath,
          { legacySkillNames },
        );
        await setPlatformActivation(
          platform,
          skill,
          canonicalRepoPath ?? skill.local_repo_path,
        );
        return result;
      },
      legacySkillNames,
    );
  }

  async function uninstallSkillMdForSkill(
    skill: SkillPlatformIdentity,
    platformId: string,
    legacySkillNames?: string[],
  ): Promise<void> {
    if (platformId === SHARED_AGENT_SKILLS_TARGET_ID) {
      await sharedSkillDistributionService.uninstall({
        skillId: skill.id,
        skillName: skill.name,
      });
      return;
    }
    const platform = getSupportedPlatforms().find(
      (entry) => entry.id === platformId,
    );
    if (!platform) {
      throw new SkillPlatformError(
        "platform-unsupported",
        `Unknown platform: ${platformId}`,
      );
    }

    await assertOwnedTarget(platform, skill, skill.local_repo_path, true);
    await withActivationRollback(
      platform,
      skill,
      async () => {
        await uninstallSkillMd(skill.name, platformId, { legacySkillNames });
        await clearPlatformActivation(platform, skill);
      },
      legacySkillNames,
    );
  }

  async function getSkillMdInstallStatusForSkill(
    skill: SkillPlatformIdentity,
    legacySkillNames?: string[],
  ): Promise<Record<string, boolean>> {
    const baseStatus = await getSkillMdInstallStatus(skill.name, {
      legacySkillNames,
    });
    const status: Record<string, boolean> = {};

    for (const platform of getSupportedPlatforms()) {
      if (
        baseStatus[platform.id] &&
        (await isPlatformActivationCurrent(platform, skill))
      ) {
        status[platform.id] = true;
        continue;
      }

      status[platform.id] = Boolean(
        await inspectSkillSourcePathInstall(platform, skill),
      );
    }
    const sharedStatus = await sharedSkillDistributionService.getStatus({
      skillId: skill.id,
      skillName: skill.name,
    });
    status[SHARED_AGENT_SKILLS_TARGET_ID] =
      sharedStatus.state === "managed-clean" ||
      sharedStatus.state === "managed-modified";

    return status;
  }

  async function getSkillMdInstallStatusDetailsForSkill(
    skill: SkillPlatformIdentity,
    legacySkillNames?: string[],
  ): Promise<SkillPlatformInstallStatusMap> {
    const baseStatus = await getSkillMdInstallStatusDetails(skill.name, {
      legacySkillNames,
    });
    const status: SkillPlatformInstallStatusMap = {};

    for (const platform of getSupportedPlatforms()) {
      const installStatus = baseStatus[platform.id] ?? { installed: false };
      if (
        installStatus.installed &&
        (await isPlatformActivationCurrent(platform, skill))
      ) {
        const record = (await readPlatformActivationState(platform))[
          skill.name
        ];
        const contentState = isCherryStudioPlatform(platform.id)
          ? undefined
          : await inspectPlatformContent(
              path.join(getPlatformSkillsDir(platform), skill.name),
              skill.local_repo_path,
              record,
            );
        status[platform.id] = { ...installStatus, contentState };
        continue;
      }

      status[platform.id] = (await inspectSkillSourcePathInstall(
        platform,
        skill,
      )) ?? {
        installed: false,
      };
    }
    const sharedStatus = await sharedSkillDistributionService.getStatus({
      skillId: skill.id,
      skillName: skill.name,
    });
    status[SHARED_AGENT_SKILLS_TARGET_ID] = {
      installed:
        sharedStatus.state === "managed-clean" ||
        sharedStatus.state === "managed-modified",
      mode: sharedStatus.effectiveMode,
      contentState:
        sharedStatus.state === "managed-modified"
          ? "conflict"
          : sharedStatus.state === "managed-clean"
            ? await inspectPlatformContent(
                sharedStatus.targetPath,
                skill.local_repo_path,
                {
                  skillId: skill.id,
                  installedFingerprint: sharedStatus.installedFingerprint,
                },
              )
            : "unverified",
    };

    return status;
  }

  function locked<T>(
    platformId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const platform = getSupportedPlatforms().find(
      (entry) => entry.id === platformId,
    );
    const key = platform ? getPlatformSkillsDir(platform) : platformId;
    return withPlatformOperationLock(key, operation);
  }
  return {
    installSkillMd,
    uninstallSkillMd,
    getSkillMdInstallStatus,
    getSkillMdInstallStatusDetails,
    installSkillMdSymlink,
    installSkillMdForSkill: (...args) =>
      locked(args[2], () => installSkillMdForSkill(...args)),
    installSkillMdSymlinkForSkill: (...args) =>
      locked(args[2], () => installSkillMdSymlinkForSkill(...args)),
    uninstallSkillMdForSkill: (...args) =>
      locked(args[1], () => uninstallSkillMdForSkill(...args)),
    getSkillMdInstallStatusForSkill,
    getSkillMdInstallStatusDetailsForSkill,
  };
}
