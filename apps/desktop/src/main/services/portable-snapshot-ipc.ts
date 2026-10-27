import { registerWorkspaceSnapshotIPC } from "./workspace-snapshot-ipc";
import path from "path";

import { dialog, ipcMain, safeStorage } from "electron";

import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";

import { closeDatabase, initDatabase } from "../database";
import {
  getCacheDir,
  getDataDir,
  getDatabasePath,
  getImagesDir,
  getPromptsWorkspaceDir,
  getRulesDir,
  getSkillsDir,
  getUserDataPath,
  getVideosDir,
  getWorkspaceDir,
} from "../runtime-paths";
import { exportWorkspaceArchive } from "./workspace-snapshot-service";
import {
  createPortableSnapshotZip,
  isCompleteCanonicalPortableScope,
} from "./portable-snapshot-archive";
import {
  previewPortableSnapshotArchive,
  restorePortableLogicalSnapshot,
  restorePortableSnapshotArchive,
} from "./portable-snapshot-restore";

interface ExportZipScope {
  prompts: boolean;
  versions: boolean;
  images: boolean;
  videos?: boolean;
  skills: boolean;
  rules?: boolean;
  mcp?: boolean;
  plugins?: boolean;
  agents?: boolean;
  generations?: boolean;
  config: boolean;
  aiConfigJson?: string;
  settingsJson?: string;
  exportJson?: string;
}

function portableSourcePaths() {
  return {
    rootPath: getUserDataPath(),
    cachePath: getCacheDir(),
    promptsPath: getPromptsWorkspaceDir(),
    versionsPath: path.join(getWorkspaceDir(), ".versions"),
    skillsPath: getSkillsDir(),
    rulesPath: getRulesDir(),
    ruleDatabasePath: getDatabasePath(),
    pluginsPath: path.join(getDataDir(), "plugins"),
    pluginDatabasePath: getDatabasePath(),
    mcpPath: path.join(getDataDir(), "mcp"),
    mcpDatabasePath: getDatabasePath(),
    agentProviderDatabasePath: getDatabasePath(),
    generationDatabasePath: getDatabasePath(),
    imagesPath: getImagesDir(),
    videosPath: getVideosDir(),
  };
}

function registerExportHandler(onDatabaseReopened?: () => void): void {
  ipcMain.handle(
    "data:exportZip",
    async (_event, params: { scope: ExportZipScope }) => {
      try {
        const date = new Date().toISOString().split("T")[0];
        const selected = await dialog.showSaveDialog({
          title: "导出数据",
          defaultPath: `prompthub-export-${date}.zip`,
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
        });
        if (selected.canceled || !selected.filePath) return { canceled: true };
        const scope = params.scope;
        const normalizedScope = {
          ...scope,
          generations: scope.generations ?? scope.images,
        };
        if (
          isCompleteCanonicalPortableScope(normalizedScope) &&
          normalizedScope.config &&
          normalizedScope.settingsJson &&
          normalizedScope.aiConfigJson
        ) {
          await exportWorkspaceArchive(selected.filePath, onDatabaseReopened);
          return { canceled: false, filePath: selected.filePath };
        }
        const result = await createPortableSnapshotZip({
          destinationPath: selected.filePath,
          sourcePaths: portableSourcePaths(),
          scope: normalizedScope,
        });
        return { canceled: false, filePath: result.filePath };
      } catch (error) {
        return {
          canceled: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}

function registerPreviewHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.DATA_PORTABLE_PREVIEW,
    (_event, archivePath: string) => {
      try {
        if (
          typeof archivePath !== "string" ||
          archivePath.trim().length === 0
        ) {
          throw new Error("Portable snapshot path is required");
        }
        return {
          success: true,
          ...previewPortableSnapshotArchive({
            archivePath,
            cacheRoot: getCacheDir(),
          }),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}

export function registerPortableSnapshotIPC(
  scheduleRelaunch: (delayMs: number) => void,
  onDatabaseReopened?: () => void,
): void {
  registerWorkspaceSnapshotIPC(scheduleRelaunch, onDatabaseReopened);
  registerExportHandler(onDatabaseReopened);
  registerPreviewHandler();
  ipcMain.handle(
    IPC_CHANNELS.DATA_PORTABLE_RESTORE,
    async (_event, archivePath: string) => {
      if (typeof archivePath !== "string" || archivePath.trim().length === 0) {
        return {
          success: false,
          needsRestart: false,
          error: "Portable snapshot path is required",
        };
      }
      closeDatabase();
      const result = await restorePortableSnapshotArchive({
        archivePath,
        activeRoot: getUserDataPath(),
        cacheRoot: getCacheDir(),
        encryption: safeStorage,
      });
      if (result.success) scheduleRelaunch(500);
      else {
        initDatabase();
        onDatabaseReopened?.();
      }
      return result;
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.DATA_PORTABLE_LOGICAL_RESTORE,
    async (_event, logicalText: string) => {
      if (typeof logicalText !== "string" || logicalText.length === 0) {
        return {
          success: false,
          needsRestart: false,
          error: "Portable logical snapshot is required",
        };
      }
      closeDatabase();
      const result = await restorePortableLogicalSnapshot({
        logicalText,
        activeRoot: getUserDataPath(),
        encryption: safeStorage,
      });
      if (result.success) scheduleRelaunch(500);
      else {
        initDatabase();
        onDatabaseReopened?.();
      }
      return result;
    },
  );
}
