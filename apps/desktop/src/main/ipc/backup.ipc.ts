import { app, ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";

import {
  createUpgradeDataSnapshot,
  deleteUpgradeBackup,
  listUpgradeBackups,
} from "../services/upgrade-backup";
import { restoreFromUpgradeBackupAsync } from "../services/upgrade-backup-restore";
import { closeDatabase, initDatabase } from "../database";

type SetDbRef = (db: ReturnType<typeof initDatabase>) => void;

export function registerBackupIPC(setDbRef: SetDbRef): void {
  ipcMain.handle(IPC_CHANNELS.UPGRADE_BACKUP_LIST, async () => {
    return listUpgradeBackups(app.getPath("userData"));
  });

  ipcMain.handle(
    IPC_CHANNELS.UPGRADE_BACKUP_CREATE,
    async (
      _event,
      options?: {
        fromVersion?: string;
        toVersion?: string;
      },
    ) => {
      try {
        const snapshot = await createUpgradeDataSnapshot(app.getPath("userData"), {
          fromVersion:
            typeof options?.fromVersion === "string" &&
            options.fromVersion.trim().length > 0
              ? options.fromVersion
              : app.getVersion(),
          toVersion:
            typeof options?.toVersion === "string" && options.toVersion.trim().length > 0
              ? options.toVersion
              : undefined,
        });

        return {
          created: true,
          skipped: false,
          backupId: snapshot.backupId,
          backupPath: snapshot.backupPath,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/user data path is empty/i.test(message)) {
          return {
            created: false,
            skipped: true,
            reason: "user-data-empty",
          };
        }
        if (/user data path does not exist/i.test(message)) {
          return {
            created: false,
            skipped: true,
            reason: "user-data-missing",
          };
        }
        throw error;
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UPGRADE_BACKUP_DELETE,
    async (_event, backupId: string) => {
      if (typeof backupId !== "string" || backupId.trim().length === 0) {
        throw new Error("backupId is required");
      }

      await deleteUpgradeBackup(app.getPath("userData"), backupId);
      return { success: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UPGRADE_BACKUP_RESTORE,
    async (_event, backupId: string) => {
      closeDatabase();
      const result = await restoreFromUpgradeBackupAsync(
        app.getPath("userData"),
        backupId,
      );

      if (!result.success) {
        setDbRef(initDatabase());
      }

      if (result.success && result.needsRestart) {
        setTimeout(() => {
          app.relaunch();
          app.quit();
        }, 1500);
      }

      return result;
    },
  );
}
