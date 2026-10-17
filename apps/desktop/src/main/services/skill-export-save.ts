import { app, dialog, type BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { SkillExportSaveResult } from "@prompthub/shared/types/skill-export";

export interface SkillExportFile {
  fileName: string;
  data: Uint8Array;
  extension: "md" | "zip";
}

export async function saveSkillExportFile(
  file: SkillExportFile,
  parent?: BrowserWindow,
): Promise<SkillExportSaveResult> {
  const options = {
    defaultPath: path.join(app.getPath("downloads"), file.fileName),
    filters: [
      {
        name: file.extension === "zip" ? "ZIP" : "Markdown",
        extensions: [file.extension],
      },
    ],
  };
  const selection = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);
  if (selection.canceled || !selection.filePath) return { status: "canceled" };
  const target = selection.filePath;
  const stage = path.join(
    path.dirname(target),
    `.prompthub-export-${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(stage, file.data, { flag: "wx" });
    await fs.rename(stage, target);
    return { status: "saved", fileName: path.basename(target) };
  } finally {
    await fs.rm(stage, { force: true }).catch((error: unknown) => {
      console.warn("Failed to clean up Skill export staging file", error);
    });
  }
}
