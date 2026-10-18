import { BrowserWindow, ipcMain } from "electron";
import {
  createSkillZip,
  skillExportFileName,
} from "@prompthub/core/skills/export";
import { encodeSkillFileSnapshot } from "@prompthub/shared/utils/skill-file-snapshot";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type { SkillExportSaveResult } from "@prompthub/shared/types/skill-export";
import {
  exportAsSkillMd,
  exportAsJson,
} from "../../services/skill-installer-export";
import {
  isInternalSkillRepoEntry,
  readLocalRepoFileBuffersByPath,
} from "../../services/skill-installer-repo";
import { saveSkillExportFile } from "../../services/skill-export-save";
import { ensureLocalRepoPath, type SkillIPCContext } from "./shared";

function getExportSkill(db: SkillIPCContext["db"], id: unknown) {
  if (typeof id !== "string" || !id.trim())
    throw new Error("Skill export requires a non-empty id");
  const skill = db.getById(id);
  if (!skill) throw new Error("Skill not found");
  return skill;
}

async function createZip(
  db: SkillIPCContext["db"],
  id: string,
): Promise<Uint8Array> {
  const repoPath = await ensureLocalRepoPath(db, id);
  if (!repoPath) throw new Error("Unable to resolve local Skill repo");
  const entries = await readLocalRepoFileBuffersByPath(repoPath);
  return createSkillZip(
    entries
      .filter((file) => !isInternalSkillRepoEntry(file.path))
      .map((file) =>
        encodeSkillFileSnapshot(file.path.replace(/\\/g, "/"), file.data),
      ),
  );
}

export function registerSkillExportHandlers({ db }: SkillIPCContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SKILL_EXPORT,
    (_, id: string, format: unknown) => {
      const skill = getExportSkill(db, id);
      if (format !== "skillmd" && format !== "json")
        throw new Error("Invalid Skill export format");
      return format === "skillmd"
        ? exportAsSkillMd(skill)
        : exportAsJson(skill);
    },
  );
  ipcMain.handle(IPC_CHANNELS.SKILL_EXPORT_ZIP, async (_, id: string) => {
    const skill = getExportSkill(db, id);
    return {
      fileName: skillExportFileName(skill.name, "zip"),
      base64: Buffer.from(await createZip(db, id)).toString("base64"),
    };
  });
  ipcMain.handle(
    IPC_CHANNELS.SKILL_SAVE_EXPORT,
    (event, id: unknown, format: unknown) => saveExport(db, event, id, format),
  );
}

async function saveExport(
  db: SkillIPCContext["db"],
  event: Electron.IpcMainInvokeEvent,
  id: unknown,
  format: unknown,
): Promise<SkillExportSaveResult> {
  try {
    const skill = getExportSkill(db, id);
    if (format !== "skillmd" && format !== "zip")
      throw new Error("Invalid Skill file export format");
    const data =
      format === "zip"
        ? await createZip(db, skill.id)
        : Buffer.from(exportAsSkillMd(skill), "utf8");
    return await saveSkillExportFile(
      {
        fileName: skillExportFileName(
          skill.name,
          format === "zip" ? "zip" : "md",
        ),
        data,
        extension: format === "zip" ? "zip" : "md",
      },
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
    );
  } catch (error) {
    console.error("Failed to save Skill export", error);
    return { status: "failed" };
  }
}
