import fs from "fs/promises";
import { withSkillSnapshotEntrypoint } from "@prompthub/shared/utils/skill-file-snapshot";
import { readSkillFileSnapshots } from "@prompthub/core/skills/file-snapshot";
import { mutateSkillPackage } from "@prompthub/core/skills/package-mutation";
import type { SkillDB } from "../../database/skill";
import { SkillInstaller } from "../../services/skill-installer";
import type { Skill, SkillFileSnapshot } from "@prompthub/shared/types";

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

  if (!skill.local_repo_path) return null;
  return (await isExistingDirectory(skill.local_repo_path))
    ? skill.local_repo_path
    : null;
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

  if (!ensuredRepoPath)
    throw new Error(`Unable to read Skill package: ${skillId}`);
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

  filesSnapshot = withSkillSnapshotEntrypoint(
    filesSnapshot,
    entrypointContent ?? skill.content ?? skill.instructions ?? "",
  );

  if (
    await mutateSkillPackage(db, skillId, {
      kind: "replace",
      files: filesSnapshot,
    })
  ) {
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

  if (!skill.local_repo_path) return null;
  return (await isExistingDirectory(skill.local_repo_path))
    ? skill.local_repo_path
    : null;
}
