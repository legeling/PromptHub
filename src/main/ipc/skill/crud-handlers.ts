import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../../shared/constants";
import { SkillInstaller } from "../../services/skill-installer";
import type {
  CreateSkillParams,
  UpdateSkillParams,
} from "../../../shared/types";
import type { SkillIPCContext } from "./shared";

export function registerSkillCrudHandlers({ db }: SkillIPCContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SKILL_CREATE,
    async (
      _,
      data: CreateSkillParams,
      options?: { skipInitialVersion?: boolean; overwriteExisting?: boolean },
    ) => {
      if (
        !data ||
        !data.name ||
        typeof data.name !== "string" ||
        data.name.trim().length === 0
      ) {
        throw new Error("skill:create requires a non-empty name field");
      }

      if (
        data.source_url &&
        data.source_url.includes("github.com") &&
        !data.content &&
        !data.instructions
      ) {
        const id = await SkillInstaller.installFromGithub(data.source_url, db);
        return db.getById(id);
      }

      return db.create(data, options);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_GET, async (_, id: string) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("skill:get requires a non-empty id");
    }
    return db.getById(id);
  });

  ipcMain.handle(IPC_CHANNELS.SKILL_GET_ALL, async () => db.getAll());

  ipcMain.handle(
    IPC_CHANNELS.SKILL_UPDATE,
    async (_, id: string, data: UpdateSkillParams) => {
      if (typeof id !== "string" || id.trim().length === 0) {
        throw new Error("skill:update requires a non-empty id");
      }
      if (!data || typeof data !== "object") {
        throw new Error("skill:update requires a non-null data object");
      }

      const existingSkill = db.getById(id);
      if (!existingSkill) {
        return null;
      }

      const nextName =
        typeof data.name === "string" ? data.name.trim() : undefined;
      const isRenaming =
        typeof nextName === "string" && nextName !== existingSkill.name;
      const nextData: UpdateSkillParams = { ...data };
      let deployedPlatforms: string[] = [];

      if (isRenaming && nextName) {
        try {
          const platformStatus =
            await SkillInstaller.getSkillMdInstallStatus(existingSkill.name);
          deployedPlatforms = Object.entries(platformStatus)
            .filter(([, installed]) => installed)
            .map(([platformId]) => platformId);
        } catch (error) {
          console.warn(
            `Failed to inspect deployed status before renaming "${existingSkill.name}":`,
            error,
          );
        }

        const migratedRepoPath = await SkillInstaller.renameManagedLocalRepo(
          existingSkill.name,
          nextName,
          existingSkill.local_repo_path,
        );
        if (migratedRepoPath !== existingSkill.local_repo_path) {
          nextData.local_repo_path = migratedRepoPath ?? undefined;
        }
        nextData.name = nextName;
      }

      const updatedSkill = db.update(id, nextData);

      if (updatedSkill && isRenaming && nextName && deployedPlatforms.length > 0) {
        const nextContent =
          updatedSkill.instructions ??
          updatedSkill.content ??
          existingSkill.instructions ??
          existingSkill.content ??
          "";

        await Promise.allSettled(
          deployedPlatforms.map(async (platformId) => {
            if (nextContent.trim()) {
              await SkillInstaller.installSkillMd(nextName, nextContent, platformId);
            }
            await SkillInstaller.uninstallSkillMd(existingSkill.name, platformId);
          }),
        );
      }

      return updatedSkill;
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_DELETE, async (_, id: string) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("skill:delete requires a non-empty id");
    }

    const skill = db.getById(id);
    if (skill?.name) {
      // Only uninstall SKILL.md from platforms, do NOT delete the source directory.
      // Deletion from PromptHub only removes the library record, not the original files.
      // 仅从各平台卸载 SKILL.md，不删除源目录。
      // 从 PromptHub 删除只移除库记录，不影响原始文件。
      try {
        const platforms = SkillInstaller.getSupportedPlatforms();
        await Promise.allSettled(
          platforms.map((platform) =>
            SkillInstaller.uninstallSkillMd(skill.name, platform.id),
          ),
        );
      } catch (error) {
        console.warn(
          `Failed to uninstall SKILL.md for skill "${skill.name}":`,
          error,
        );
      }
    }

    return db.delete(id);
  });

  ipcMain.handle(IPC_CHANNELS.SKILL_SCAN_LOCAL, async () =>
    SkillInstaller.scanLocal(db),
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SCAN_LOCAL_PREVIEW,
    async (_, customPaths?: string[]) => {
      if (customPaths !== undefined && !Array.isArray(customPaths)) {
        throw new Error(
          "skill:scanLocalPreview expects customPaths to be an array",
        );
      }
      return SkillInstaller.scanLocalPreview(customPaths);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_EXPORT, async (_, id: string, format) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("skill:export requires a non-empty id");
    }
    if (format !== "skillmd" && format !== "json") {
      throw new Error("skill:export format must be 'skillmd' or 'json'");
    }
    const skill = db.getById(id);
    if (!skill) throw new Error("Skill not found");
    return format === "skillmd"
      ? SkillInstaller.exportAsSkillMd(skill)
      : SkillInstaller.exportAsJson(skill);
  });

  ipcMain.handle(IPC_CHANNELS.SKILL_IMPORT, async (_, jsonContent: string) => {
    if (typeof jsonContent !== "string" || jsonContent.trim().length === 0) {
      throw new Error("skill:import requires a non-empty JSON content string");
    }
    const id = await SkillInstaller.importFromJson(jsonContent, db);
    return db.getById(id);
  });
}
