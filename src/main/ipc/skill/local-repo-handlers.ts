import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../../shared/constants";
import { SkillInstaller } from "../../services/skill-installer";
import { buildSkillSyncUpdateFromRepo } from "../../services/skill-repo-sync";
import type { SkillIPCContext } from "./shared";
import { ensureLocalRepoPath, readCurrentFilesSnapshot } from "./shared";

async function resolveManagedRepoPath(
  context: SkillIPCContext,
  skillId: string,
): Promise<string> {
  const skill = context.db.getById(skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  if (
    skill.local_repo_path &&
    SkillInstaller.isManagedRepoPath(skill.local_repo_path)
  ) {
    return skill.local_repo_path;
  }

  const ensuredRepoPath = await ensureLocalRepoPath(context.db, skillId);
  if (ensuredRepoPath && SkillInstaller.isManagedRepoPath(ensuredRepoPath)) {
    return ensuredRepoPath;
  }

  const managedRepoPath = SkillInstaller.getLocalRepoPath(skill.name);
  if (skill.local_repo_path !== managedRepoPath) {
    context.db.update(skillId, { local_repo_path: managedRepoPath });
  }
  return managedRepoPath;
}

async function createVersionSnapshotIfNeeded(
  context: SkillIPCContext,
  skillId: string,
  note: string,
): Promise<void> {
  const skill = context.db.getById(skillId);
  if (!skill) {
    return;
  }

  const filesSnapshot = await readCurrentFilesSnapshot(context.db, skillId);
  context.db.createVersion(skillId, note, filesSnapshot, skill);
}

async function syncSkillContentFromRepo(
  context: SkillIPCContext,
  skillId: string,
  repoPath: string,
): Promise<void> {
  await syncSkillFromRepo(context, skillId, repoPath);
}

async function syncSkillFromRepo(
  context: SkillIPCContext,
  skillId: string,
  repoPath?: string,
) {
  const skill = context.db.getById(skillId);
  if (!skill) {
    return null;
  }

  const resolvedRepoPath = repoPath ?? (await ensureLocalRepoPath(context.db, skillId));
  if (!resolvedRepoPath) {
    return skill;
  }

  const files = await SkillInstaller.readLocalRepoFilesByPath(resolvedRepoPath);
  const skillMdFile = files.find(
    (file) => !file.isDirectory && file.path.toLowerCase() === "skill.md",
  );
  if (!skillMdFile?.content) {
    return skill;
  }

  const nextUpdate = buildSkillSyncUpdateFromRepo(skill, skillMdFile.content);
  if (!nextUpdate) {
    return skill;
  }

  return context.db.update(skillId, nextUpdate);
}

export function registerSkillLocalRepoHandlers({ db }: SkillIPCContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SKILL_SAVE_TO_REPO,
    async (_, skillName: string, sourceDir: string) => {
      if (typeof skillName !== "string" || skillName.trim().length === 0) {
        throw new Error("skill:saveToRepo requires a non-empty skillName");
      }
      if (typeof sourceDir !== "string" || sourceDir.trim().length === 0) {
        throw new Error("skill:saveToRepo requires a non-empty sourceDir");
      }
      return SkillInstaller.saveToLocalRepo(skillName, sourceDir);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_LIST_LOCAL_FILES, async (_, skillId: string) => {
    if (typeof skillId !== "string" || skillId.trim() === "") {
      return [];
    }
    const skill = db.getById(skillId);
    if (!skill) return [];
    const repoPath = await ensureLocalRepoPath(db, skillId);
    if (repoPath) {
      return SkillInstaller.listLocalRepoFilesByPath(repoPath);
    }
    return SkillInstaller.listLocalRepoFiles(skill.name);
  });

  ipcMain.handle(
    IPC_CHANNELS.SKILL_READ_LOCAL_FILE,
    async (_, skillId: string, relativePath: string) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        return null;
      }
      if (typeof relativePath !== "string" || relativePath.trim() === "") {
        return null;
      }
      const skill = db.getById(skillId);
      if (!skill) return null;
      const repoPath = await ensureLocalRepoPath(db, skillId);
      if (repoPath) {
        return SkillInstaller.readLocalRepoFileByPath(repoPath, relativePath);
      }
      return SkillInstaller.readLocalRepoFile(skill.name, relativePath);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_READ_LOCAL_FILES, async (_, skillId: string) => {
    if (typeof skillId !== "string" || skillId.trim() === "") {
      return [];
    }
    const skill = db.getById(skillId);
    if (!skill) return [];
    const repoPath = await ensureLocalRepoPath(db, skillId);
    if (repoPath) {
      return SkillInstaller.readLocalRepoFilesByPath(repoPath);
    }
    return SkillInstaller.readLocalRepoFiles(skill.name);
  });

  ipcMain.handle(
    IPC_CHANNELS.SKILL_RENAME_LOCAL_PATH,
    async (
      _,
      skillId: string,
      oldRelativePath: string,
      newRelativePath: string,
    ) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        throw new Error("skill:renameLocalPath requires a non-empty skillId");
      }
      if (
        typeof oldRelativePath !== "string" ||
        oldRelativePath.trim().length === 0
      ) {
        throw new Error(
          "skill:renameLocalPath requires a non-empty oldRelativePath",
        );
      }
      if (
        typeof newRelativePath !== "string" ||
        newRelativePath.trim().length === 0
      ) {
        throw new Error(
          "skill:renameLocalPath requires a non-empty newRelativePath",
        );
      }
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
      await createVersionSnapshotIfNeeded(
        { db },
        skillId,
        `Before renaming ${oldRelativePath} to ${newRelativePath}`,
      );
      const result = await SkillInstaller.renameLocalRepoPathByPath(
        repoPath,
        oldRelativePath,
        newRelativePath,
      );
      if (
        oldRelativePath.toLowerCase() === "skill.md" ||
        newRelativePath.toLowerCase() === "skill.md"
      ) {
        await syncSkillContentFromRepo({ db }, skillId, repoPath);
      }
      return result;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE,
    async (
      _,
      skillId: string,
      relativePath: string,
      content: string,
      options?: { skipVersionSnapshot?: boolean },
    ) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        throw new Error("skill:writeLocalFile requires a non-empty skillId");
      }
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
      if (!options?.skipVersionSnapshot) {
        await createVersionSnapshotIfNeeded(
          { db },
          skillId,
          `Before updating ${relativePath}`,
        );
      }
      const result = await SkillInstaller.writeLocalRepoFileByPath(
        repoPath,
        relativePath,
        content,
      );
      if (relativePath.toLowerCase() === "skill.md") {
        db.update(skillId, {
          content,
          instructions: content,
        });
      }
      return result;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE,
    async (_, skillId: string, relativePath: string) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        throw new Error("skill:deleteLocalFile requires a non-empty skillId");
      }
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
      await createVersionSnapshotIfNeeded(
        { db },
        skillId,
        `Before deleting ${relativePath}`,
      );
      const result = await SkillInstaller.deleteLocalRepoFileByPath(
        repoPath,
        relativePath,
      );
      if (relativePath.toLowerCase() === "skill.md") {
        await syncSkillContentFromRepo({ db }, skillId, repoPath);
      }
      return result;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_CREATE_LOCAL_DIR,
    async (_, skillId: string, relativePath: string) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        throw new Error("skill:createLocalDir requires a non-empty skillId");
      }
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
      await createVersionSnapshotIfNeeded(
        { db },
        skillId,
        `Before creating directory ${relativePath}`,
      );
      return SkillInstaller.createLocalRepoDirByPath(repoPath, relativePath);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_GET_REPO_PATH, async (_, skillId: string) => {
    if (typeof skillId !== "string" || skillId.trim() === "") {
      return null;
    }
    return ensureLocalRepoPath(db, skillId);
  });

  ipcMain.handle(IPC_CHANNELS.SKILL_SYNC_FROM_REPO, async (_, skillId: string) => {
    if (typeof skillId !== "string" || skillId.trim() === "") {
      return null;
    }
    return syncSkillFromRepo({ db }, skillId);
  });
}
