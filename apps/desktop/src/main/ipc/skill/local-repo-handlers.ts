import { ipcMain } from "electron";
import { mutateCanonicalSkillPackage } from "@prompthub/core/skills/canonical-package-mutation";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type {
  SkillPackageSnapshot,
  RemoteSkillPackageSaveResult,
  SkillSafetyScanInput,
} from "@prompthub/shared/types";
import { SKILL_PACKAGE_FINGERPRINT_ALGORITHM } from "@prompthub/shared/utils/skill-source-update";
import { SkillInstaller } from "../../services/skill-installer";
import { SkillSafetyReviewRequiredError } from "../../services/skill-update-safety";
import {
  buildSkillSyncUpdateFromRepo,
  computeRepoDirectoryFingerprint,
} from "../../services/skill-repo-sync";
import { validateMaterializedSkillPackage } from "../../services/skill-package-validation";
import type { SkillIPCContext } from "./shared";
import { ensureLocalRepoPath } from "./shared";

function validateApprovedPackageFingerprint(
  value: unknown,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("approvedPackageFingerprint must be a SHA-256 hex string");
  }
  return value;
}

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
    (await SkillInstaller.isManagedRepoPath(skill.local_repo_path))
  ) {
    await SkillInstaller.materializeManagedRepoSymlink(skill.local_repo_path);
    return skill.local_repo_path;
  }

  const ensuredRepoPath = await ensureLocalRepoPath(context.db, skillId);
  if (ensuredRepoPath) {
    if (await SkillInstaller.isManagedRepoPath(ensuredRepoPath)) {
      await SkillInstaller.materializeManagedRepoSymlink(ensuredRepoPath);
    }
    return ensuredRepoPath;
  }

  if (skill.local_repo_path) {
    throw new Error(`Unable to resolve local repo for skill: ${skillId}`);
  }

  const managedRepoPath =
    SkillInstaller.getPreferredLocalRepoPathForSkill(skill);
  if (skill.local_repo_path !== managedRepoPath) {
    context.db.update(skillId, { local_repo_path: managedRepoPath });
  }
  return managedRepoPath;
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

  const resolvedRepoPath =
    repoPath ?? (await ensureLocalRepoPath(context.db, skillId));
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

  const directoryFingerprint =
    await computeRepoDirectoryFingerprint(resolvedRepoPath);
  const nextUpdate = buildSkillSyncUpdateFromRepo(
    skill,
    skillMdFile.content,
    directoryFingerprint,
  );
  if (!nextUpdate) {
    return skill;
  }

  return context.db.update(skillId, nextUpdate);
}

export function registerSkillLocalRepoHandlers({ db }: SkillIPCContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SKILL_SAVE_TO_REPO,
    async (
      _,
      skillId: string,
      sourceDir: string,
      mode?: "copy" | "symlink",
    ) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error("skill:saveToRepo requires a non-empty skillId");
      }
      if (typeof sourceDir !== "string" || sourceDir.trim().length === 0) {
        throw new Error("skill:saveToRepo requires a non-empty sourceDir");
      }
      if (mode && mode !== "copy" && mode !== "symlink") {
        throw new Error("skill:saveToRepo mode must be copy or symlink");
      }
      const skill = db.getById(skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${skillId}`);
      }
      return SkillInstaller.saveToLocalRepoBySkillId(skill, sourceDir, mode);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SAVE_REMOTE_GIT_TO_REPO,
    async (
      _,
      skillId: string,
      options?: {
        repoUrl?: string;
        branch?: string;
        directory?: string;
        safetyScan?: {
          mode?: "enabled" | "disabled";
          aiConfig?: SkillSafetyScanInput["aiConfig"];
        };
        approvedPackageFingerprint?: string;
      },
    ) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error(
          "skill:saveRemoteGitToRepo requires a non-empty skillId",
        );
      }
      if (
        !options ||
        typeof options.repoUrl !== "string" ||
        options.repoUrl.trim().length === 0
      ) {
        throw new Error(
          "skill:saveRemoteGitToRepo requires a non-empty repoUrl",
        );
      }
      const skill = db.getById(skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      try {
        const approvedPackageFingerprint = validateApprovedPackageFingerprint(
          options.approvedPackageFingerprint,
        );
        const repoPath =
          await SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(skill, {
            repoUrl: options.repoUrl,
            branch: options.branch,
            directory: options.directory,
            safetyScan: options.safetyScan,
            approvedPackageFingerprint,
          });
        const directoryFingerprint =
          await computeRepoDirectoryFingerprint(repoPath);
        db.update(skillId, {
          local_repo_path: repoPath,
          directory_fingerprint: directoryFingerprint,
          fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
        });
        return {
          status: "saved",
          repoPath,
        } satisfies RemoteSkillPackageSaveResult;
      } catch (error) {
        if (error instanceof SkillSafetyReviewRequiredError) {
          return {
            status: "safety-review-required",
            review: {
              report: error.report,
              packageFingerprint: error.packageFingerprint,
              sourceKey: error.sourceKey,
            },
          } satisfies RemoteSkillPackageSaveResult;
        }
        throw error;
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SAVE_REMOTE_ZIP_TO_REPO,
    async (
      _,
      skillId: string,
      options?: {
        zipUrl?: string;
        safetyScan?: {
          mode?: "enabled" | "disabled";
          aiConfig?: SkillSafetyScanInput["aiConfig"];
        };
        approvedPackageFingerprint?: string;
      },
    ) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error(
          "skill:saveRemoteZipToRepo requires a non-empty skillId",
        );
      }
      if (
        !options ||
        typeof options.zipUrl !== "string" ||
        options.zipUrl.trim().length === 0
      ) {
        throw new Error(
          "skill:saveRemoteZipToRepo requires a non-empty zipUrl",
        );
      }
      const skill = db.getById(skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      try {
        const approvedPackageFingerprint = validateApprovedPackageFingerprint(
          options.approvedPackageFingerprint,
        );
        const repoPath =
          await SkillInstaller.saveRemoteZipSkillToLocalRepoBySkillId(skill, {
            zipUrl: options.zipUrl,
            safetyScan: options.safetyScan,
            approvedPackageFingerprint,
          });
        const directoryFingerprint =
          await computeRepoDirectoryFingerprint(repoPath);
        db.update(skillId, {
          local_repo_path: repoPath,
          directory_fingerprint: directoryFingerprint,
          fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
        });
        return {
          status: "saved",
          repoPath,
        } satisfies RemoteSkillPackageSaveResult;
      } catch (error) {
        if (error instanceof SkillSafetyReviewRequiredError) {
          return {
            status: "safety-review-required",
            review: {
              report: error.report,
              packageFingerprint: error.packageFingerprint,
              sourceKey: error.sourceKey,
            },
          } satisfies RemoteSkillPackageSaveResult;
        }
        throw error;
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_REMOTE_GIT_PACKAGE_FINGERPRINT,
    async (
      _,
      options?: {
        repoUrl?: string;
        branch?: string;
        directory?: string;
        skillName?: string;
      },
    ) => {
      if (
        !options ||
        typeof options.repoUrl !== "string" ||
        options.repoUrl.trim().length === 0
      ) {
        throw new Error(
          "skill:getRemoteGitPackageFingerprint requires a non-empty repoUrl",
        );
      }
      if (
        options.skillName !== undefined &&
        typeof options.skillName !== "string"
      ) {
        throw new Error(
          "skill:getRemoteGitPackageFingerprint requires skillName to be a string",
        );
      }

      return SkillInstaller.getRemoteGitSkillPackageFingerprint({
        repoUrl: options.repoUrl,
        branch: options.branch,
        directory: options.directory,
        skillName: options.skillName,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_REMOTE_GIT_PACKAGE_SNAPSHOT,
    async (
      _,
      options?: {
        repoUrl?: string;
        branch?: string;
        directory?: string;
        skillName?: string;
      },
    ): Promise<SkillPackageSnapshot> => {
      if (!options?.repoUrl?.trim()) {
        throw new Error(
          "skill:getRemoteGitPackageSnapshot requires a non-empty repoUrl",
        );
      }
      if (
        options.skillName !== undefined &&
        typeof options.skillName !== "string"
      ) {
        throw new Error(
          "skill:getRemoteGitPackageSnapshot requires skillName to be a string",
        );
      }
      return SkillInstaller.getRemoteGitSkillPackageSnapshot({
        repoUrl: options.repoUrl,
        branch: options.branch,
        directory: options.directory,
        skillName: options.skillName,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_REMOTE_ZIP_PACKAGE_SNAPSHOT,
    async (_, options?: { zipUrl?: string }): Promise<SkillPackageSnapshot> => {
      if (!options?.zipUrl?.trim()) {
        throw new Error(
          "skill:getRemoteZipPackageSnapshot requires a non-empty zipUrl",
        );
      }
      return SkillInstaller.getRemoteZipSkillPackageSnapshot({
        zipUrl: options.zipUrl,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_LOCAL_PACKAGE_FINGERPRINT,
    async (_, localPath: string) => {
      if (typeof localPath !== "string" || localPath.trim().length === 0) {
        throw new Error(
          "skill:getLocalPackageFingerprint requires a non-empty localPath",
        );
      }
      const normalizedPath = localPath.trim();
      await validateMaterializedSkillPackage(normalizedPath);
      return computeRepoDirectoryFingerprint(normalizedPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_LOCAL_PACKAGE_SNAPSHOT,
    async (_, localPath?: string): Promise<SkillPackageSnapshot> => {
      if (typeof localPath !== "string" || localPath.trim().length === 0) {
        throw new Error(
          "skill:getLocalPackageSnapshot requires a non-empty localPath",
        );
      }
      return SkillInstaller.getLocalSkillPackageSnapshot(localPath.trim());
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_LIST_LOCAL_FILES,
    async (_, skillId: string) => {
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
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_LIST_LOCAL_FILES_BY_PATH,
    async (_, localPath: string) => {
      if (typeof localPath !== "string" || localPath.trim() === "") {
        return [];
      }
      return SkillInstaller.listLocalRepoFilesByPath(localPath);
    },
  );

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

  ipcMain.handle(
    IPC_CHANNELS.SKILL_READ_LOCAL_FILE_BY_PATH,
    async (_, localPath: string, relativePath: string) => {
      if (typeof localPath !== "string" || localPath.trim() === "") {
        return null;
      }
      if (typeof relativePath !== "string" || relativePath.trim() === "") {
        return null;
      }
      return SkillInstaller.readLocalRepoFileByPath(localPath, relativePath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_READ_LOCAL_FILES,
    async (_, skillId: string) => {
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
    },
  );

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
      if (await mutateCanonicalSkillPackage(db, skillId, { kind: "rename", relativePath: oldRelativePath, newRelativePath })) return true;
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
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
    IPC_CHANNELS.SKILL_RENAME_LOCAL_PATH_BY_PATH,
    async (
      _,
      localPath: string,
      oldRelativePath: string,
      newRelativePath: string,
    ) => {
      if (typeof localPath !== "string" || localPath.trim() === "") {
        throw new Error(
          "skill:renameLocalPathByPath requires a non-empty localPath",
        );
      }
      if (
        typeof oldRelativePath !== "string" ||
        oldRelativePath.trim().length === 0
      ) {
        throw new Error(
          "skill:renameLocalPathByPath requires a non-empty oldRelativePath",
        );
      }
      if (
        typeof newRelativePath !== "string" ||
        newRelativePath.trim().length === 0
      ) {
        throw new Error(
          "skill:renameLocalPathByPath requires a non-empty newRelativePath",
        );
      }
      return SkillInstaller.renameLocalRepoPathByPath(
        localPath,
        oldRelativePath,
        newRelativePath,
      );
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
      if (typeof content !== "string") throw new Error("skill:writeLocalFile requires string content");
      if (await mutateCanonicalSkillPackage(db, skillId, { kind: "write", relativePath, content })) return true;
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
      const result = await SkillInstaller.writeLocalRepoFileByPath(
        repoPath,
        relativePath,
        content,
      );
      if (relativePath.toLowerCase() === "skill.md") {
        const nextFingerprint = await computeRepoDirectoryFingerprint(repoPath);
        db.update(skillId, {
          content,
          instructions: content,
          directory_fingerprint: nextFingerprint,
          fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
        });
      }
      return result;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE_BY_PATH,
    async (_, localPath: string, relativePath: string, content: string) => {
      if (typeof localPath !== "string" || localPath.trim() === "") {
        throw new Error(
          "skill:writeLocalFileByPath requires a non-empty localPath",
        );
      }
      if (typeof relativePath !== "string" || relativePath.trim() === "") {
        throw new Error(
          "skill:writeLocalFileByPath requires a non-empty relativePath",
        );
      }
      if (typeof content !== "string") {
        throw new Error("skill:writeLocalFileByPath requires string content");
      }
      return SkillInstaller.writeLocalRepoFileByPath(
        localPath,
        relativePath,
        content,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE_BUFFER_BY_PATH,
    async (_, localPath: string, relativePath: string, content: Uint8Array) => {
      if (typeof localPath !== "string" || localPath.trim() === "") {
        throw new Error(
          "skill:writeLocalFileBufferByPath requires a non-empty localPath",
        );
      }
      if (typeof relativePath !== "string" || relativePath.trim() === "") {
        throw new Error(
          "skill:writeLocalFileBufferByPath requires a non-empty relativePath",
        );
      }
      if (!(content instanceof Uint8Array)) {
        throw new Error(
          "skill:writeLocalFileBufferByPath requires Uint8Array content",
        );
      }
      return SkillInstaller.writeLocalRepoFileBufferByPath(
        localPath,
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
      if (await mutateCanonicalSkillPackage(db, skillId, { kind: "delete", relativePath })) return true;
      const repoPath = await resolveManagedRepoPath({ db }, skillId);
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
    IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE_BY_PATH,
    async (_, localPath: string, relativePath: string) => {
      if (typeof localPath !== "string" || localPath.trim() === "") {
        throw new Error(
          "skill:deleteLocalFileByPath requires a non-empty localPath",
        );
      }
      if (typeof relativePath !== "string" || relativePath.trim() === "") {
        throw new Error(
          "skill:deleteLocalFileByPath requires a non-empty relativePath",
        );
      }
      return SkillInstaller.deleteLocalRepoFileByPath(localPath, relativePath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_LOCAL_PATH_STATUS,
    async (_, localPath: string) => {
      if (typeof localPath !== "string" || localPath.trim() === "") {
        throw new Error(
          "skill:getLocalPathStatus requires a non-empty localPath",
        );
      }
      return SkillInstaller.getLocalPathStatus(localPath);
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

  ipcMain.handle(
    IPC_CHANNELS.SKILL_CREATE_LOCAL_DIR_BY_PATH,
    async (_, localPath: string, relativePath: string) => {
      if (typeof localPath !== "string" || localPath.trim() === "") {
        throw new Error(
          "skill:createLocalDirByPath requires a non-empty localPath",
        );
      }
      if (typeof relativePath !== "string" || relativePath.trim() === "") {
        throw new Error(
          "skill:createLocalDirByPath requires a non-empty relativePath",
        );
      }
      return SkillInstaller.createLocalRepoDirByPath(localPath, relativePath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_COPY_REPO_BY_PATH_TO_DIRECTORY,
    async (
      _,
      localPath: string,
      skillName: string,
      targetRootDir: string,
      options?: {
        ifExists?: "overwrite" | "skip" | "error";
        mode?: "copy" | "symlink";
      },
    ) => {
      if (typeof localPath !== "string" || localPath.trim() === "") {
        throw new Error(
          "skill:copyRepoByPathToDirectory requires a non-empty localPath",
        );
      }
      if (typeof skillName !== "string" || skillName.trim() === "") {
        throw new Error(
          "skill:copyRepoByPathToDirectory requires a non-empty skillName",
        );
      }
      if (typeof targetRootDir !== "string" || targetRootDir.trim() === "") {
        throw new Error(
          "skill:copyRepoByPathToDirectory requires a non-empty targetRootDir",
        );
      }
      if (
        options !== undefined &&
        (!options ||
          typeof options !== "object" ||
          !["overwrite", "skip", "error", undefined].includes(
            options.ifExists,
          ) ||
          !["copy", "symlink", undefined].includes(options.mode))
      ) {
        throw new Error(
          "skill:copyRepoByPathToDirectory options.ifExists must be overwrite, skip, or error; options.mode must be copy or symlink",
        );
      }
      return SkillInstaller.copyRepoByPathToDirectory(
        localPath,
        skillName,
        targetRootDir,
        options,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_REPO_PATH,
    async (_, skillId: string) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        return null;
      }
      return ensureLocalRepoPath(db, skillId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SYNC_FROM_REPO,
    async (_, skillId: string) => {
      if (typeof skillId !== "string" || skillId.trim() === "") {
        return null;
      }
      return syncSkillFromRepo({ db }, skillId);
    },
  );
}
