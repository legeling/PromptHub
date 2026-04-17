import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  UpgradeBackupCreateResult,
  UpgradeBackupEntry,
  UpgradeBackupRestoreResult,
} from "@prompthub/shared/types";

export const upgradeBackupApi = {
  list: (): Promise<UpgradeBackupEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPGRADE_BACKUP_LIST),
  create: (options?: {
    fromVersion?: string;
    toVersion?: string;
  }): Promise<UpgradeBackupCreateResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPGRADE_BACKUP_CREATE, options),
  restore: (backupId: string): Promise<UpgradeBackupRestoreResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPGRADE_BACKUP_RESTORE, backupId),
  delete: (backupId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPGRADE_BACKUP_DELETE, backupId),
};
