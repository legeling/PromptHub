import fs from "fs/promises";
import { withSkillSnapshotEntrypoint } from "@prompthub/shared/utils/skill-file-snapshot";
import { readSkillFileSnapshots } from "@prompthub/core/skills/file-snapshot";
import { mutateCanonicalSkillPackage } from "@prompthub/core/skills/canonical-package-mutation";
import { getCanonicalSkillWorkspacePath, hydrateCanonicalSkillWorkspace } from "@prompthub/core/canonical-skill-library";
import { getRuntimeStorageContext } from "@prompthub/core/runtime-paths";
import type { SkillDB } from "../../database/skill";
import { SkillInstaller } from "../../services/skill-installer";
import type {
  SkillFileSnapshot,
} from "@prompthub/shared/types";

export interface SkillIPCContext {
  db: SkillDB;
}

async function isExistingDirectory(repoPath: string): Promise<boolean> {
  try {
    const repoStat = await fs.stat(repoPath);
    return repoStat.isDirectory();
  } catch {
    return false;
  }
}

export async function ensureLocalRepoPath(
  db: SkillDB,
  skillId: string,
): Promise<string | null> {
  const skill = db.getById(skillId);
  if (!skill) return null;

  if (getRuntimeStorageContext().localAuthority === "canonical-files" &&
    skill.local_repo_path === getCanonicalSkillWorkspacePath(skillId) &&
    !(await isExistingDirectory(skill.local_repo_path))) {
    return hydrateCanonicalSkillWorkspace(skillId);
  }

  if (
    skill.local_repo_path &&
    !(await SkillInstaller.isManagedRepoPath(skill.local_repo_path))
  ) {
    return (await isExistingDirectory(skill.local_repo_path))
      ? skill.local_repo_path
      : null;
  }

  const managedRepoPath = SkillInstaller.getPreferredLocalRepoPathForSkill(skill);
  const candidateRepoPath =
    skill.local_repo_path &&
    (await SkillInstaller.isManagedRepoPath(skill.local_repo_path))
      ? skill.local_repo_path
      : managedRepoPath;

  try {
    await SkillInstaller.materializeManagedRepoSymlink(candidateRepoPath);
    const candidateStat = await fs.stat(candidateRepoPath);
    if (candidateStat.isDirectory()) {
      if (skill.local_repo_path !== candidateRepoPath) {
        db.update(skillId, { local_repo_path: candidateRepoPath });
      }
      return candidateRepoPath;
    }
  } catch {
    // fall through to bootstrap from DB content
  }

  const repoContent = skill.instructions || skill.content || "";
  if (!repoContent.trim()) {
    return null;
  }

  const savedRepoPath = await SkillInstaller.saveContentToLocalRepoBySkillId(
    skill,
    repoContent,
  );
  if (skill.local_repo_path !== savedRepoPath) {
    db.update(skillId, { local_repo_path: savedRepoPath });
  }
  return savedRepoPath;
}

export async function ensureLocalRepoPathByName(
  db: SkillDB,
  skillName: string,
): Promise<string | null> {
  if (typeof skillName !== "string" || skillName.trim() === "") {
    return null;
  }

  const skill = db.getByName(skillName);
  if (!skill) {
    return null;
  }

  return ensureLocalRepoPath(db, skill.id);
}

export async function ensureLocalRepoPathBySkillId(
  db: SkillDB,
  skillId: string,
): Promise<string | null> {
  if (typeof skillId !== "string" || skillId.trim() === "") {
    return null;
  }

  return ensureLocalRepoPath(db, skillId);
}

export async function readCurrentFilesSnapshot(
  db: SkillDB,
  skillId: string,
): Promise<SkillFileSnapshot[]> {
  const ensuredRepoPath = await ensureLocalRepoPath(db, skillId);
  const skill = db.getById(skillId);
  if (!skill) return [];

  if (!ensuredRepoPath) throw new Error(`Unable to read Skill package: ${skillId}`);
  return readSkillFileSnapshots(ensuredRepoPath);
}

export async function replaceRepoFiles(
  db: SkillDB,
  skillId: string,
  filesSnapshot?: SkillFileSnapshot[],
  entrypointContent?: string,
): Promise<string | null> {
  if (!filesSnapshot) return null;

  const skill = db.getById(skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  filesSnapshot = withSkillSnapshotEntrypoint(filesSnapshot, entrypointContent ?? skill.content ?? skill.instructions ?? "");

  if (await mutateCanonicalSkillPackage(db, skillId, { kind: "replace", files: filesSnapshot })) {
    return db.getById(skillId)?.local_repo_path ?? null;
  }

  const repoPath = await ensureLocalRepoPath(db, skillId);
  if (!repoPath) {
    throw new Error(`Unable to resolve local repo for skill: ${skillId}`);
  }
  await SkillInstaller.replaceLocalRepoFilesByPath(repoPath, filesSnapshot);
  return repoPath;
}

export async function resolveRepoPath(
  db: SkillDB,
  skillId: string,
): Promise<string | null> {
  if (typeof skillId !== "string" || skillId.trim() === "") {
    return null;
  }

  const skill = db.getById(skillId);
  if (!skill) return null;

  if (
    skill.local_repo_path &&
    !(await SkillInstaller.isManagedRepoPath(skill.local_repo_path))
  ) {
    return (await isExistingDirectory(skill.local_repo_path))
      ? skill.local_repo_path
      : null;
  }

  const repoPath =
    skill.local_repo_path &&
    (await SkillInstaller.isManagedRepoPath(skill.local_repo_path))
      ? skill.local_repo_path
      : SkillInstaller.getPreferredLocalRepoPathForSkill(skill);
  try {
    await SkillInstaller.materializeManagedRepoSymlink(repoPath);
    const repoStat = await fs.stat(repoPath);
    if (repoStat.isDirectory()) {
      return repoPath;
    }
  } catch {
    return null;
  }

  return null;
}
