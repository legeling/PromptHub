import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type { SkillFileSnapshot, SkillVersion } from "@prompthub/shared/types";
import type { SkillIPCContext } from "./shared";
import { readCurrentFilesSnapshot, replaceRepoFiles } from "./shared";
import { SkillInstaller } from "../../services/skill-installer";

function isValidSkillVersionCreatedAt(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  return Number.isFinite(new Date(value).getTime());
}

export function registerSkillVersionHandlers({ db }: SkillIPCContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SKILL_VERSION_GET_ALL,
    async (_, skillId: string) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error("skill:versionGetAll requires a non-empty skillId");
      }
      return db.getVersions(skillId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_VERSION_CREATE,
    async (
      _,
      skillId: string,
      note?: string,
      filesSnapshot?: SkillFileSnapshot[],
    ) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error("skill:versionCreate requires a non-empty skillId");
      }
      if (note !== undefined && typeof note !== "string") {
        throw new Error("skill:versionCreate expects note to be a string");
      }
      if (filesSnapshot !== undefined && !Array.isArray(filesSnapshot)) {
        throw new Error(
          "skill:versionCreate expects filesSnapshot to be an array",
        );
      }
      const snapshot =
        filesSnapshot ?? (await readCurrentFilesSnapshot(db, skillId));
      return db.createVersion(skillId, note, snapshot);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_VERSION_ROLLBACK,
    async (_, skillId: string, version: number) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error("skill:versionRollback requires a non-empty skillId");
      }
      if (typeof version !== "number" || !Number.isFinite(version)) {
        throw new Error(
          "skill:versionRollback requires version to be a finite number",
        );
      }
      const targetVersion = db.getVersion(skillId, version);
      if (!targetVersion) return null;

      const currentSkill = db.getById(skillId);
      if (!currentSkill) return null;

      const currentFilesSnapshot = await readCurrentFilesSnapshot(db, skillId);
      await db.createVersion(
        skillId,
        `Rollback before restoring v${version}`,
        currentFilesSnapshot,
        currentSkill,
      );

      const updatedSkill = db.update(skillId, {
        content: targetVersion.content,
        instructions: targetVersion.content,
      });
      await replaceRepoFiles(db, skillId, targetVersion.filesSnapshot);
      return updatedSkill;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_VERSION_DELETE,
    async (_, skillId: string, versionId: string) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error("skill:versionDelete requires a non-empty skillId");
      }
      if (typeof versionId !== "string" || versionId.trim().length === 0) {
        throw new Error("skill:versionDelete requires a non-empty versionId");
      }
      return db.deleteVersion(skillId, versionId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_DELETE_ALL,
    async (_, confirm?: boolean) => {
      // Require explicit confirmation to prevent accidental deletion
      if (confirm !== true) {
        throw new Error(
          "skill:deleteAll requires explicit confirmation (pass true)",
        );
      }
      try {
        await SkillInstaller.deleteAllLocalRepos();
      } catch (error) {
        console.warn("Failed to delete all local repos:", error);
      }
      return db.deleteAll();
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_INSERT_VERSION_DIRECT,
    async (_, version: SkillVersion) => {
      if (!version || typeof version !== "object") {
        throw new Error(
          "skill:insertVersionDirect requires a non-null version object",
        );
      }
      // Field-level validation for required properties
      if (typeof version.id !== "string" || version.id.trim().length === 0) {
        throw new Error("skill:insertVersionDirect requires a non-empty id");
      }
      if (
        typeof version.skillId !== "string" ||
        version.skillId.trim().length === 0
      ) {
        throw new Error(
          "skill:insertVersionDirect requires a non-empty skill_id",
        );
      }
      if (
        typeof version.version !== "number" ||
        !Number.isFinite(version.version) ||
        version.version < 0
      ) {
        throw new Error(
          "skill:insertVersionDirect requires version to be a non-negative finite number",
        );
      }
      if (
        !isValidSkillVersionCreatedAt(version.createdAt)
      ) {
        throw new Error(
          "skill:insertVersionDirect requires createdAt to be a valid ISO date string or finite timestamp",
        );
      }
      return db.insertVersionDirect(version);
    },
  );
}
