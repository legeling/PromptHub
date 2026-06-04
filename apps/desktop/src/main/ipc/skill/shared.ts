import fs from "fs/promises";
import type { SkillDB } from "../../database/skill";
import { SkillInstaller } from "../../services/skill-installer";
import { isInternalSkillRepoEntry } from "../../services/skill-installer-repo";
import type {
  SkillFileSnapshot,
  SkillLocalFileEntry,
} from "@prompthub/shared/types";

export interface SkillIPCContext {
  db: SkillDB;
}

export async function ensureLocalRepoPath(
  db: SkillDB,
  skillId: string,
): Promise<string | null> {
  const skill = db.getById(skillId);
  if (!skill) return null;

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

  if (
    skill.local_repo_path &&
    !(await SkillInstaller.isManagedRepoPath(skill.local_repo_path))
  ) {
    try {
      const externalRepoStat = await fs.stat(skill.local_repo_path);
      if (externalRepoStat.isDirectory()) {
        const savedRepoPath = await SkillInstaller.saveToLocalRepoBySkillId(
          skill,
          skill.local_repo_path,
        );
        if (skill.local_repo_path !== savedRepoPath) {
          db.update(skillId, { local_repo_path: savedRepoPath });
        }
        return savedRepoPath;
      }
    } catch {
      // fall through to bootstrap from DB content
    }
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

  const files: SkillLocalFileEntry[] = ensuredRepoPath
    ? await SkillInstaller.readLocalRepoFilesByPath(ensuredRepoPath)
    : await SkillInstaller.readLocalRepoFiles(skill.name);

  return files
    .filter((file) => !file.isDirectory && !isInternalSkillRepoEntry(file.path))
    .map((file) => ({
      relativePath: file.path,
      content: file.content,
    }));
}

export async function replaceRepoFiles(
  db: SkillDB,
  skillId: string,
  filesSnapshot?: SkillFileSnapshot[],
): Promise<void> {
  if (!filesSnapshot) return;

  const skill = db.getById(skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  const repoPath = await ensureLocalRepoPath(db, skillId);
  if (!repoPath) {
    throw new Error(`Unable to resolve local repo for skill: ${skillId}`);
  }
  await SkillInstaller.replaceLocalRepoFilesByPath(repoPath, filesSnapshot);
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
