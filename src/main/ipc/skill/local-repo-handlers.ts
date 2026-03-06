import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../../shared/constants";
import { SkillInstaller } from "../../services/skill-installer";
import type { SkillIPCContext } from "./shared";
import { ensureLocalRepoPath } from "./shared";

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
    IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE,
    async (_, skillId: string, relativePath: string, content: string) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        throw new Error("skill:writeLocalFile requires a non-empty skillId");
      }
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
      return SkillInstaller.writeLocalRepoFileByPath(
        repoPath,
        relativePath,
        content,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE,
    async (_, skillId: string, relativePath: string) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        throw new Error("skill:deleteLocalFile requires a non-empty skillId");
      }
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
      return SkillInstaller.deleteLocalRepoFileByPath(repoPath, relativePath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_CREATE_LOCAL_DIR,
    async (_, skillId: string, relativePath: string) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        throw new Error("skill:createLocalDir requires a non-empty skillId");
      }
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
      return SkillInstaller.createLocalRepoDirByPath(repoPath, relativePath);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_GET_REPO_PATH, async (_, skillId: string) => {
    if (typeof skillId !== "string" || skillId.trim() === "") {
      return null;
    }
    return ensureLocalRepoPath(db, skillId);
  });
}
