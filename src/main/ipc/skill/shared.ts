import fs from "fs";
import type { SkillDB } from "../../database/skill";
import { SkillInstaller } from "../../services/skill-installer";
import type {
  SkillFileSnapshot,
  SkillLocalFileEntry,
} from "../../../shared/types";

export interface SkillIPCContext {
  db: SkillDB;
}

export async function ensureLocalRepoPath(
  db: SkillDB,
  skillId: string,
): Promise<string | null> {
  const skill = db.getById(skillId);
  if (!skill) return null;

  const repoPath =
    skill.local_repo_path || SkillInstaller.getLocalRepoPath(skill.name);

  try {
    const stat = fs.statSync(repoPath);
    if (stat.isDirectory()) {
      return repoPath;
    }
  } catch {
    // fall through to bootstrap from DB content
  }

  const repoContent = skill.instructions || skill.content || "";
  if (!repoContent.trim()) {
    return null;
  }

  const savedRepoPath = await SkillInstaller.saveContentToLocalRepo(
    skill.name,
    repoContent,
  );
  if (skill.local_repo_path !== savedRepoPath) {
    db.update(skillId, { local_repo_path: savedRepoPath });
  }
  return savedRepoPath;
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
    .filter((file) => !file.isDirectory)
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

export function resolveRepoPath(db: SkillDB, skillId: string): string | null {
  if (typeof skillId !== "string" || skillId.trim() === "") {
    return null;
  }

  const skill = db.getById(skillId);
  if (!skill) return null;

  const repoPath =
    skill.local_repo_path || SkillInstaller.getLocalRepoPath(skill.name);
  try {
    const stat = fs.statSync(repoPath);
    if (stat.isDirectory()) {
      return repoPath;
    }
  } catch {
    return null;
  }

  return null;
}
