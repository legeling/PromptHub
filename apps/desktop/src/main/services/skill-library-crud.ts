import fs from "node:fs/promises";
import path from "node:path";
import { getOperationsDir } from "@prompthub/core/runtime-paths";
import {
  SHARED_AGENT_SKILLS_TARGET_ID,
  sharedSkillDistributionService,
} from "@prompthub/core";
import { getPlatformSkillsDir } from "./skill-installer-utils";
import {
  createLibrarySkill,
  prepareLibrarySkillEdit,
  requireCanonicalSkillLibrary,
} from "@prompthub/core/skills/library-commands";
import { isCanonicalCommitOutcomeError } from "@prompthub/core/canonical-entry-publication";
import type { SkillDB } from "@prompthub/db";
import type {
  Skill,
  SkillDeleteOptions,
  SkillPlatformInstallStatusMap,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import { SkillInstaller } from "./skill-installer";

export { createLibrarySkill };

async function deploy(
  skill: Skill,
  platform: string,
  mode: "copy" | "symlink" | undefined,
  source: string | undefined,
): Promise<void> {
  const content = skill.instructions ?? skill.content ?? "";
  if (mode === "symlink") {
    await SkillInstaller.installSkillMdSymlinkForSkill(
      skill,
      content,
      platform,
      source,
    );
  } else {
    await SkillInstaller.installSkillMdForSkill(
      skill,
      content,
      platform,
      source,
    );
  }
}

async function backupDistributions(
  skill: Skill,
  details: SkillPlatformInstallStatusMap,
  root: string,
): Promise<Map<string, string>> {
  const backups = new Map<string, string>();
  const platforms = SkillInstaller.getSupportedPlatforms();
  for (const [platformId, detail] of Object.entries(details)) {
    if (!detail.installed || detail.mode === "symlink") continue;
    const platform = platforms.find((item) => item.id === platformId);
    const source =
      platformId === SHARED_AGENT_SKILLS_TARGET_ID
        ? (
            await sharedSkillDistributionService.getStatus({
              skillId: skill.id,
              skillName: skill.name,
            })
          ).targetPath
        : platform
          ? path.join(getPlatformSkillsDir(platform), skill.name)
          : null;
    if (!source)
      throw new Error(`Cannot resolve Skill distribution on ${platformId}`);
    const backup = path.join(root, String(backups.size));
    await fs.cp(source, backup, { recursive: true });
    backups.set(platformId, backup);
  }
  return backups;
}

async function renameDistributions(
  previous: Skill,
  draft: Skill,
  details: SkillPlatformInstallStatusMap,
  backups: Map<string, string>,
  commit: () => Skill | null,
): Promise<Skill | null> {
  const targets = Object.entries(details).filter(
    ([, detail]) => detail.installed,
  );
  const conflicts = await SkillInstaller.getSkillMdInstallStatusDetails(
    draft.name,
  );
  for (const [platform] of targets)
    if (conflicts[platform]?.installed)
      throw new Error(`Skill rename destination already exists on ${platform}`);
  const installed: string[] = [];
  const removed: string[] = [];
  try {
    for (const [platform, detail] of targets) {
      installed.push(platform);
      await deploy(
        draft,
        platform,
        detail.mode,
        detail.mode === "symlink"
          ? previous.local_repo_path
          : draft.local_repo_path,
      );
    }
    for (const [platform] of targets) {
      removed.push(platform);
      await SkillInstaller.uninstallSkillMdForSkill(previous, platform);
    }
    return commit();
  } catch (error) {
    if (isCanonicalCommitOutcomeError(error)) throw error;
    const failures: unknown[] = [error];
    for (const platform of installed.reverse()) {
      try {
        await SkillInstaller.uninstallSkillMdForSkill(draft, platform);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    for (const platform of removed) {
      try {
        await deploy(
          previous,
          platform,
          details[platform].mode,
          backups.get(platform) ?? previous.local_repo_path,
        );
      } catch (restoreError) {
        failures.push(restoreError);
      }
    }
    if (failures.length > 1)
      throw new AggregateError(
        failures,
        "Skill rename failed and distribution recovery is incomplete",
      );
    throw error;
  }
}

export async function updateLibrarySkill(
  db: SkillDB,
  id: string,
  data: UpdateSkillParams,
): Promise<Skill | null> {
  const edit = await prepareLibrarySkillEdit(db, id, data);
  if (!edit) return null;
  try {
    if (edit.draft.name === edit.previous.name) return edit.commit();
    const details = await SkillInstaller.getSkillMdInstallStatusDetailsForSkill(
      edit.previous,
    );
    await fs.mkdir(getOperationsDir(), { recursive: true });
    const backupRoot = await fs.mkdtemp(
      path.join(getOperationsDir(), "skill-rename-"),
    );
    let keepRecovery = false;
    try {
      const backups = await backupDistributions(
        edit.previous,
        details,
        backupRoot,
      );
      return await renameDistributions(
        edit.previous,
        edit.draft,
        details,
        backups,
        edit.commit,
      );
    } catch (error) {
      keepRecovery = error instanceof AggregateError;
      if (keepRecovery)
        throw new Error(
          `Skill rename recovery requires files retained at ${backupRoot}`,
          { cause: error },
        );
      throw error;
    } finally {
      if (!keepRecovery)
        await fs.rm(backupRoot, { recursive: true, force: true });
    }
  } finally {
    await edit.dispose();
  }
}

export async function deleteLibrarySkill(
  db: SkillDB,
  id: string,
  options?: SkillDeleteOptions,
): Promise<boolean> {
  requireCanonicalSkillLibrary();
  const skill = db.getById(id);
  if (!skill) return false;
  const details =
    await SkillInstaller.getSkillMdInstallStatusDetailsForSkill(skill);
  // Sequential cleanup bounds filesystem fan-out. A failed removal retains the library entry for retry.
  for (const [platform, detail] of Object.entries(details)) {
    if (
      detail.installed &&
      (detail.mode === "symlink" || options?.removeCopyInstallations !== false)
    )
      await SkillInstaller.uninstallSkillMdForSkill(skill, platform);
  }
  return db.delete(id);
}
