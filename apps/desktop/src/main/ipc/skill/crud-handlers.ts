import { ipcMain } from "electron";
import { zipSync } from "fflate";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import { SkillInstaller } from "../../services/skill-installer";
import { isInternalSkillRepoEntry } from "../../services/skill-installer-repo";
import { ensureLocalRepoPath } from "./shared";
import {
  createLibrarySkill,
  updateLibrarySkill,
  deleteLibrarySkill,
} from "../../services/skill-library-crud";
import type {
  CreateSkillParams,
  SkillDeleteOptions,
  SkillSafetyScanInput,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
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
        parseGitRepo(data.source_url) &&
        !data.content &&
        !data.instructions
      ) {
        throw new Error(
          "Remote Skill packages must use skill:runPackageOperation so staging and safety review cannot be bypassed",
        );
      }

      // Strip overwriteExisting from IPC — only internal callers (e2e
      // seeding) should be able to silently overwrite existing skills.
      // Renderer-initiated creates must go through the normal
      // duplicate-name check in SkillDB.create().
      const safeOptions = options
        ? { skipInitialVersion: options.skipInitialVersion }
        : undefined;

      return createLibrarySkill(db, data, safeOptions);
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

      return updateLibrarySkill(db, id, data);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_DELETE,
    async (_, id: string, options?: SkillDeleteOptions) => {
      if (typeof id !== "string" || id.trim().length === 0) {
        throw new Error("skill:delete requires a non-empty id");
      }
      if (
        options !== undefined &&
        (!options || typeof options !== "object" || Array.isArray(options))
      ) {
        throw new Error("skill:delete options must be an object");
      }

      if (
        options?.removeCopyInstallations !== undefined &&
        typeof options.removeCopyInstallations !== "boolean"
      ) {
        throw new Error(
          "skill:delete removeCopyInstallations must be a boolean",
        );
      }
      return deleteLibrarySkill(db, id, options);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_SCAN_LOCAL, async () =>
    SkillInstaller.scanLocal(db),
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SCAN_LOCAL_PREVIEW,
    async (
      _,
      customPaths?: string[],
      aiConfig?: SkillSafetyScanInput["aiConfig"],
    ) => {
      if (customPaths !== undefined && !Array.isArray(customPaths)) {
        throw new Error(
          "skill:scanLocalPreview expects customPaths to be an array",
        );
      }
      return SkillInstaller.scanLocalPreview(customPaths, db, aiConfig);
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

  ipcMain.handle(IPC_CHANNELS.SKILL_EXPORT_ZIP, async (_, id: string) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error("skill:exportZip requires a non-empty id");
    }

    const skill = db.getById(id);
    if (!skill) {
      throw new Error("Skill not found");
    }

    const repoPath = await ensureLocalRepoPath(db, id);
    if (!repoPath) {
      throw new Error(`Unable to resolve local repo for skill: ${id}`);
    }

    const fileEntries =
      await SkillInstaller.readLocalRepoFileBuffersByPath(repoPath);

    if (fileEntries.length === 0) {
      throw new Error(`Skill repo is empty: ${skill.name}`);
    }

    const zipFiles: Record<string, Uint8Array> = {};

    for (const file of fileEntries) {
      if (isInternalSkillRepoEntry(file.path)) {
        continue;
      }
      zipFiles[file.path.replace(/\\/g, "/")] = file.data;
    }

    const zipped = zipSync(zipFiles, { level: 1 });

    return {
      fileName: `${skill.name}.zip`,
      base64: Buffer.from(zipped).toString("base64"),
    };
  });

  ipcMain.handle(IPC_CHANNELS.SKILL_IMPORT, async (_, jsonContent: string) => {
    if (typeof jsonContent !== "string" || jsonContent.trim().length === 0) {
      throw new Error("skill:import requires a non-empty JSON content string");
    }
    const id = await SkillInstaller.importFromJson(jsonContent, db);
    return db.getById(id);
  });
}
